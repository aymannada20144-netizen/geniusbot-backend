'use strict';

const {
  createSemanticCoreResult,
} = require('../../contracts/shaden/SemanticCoreResult');
const {
  bridgeSemanticInteraction,
} = require('./SemanticInteractionBridge');
const {
  CONFIDENCE_THRESHOLD,
} = require('./SemanticCorePolicy');

const GOAL_TO_INTENT = Object.freeze({
  information: 'services',
  booking: 'booking',
  availability: 'availability_request',
  appointment_query: 'appointment_query',
  appointment_cancel: 'appointment_cancellation',
  appointment_reschedule: 'appointment_reschedule',
  human_handover: 'human_handover_request',
  social_engagement: 'small_talk',
});
const ACT_TO_LEGACY = Object.freeze({
  inform: 'statement', request: 'request', accept: 'confirmation',
  reject: 'rejection', correct: 'correction', complaint: 'complaint',
  objection: 'statement', hesitation: 'statement', social: 'statement',
});
const SIGNAL_KEYS = Object.freeze([
  'confirmation', 'rejection', 'correction', 'interruption', 'conditional',
  'hesitation', 'objection', 'complaint', 'medicalQuestion', 'medicalRisk',
  'humanHandover', 'legalEscalation', 'botFrustration', 'abuseOrThreat',
]);

class SemanticCoreCompatibilityProvider {
  constructor({ semanticCoreProvider } = {}) {
    if (typeof semanticCoreProvider?.understand !== 'function') {
      throw new TypeError('SemanticCoreCompatibilityProvider requires semanticCoreProvider.understand().');
    }
    this.semanticCoreProvider = semanticCoreProvider;
  }

  async understand({ text, context } = {}) {
    return (await this.understandWithInteractionEvent({ text, context }))
      .understanding;
  }

  async understandWithInteractionEvent({ text, context } = {}) {
    if (!context?.active || !context?.pending) throw incompatible();
    const core = createSemanticCoreResult(
      await this.semanticCoreProvider.understand({ text, context })
    );
    if (
      core.confidence < CONFIDENCE_THRESHOLD ||
      core.interpretation.status !== 'clear' ||
      core.primaryGoal !== context.active.goal ||
      core.additionalGoals.length !== 0 ||
      core.mentionedEntities.length !== 0
    ) throw incompatible();

    const primaryIntent = legacyIntent(core.primaryGoal, context.pending.targetType);
    if (!primaryIntent) throw incompatible();
    return Object.freeze({
      understanding: legacyResult(core, primaryIntent),
      interactionEvent: bridgeSemanticInteraction({
        semanticResult: core,
        context,
      }),
    });
  }
}

function legacyIntent(goal, targetType) {
  if (goal !== 'appointment_change') return GOAL_TO_INTENT[goal] || null;
  return {
    service: 'appointment_change_service',
    branch: 'appointment_change_branch',
    provider: 'appointment_change_provider',
  }[targetType] || null;
}

function legacyResult(core, primaryIntent) {
  const signals = Object.fromEntries(SIGNAL_KEYS.map((key) => [key, false]));
  signals.confirmation = core.conversationAct === 'accept';
  signals.rejection = core.conversationAct === 'reject';
  signals.correction = core.conversationAct === 'correct';
  signals.complaint = core.conversationAct === 'complaint';
  signals.objection = core.conversationAct === 'objection';
  signals.hesitation = core.conversationAct === 'hesitation';
  signals.humanHandover = core.primaryGoal === 'human_handover';
  return {
    version: 1,
    conversationAct: ACT_TO_LEGACY[core.conversationAct],
    primaryIntent,
    knowledgeTopic: null,
    secondaryIntents: [],
    entities: {
      serviceMentions: [], branchMentions: [], providerMentions: [],
      dateTimeMentions: [], bookingReference: null,
      appointmentManagementTarget: 'unspecified', corrections: [],
    },
    signals,
    sentiment: 'neutral',
    confidence: core.confidence,
    ambiguity: {
      requiresClarification: false, reason: 'none', candidateIntents: [],
      ambiguousEntityTypes: [],
    },
  };
}

function incompatible() {
  return new Error('Semantic Core evidence is incompatible with authoritative context.');
}

module.exports = SemanticCoreCompatibilityProvider;
module.exports.CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD;
