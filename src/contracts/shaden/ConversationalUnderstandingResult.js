'use strict';

const ALLOWED_PRIMARY_INTENTS = new Set([
  'unknown',

  // Social / conversational
  'greeting',
  'courtesy',
  'farewell',
  'acknowledgement',
  'identity',
  'presence',
  'small_talk',

  // Clinic information
  'services',
  'specialties',
  'branches',
  'branch_address',
  'working_hours',
  'payment_methods',
  'insurance',
  'price_inquiry',

  // Booking / appointment management
  'booking',
  'availability_request',
  'appointment_query',
  'appointment_cancellation',
  'appointment_reschedule',
  'appointment_change_service',
  'appointment_change_branch',
  'appointment_change_provider',

  // Conversational situations
  'complaint',
  'objection',
  'hesitation',
  'medical_question',
  'human_handover_request',
]);

const ALLOWED_CONVERSATION_ACTS = new Set([
  'statement',
  'question',
  'request',
  'confirmation',
  'rejection',
  'correction',
  'clarification',
  'complaint',
  'thanks',
  'greeting',
  'farewell',
]);

const ALLOWED_SENTIMENTS = new Set([
  'positive',
  'neutral',
  'negative',
  'frustrated',
  'angry',
  'worried',
]);
const ALLOWED_KNOWLEDGE_TOPICS = new Set([
  'preparation',
  'aftercare',
  'comparison',
]);

function createConversationalUnderstandingResult(input = {}) {
  const result = {
    version: 1,

    primaryIntent: normalizePrimaryIntent(input.primaryIntent),

    knowledgeTopic: normalizeKnowledgeTopic(input.knowledgeTopic),

    secondaryIntents: normalizeStringArray(input.secondaryIntents),

    entities: normalizeEntities(input.entities),

    conversationAct: normalizeConversationAct(input.conversationAct),

    sentiment: normalizeSentiment(input.sentiment),

    signals: {
      confirmation: input.signals?.confirmation === true,
      rejection: input.signals?.rejection === true,
      correction: input.signals?.correction === true,
      interruption: input.signals?.interruption === true,
      conditional: input.signals?.conditional === true,
      hesitation: input.signals?.hesitation === true,
      objection: input.signals?.objection === true,
      complaint: input.signals?.complaint === true,
      medicalQuestion: input.signals?.medicalQuestion === true,
      medicalRisk: input.signals?.medicalRisk === true,
      humanHandover: input.signals?.humanHandover === true,
      legalEscalation: input.signals?.legalEscalation === true,
      botFrustration: input.signals?.botFrustration === true,
      abuseOrThreat: input.signals?.abuseOrThreat === true,
      legalEscalation:
  input.signals?.legalEscalation === true,

botFrustration:
  input.signals?.botFrustration === true,

abuseOrThreat:
  input.signals?.abuseOrThreat === true,
    },

    confidence: normalizeConfidence(input.confidence),
  };

  return Object.freeze({
    ...result,
    secondaryIntents: Object.freeze([...result.secondaryIntents]),
    entities: Object.freeze({ ...result.entities }),
    signals: Object.freeze({ ...result.signals }),
  });
}

function normalizePrimaryIntent(value) {
  if (typeof value !== 'string') return 'unknown';
  return ALLOWED_PRIMARY_INTENTS.has(value) ? value : 'unknown';
}

function normalizeConversationAct(value) {
  if (typeof value !== 'string') return 'statement';
  return ALLOWED_CONVERSATION_ACTS.has(value) ? value : 'statement';
}

function normalizeSentiment(value) {
  if (typeof value !== 'string') return 'neutral';
  return ALLOWED_SENTIMENTS.has(value) ? value : 'neutral';
}

function normalizeConfidence(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return 0;

  if (numeric < 0) return 0;
  if (numeric > 1) return 1;

  return numeric;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function normalizeEntities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entities = {};

  for (const [key, entityValue] of Object.entries(value)) {
    if (!key.trim()) continue;

    if (key === 'serviceMentions') {
      const mentions = normalizeServiceMentions(entityValue);
      if (mentions.length > 0) entities.serviceMentions = mentions;
      continue;
    }

    if (
      entityValue === null ||
      typeof entityValue === 'string' ||
      typeof entityValue === 'number' ||
      typeof entityValue === 'boolean'
    ) {
      entities[key] = entityValue;
    }
  }

  return entities;
}

function normalizeKnowledgeTopic(value) {
  if (typeof value !== 'string') return null;
  return ALLOWED_KNOWLEDGE_TOPICS.has(value) ? value : null;
}

function normalizeServiceMentions(value) {
  if (!Array.isArray(value) || value.length > 8) return [];
  const roles = new Set(['current', 'requested', 'excluded', 'unspecified']);
  const result = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const keys = Object.keys(item);
    if (keys.some((key) => !['text', 'concept', 'role', 'confidence'].includes(key))) return [];
    if (typeof item.text !== 'string' || !item.text || item.text.length > 200) return [];
    if (item.concept !== null && (typeof item.concept !== 'string' || !item.concept || item.concept.length > 200)) return [];
    if (!roles.has(item.role)) return [];
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) return [];
    result.push(Object.freeze({
      text: item.text,
      concept: item.concept,
      role: item.role,
      confidence: item.confidence,
    }));
  }
  return Object.freeze(result);
}

module.exports = Object.freeze({
  createConversationalUnderstandingResult,
  ALLOWED_PRIMARY_INTENTS,
  ALLOWED_CONVERSATION_ACTS,
  ALLOWED_SENTIMENTS,
  ALLOWED_KNOWLEDGE_TOPICS,
});
