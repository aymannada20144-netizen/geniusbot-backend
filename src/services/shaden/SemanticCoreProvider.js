'use strict';

const ValidationError = require('../../core/errors/ValidationError');
const {
  createSemanticCoreResult,
} = require('../../contracts/shaden/SemanticCoreResult');
const {
  createSemanticContext,
} = require('../../contracts/shaden/SemanticContext');

const IDENTIFIER_PATTERN = /(?:\b(?:uuid|service[_-]?id|branch[_-]?id|provider[_-]?id|catalog[_-]?id|database[_-]?id)\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/iu;

class SemanticCoreProvider {
  constructor({ modelClient } = {}) {
    if (typeof modelClient?.inferSemanticCore !== 'function') {
      throw new TypeError(
        'SemanticCoreProvider requires modelClient.inferSemanticCore().'
      );
    }
    this.modelClient = modelClient;
  }

  async understand({ text, context } = {}) {
    const inboundText = requireInboundText(text);
    const input = { text: inboundText };
    if (context !== undefined) {
      input.context = createSemanticContext(context);
    }
    const raw = await this.modelClient.inferSemanticCore(input);
    const parsed = parseStructuredOutput(raw);
    const result = createSemanticCoreResult(parsed);
    assertEntityEvidence(result.mentionedEntities, inboundText);
    return result;
  }
}

function requireInboundText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) {
    throw new ValidationError(
      'Semantic core text must be a non-empty bounded string.'
    );
  }
  return value;
}

function parseStructuredOutput(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new ValidationError('Semantic core model output must be valid JSON.');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(
      'Semantic core model output must be an object or JSON object string.'
    );
  }
  return value;
}

function assertEntityEvidence(entities, sourceText) {
  const anchoredSource = normalizeForAnchor(sourceText);
  for (const entity of entities) {
    if (!anchoredSource.includes(normalizeForAnchor(entity.surfaceText))) {
      throw new ValidationError(
        'Semantic core entity surfaceText must be anchored in the inbound text.'
      );
    }
    assertNoAuthorityClaim(entity);
    assertConceptDoesNotExpand(entity);
  }
}

function assertNoAuthorityClaim(entity) {
  if (
    IDENTIFIER_PATTERN.test(entity.surfaceText) ||
    IDENTIFIER_PATTERN.test(entity.conceptText)
  ) {
    throw new ValidationError(
      'Semantic core entities must not contain identifiers or catalog authority.'
    );
  }
}

function assertConceptDoesNotExpand(entity) {
  const surfaceTokens = evidenceTokens(entity.surfaceText);
  const conceptTokens = evidenceTokens(entity.conceptText);
  if (
    conceptTokens.length === 0 ||
    conceptTokens.some((token) => !surfaceTokens.includes(token))
  ) {
    throw new ValidationError(
      'Semantic core conceptText must not be more specific than surfaceText.'
    );
  }
}

function evidenceTokens(value) {
  return normalizeArabic(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stripArabicClitics);
}

function stripArabicClitics(value) {
  if (!/[\u0600-\u06ff]/u.test(value)) return value;
  return value.replace(/^(?:و|ف)?(?:بال|كال|لل|ال|ب|ك|ل)/u, '');
}

function normalizeArabic(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, '')
    .replace(/[\u0622\u0623\u0625\u0671]/gu, '\u0627')
    .replace(/\u0649/gu, '\u064a')
    .replace(/\u0629/gu, '\u0647')
    .toLocaleLowerCase('ar')
    .trim();
}

function normalizeForAnchor(value) {
  return normalizeArabic(value).replace(/\s+/gu, ' ');
}

module.exports = SemanticCoreProvider;
