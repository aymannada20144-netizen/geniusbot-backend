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

function createConversationalUnderstandingResult(input = {}) {
  const result = {
    version: 1,

    primaryIntent: normalizePrimaryIntent(input.primaryIntent),

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

module.exports = Object.freeze({
  createConversationalUnderstandingResult,
  ALLOWED_PRIMARY_INTENTS,
  ALLOWED_CONVERSATION_ACTS,
  ALLOWED_SENTIMENTS,
});