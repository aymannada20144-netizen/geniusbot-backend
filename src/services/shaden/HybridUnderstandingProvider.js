'use strict';

const {
  createConversationalUnderstandingResult,
} = require('../../contracts/shaden/ConversationalUnderstandingResult');
const {
  createSemanticUnderstandingResult,
} = require('../../contracts/shaden/SemanticUnderstandingResult');

const SEMANTIC_CONFIDENCE_THRESHOLD = 0.85;
const DETERMINISTIC_CONFIDENCE_THRESHOLD = 0.85;
const SEMANTIC_CORE_TIMEOUT_MS = 10000;

const STATE_DEPENDENT_SIGNALS = new Set([
  'confirmation',
  'rejection',
  'conditional',
  'interruption',
]);

const SAFETY_SIGNALS = new Set([
  'medicalRisk',
  'legalEscalation',
  'abuseOrThreat',
  'humanHandover',
]);

const SENTIMENT_PRIORITY = Object.freeze({
  neutral: 0,
  positive: 1,
  negative: 2,
  worried: 3,
  frustrated: 4,
  angry: 5,
});

class HybridUnderstandingProvider {
  constructor({
    deterministicProvider,
    semanticProvider = null,
    semanticCoreProvider = null,
    semanticCoreTimeoutMs = SEMANTIC_CORE_TIMEOUT_MS,
  } = {}) {
    if (typeof deterministicProvider?.understand !== 'function') {
      throw new TypeError(
        'HybridUnderstandingProvider requires deterministicProvider.understand().'
      );
    }
    if (
      semanticProvider !== null &&
      typeof semanticProvider?.understand !== 'function'
    ) {
      throw new TypeError(
        'HybridUnderstandingProvider semanticProvider must provide understand().'
      );
    }
    this.deterministicProvider = deterministicProvider;
    this.semanticProvider = semanticProvider;
    this.semanticCoreProvider = semanticCoreProvider;
    this.semanticCoreTimeoutMs = semanticCoreTimeoutMs;
  }

  async understand(input = {}) {
    return (await this.understandWithMetadata(input)).understanding;
  }

  async understandWithMetadata(input = {}) {
    const deterministic = createConversationalUnderstandingResult(
      await this.deterministicProvider.understand(input)
    );

    if (shouldUseSemanticCore(this.semanticCoreProvider, deterministic, input)) {
      try {
        const raw = typeof this.semanticCoreProvider
          .understandWithInteractionEvent === 'function'
          ? await withTimeout(
            this.semanticCoreProvider.understandWithInteractionEvent(input),
            this.semanticCoreTimeoutMs
          )
          : {
            understanding: await withTimeout(
              this.semanticCoreProvider.understand(input),
              this.semanticCoreTimeoutMs
            ),
            interactionEvent: null,
          };
        const contextual = createSemanticUnderstandingResult(raw.understanding);
        return metadata(
          mergeUnderstanding(deterministic, contextual),
          raw.interactionEvent
        );
      } catch {
        // Contextual semantics fail open to the unchanged legacy path.
      }
    }

    if (!this.semanticProvider) return metadata(deterministic);

    let semantic;
    try {
      semantic = createSemanticUnderstandingResult(
        await this.semanticProvider.understand(input)
      );
    } catch {
      return metadata(deterministic);
    }

    return metadata(mergeUnderstanding(deterministic, semantic));
  }
}

function metadata(understanding, interactionEvent = null) {
  return Object.freeze({ understanding, interactionEvent });
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new TypeError('Semantic Core timeout must be positive.'));
  }
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Semantic Core inference timed out.')),
        timeoutMs
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function shouldUseSemanticCore(provider, deterministic, input) {
  if (typeof provider?.understand !== 'function') return false;
  if (input?.interactive === true) return false;
  if (!input?.context?.active || !input?.context?.pending) return false;
  if (
    deterministic.primaryIntent !== 'unknown' ||
    deterministic.confidence >= DETERMINISTIC_CONFIDENCE_THRESHOLD
  ) return false;
  const signals = deterministic.signals || {};
  return !['confirmation', 'rejection', 'correction', 'interruption']
    .some((key) => signals[key] === true);
}

function mergeUnderstanding(deterministic, semantic) {
  const semanticEligible =
    semantic.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD &&
    semantic.ambiguity.requiresClarification === false;
  const deterministicExplicit =
    deterministic.primaryIntent !== 'unknown' &&
    deterministic.confidence >= DETERMINISTIC_CONFIDENCE_THRESHOLD;
  const sameIntent =
    deterministic.primaryIntent === semantic.primaryIntent;
  const semanticMedicalRefinesGenericServices =
    deterministic.primaryIntent === 'services' &&
    semantic.primaryIntent === 'medical_question';
  const deterministicAuthoritative = deterministicExplicit &&
    !semanticMedicalRefinesGenericServices;

  if (!semanticEligible) return deterministic;

  if (deterministicAuthoritative && !sameIntent) {
    return createConversationalUnderstandingResult({
      ...deterministic,
      signals: mergeSignals(deterministic.signals, semantic.signals, {
        semanticSafetyOnly: true,
      }),
    });
  }

  const semanticFillsUnknown = deterministic.primaryIntent === 'unknown' ||
    (!deterministicAuthoritative && !sameIntent);
  return createConversationalUnderstandingResult({
    primaryIntent: semanticFillsUnknown
      ? semantic.primaryIntent
      : deterministic.primaryIntent,
    knowledgeTopic: semantic.primaryIntent === 'medical_question'
      ? semantic.knowledgeTopic
      : null,
    secondaryIntents: compatibleSecondaryIntents({
      deterministic,
      semantic,
    }),
    entities: mergeEntities(deterministic.entities, semantic.entities),
    conversationAct: semanticFillsUnknown
      ? semantic.conversationAct
      : deterministic.conversationAct,
    sentiment: strongerSentiment(
      deterministic.sentiment,
      semantic.sentiment
    ),
    signals: mergeSignals(deterministic.signals, semantic.signals),
    confidence: semanticFillsUnknown
      ? semantic.confidence
      : Math.max(deterministic.confidence, semantic.confidence),
  });
}

function mergeEntities(deterministic, semantic) {
  const serviceMentions = Array.isArray(semantic?.serviceMentions)
    ? semantic.serviceMentions
    : [];
  return serviceMentions.length > 0
    ? { ...deterministic, serviceMentions }
    : deterministic;
}

function compatibleSecondaryIntents({ deterministic, semantic }) {
  const primaryIntent = deterministic.primaryIntent === 'unknown'
    ? semantic.primaryIntent
    : deterministic.primaryIntent;
  return [...new Set([
    ...deterministic.secondaryIntents,
    ...semantic.secondaryIntents,
  ])].filter((intent) => intent !== primaryIntent && intent !== 'unknown');
}

function mergeSignals(
  deterministic,
  semantic,
  { semanticSafetyOnly = false } = {}
) {
  const result = {};
  for (const key of Object.keys(deterministic)) {
    if (STATE_DEPENDENT_SIGNALS.has(key)) {
      result[key] = deterministic[key] === true;
      continue;
    }
    if (semanticSafetyOnly && !SAFETY_SIGNALS.has(key)) {
      result[key] = deterministic[key] === true;
      continue;
    }
    result[key] = deterministic[key] === true || semantic[key] === true;
  }
  return result;
}

function strongerSentiment(left, right) {
  return SENTIMENT_PRIORITY[right] > SENTIMENT_PRIORITY[left]
    ? right
    : left;
}

module.exports = HybridUnderstandingProvider;
module.exports.SEMANTIC_CONFIDENCE_THRESHOLD = SEMANTIC_CONFIDENCE_THRESHOLD;
module.exports.SEMANTIC_CORE_TIMEOUT_MS = SEMANTIC_CORE_TIMEOUT_MS;
