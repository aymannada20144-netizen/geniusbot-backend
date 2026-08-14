'use strict';

const ValidationError = require('../../core/errors/ValidationError');
const {
  createSemanticUnderstandingResult,
} = require('../../contracts/shaden/SemanticUnderstandingResult');

class SemanticUnderstandingProvider {
  constructor({ modelClient } = {}) {
    if (typeof modelClient?.inferUnderstanding !== 'function') {
      throw new TypeError('SemanticUnderstandingProvider requires modelClient.inferUnderstanding().');
    }
    this.modelClient = modelClient;
  }

  async understand(input = {}) {
    const text = requireMessageText(input.text);
    const raw = await this.modelClient.inferUnderstanding({ text });
    const parsed = parseModelOutput(raw);
    const result = createSemanticUnderstandingResult(parsed);
    assertEntitiesAnchored(result.entities, text);
    return result;
  }
}

function requireMessageText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) {
    throw new ValidationError('Semantic understanding text must be a non-empty bounded string.');
  }
  return value;
}

function parseModelOutput(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new ValidationError('Semantic model output must be valid JSON.');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Semantic model output must be an object or JSON object string.');
  }
  return value;
}

function assertEntitiesAnchored(entities, sourceText) {
  const source = normalizeForAnchor(sourceText);
  const texts = [
    ...entities.serviceMentions.map(({ text }) => text),
    ...entities.branchMentions.map(({ text }) => text),
    ...entities.providerMentions.map(({ text }) => text),
    ...entities.dateTimeMentions.map(({ text }) => text),
    ...entities.corrections.flatMap(({ fromText, toText }) => [fromText, toText]),
    ...(entities.bookingReference === null ? [] : [entities.bookingReference]),
  ];
  for (const text of texts) {
    if (!source.includes(normalizeForAnchor(text))) {
      throw new ValidationError('Semantic entity text must be anchored in the user message.');
    }
  }
}

function normalizeForAnchor(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

module.exports = SemanticUnderstandingProvider;
