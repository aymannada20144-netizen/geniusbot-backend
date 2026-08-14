'use strict';

const ValidationError = require('../../core/errors/ValidationError');

const PRIMARY_INTENTS = Object.freeze([
  'unknown', 'greeting', 'courtesy', 'farewell', 'acknowledgement',
  'identity', 'presence', 'small_talk', 'services', 'specialties',
  'branches', 'branch_address', 'working_hours', 'payment_methods',
  'insurance', 'price_inquiry', 'booking', 'availability_request',
  'appointment_query', 'appointment_cancellation',
  'appointment_reschedule', 'appointment_change_service',
  'appointment_change_branch', 'appointment_change_provider', 'complaint',
  'objection', 'hesitation', 'medical_question', 'human_handover_request',
]);
const CONVERSATION_ACTS = Object.freeze([
  'statement', 'question', 'request', 'confirmation', 'rejection',
  'correction', 'clarification', 'complaint', 'thanks', 'greeting', 'farewell',
]);
const SENTIMENTS = Object.freeze([
  'positive', 'neutral', 'negative', 'frustrated', 'angry', 'worried',
]);
const SIGNAL_KEYS = Object.freeze([
  'confirmation', 'rejection', 'correction', 'interruption', 'conditional',
  'hesitation', 'objection', 'complaint', 'medicalQuestion', 'medicalRisk',
  'humanHandover', 'legalEscalation', 'botFrustration', 'abuseOrThreat',
]);
const ENTITY_ROLES = Object.freeze(['current', 'requested', 'excluded', 'unspecified']);
const DATE_TIME_KINDS = Object.freeze(['date', 'time', 'datetime', 'relative_date', 'time_period']);
const TARGETS = Object.freeze(['unspecified', 'appointment', 'service', 'branch', 'provider', 'date_time', 'entire_booking']);
const CORRECTION_TYPES = Object.freeze(['service', 'branch', 'provider', 'date_time', 'intent']);
const AMBIGUITY_REASONS = Object.freeze([
  'none', 'intent_unclear', 'multiple_intents', 'service_unclear',
  'branch_unclear', 'provider_unclear', 'date_time_unclear',
  'appointment_target_unclear', 'reference_unclear', 'conflicting_information',
]);
const AMBIGUOUS_ENTITY_TYPES = Object.freeze([
  'service', 'branch', 'provider', 'date_time', 'booking_reference',
  'appointment_target',
]);

const LIMITS = Object.freeze({
  secondaryIntents: 5,
  mentions: 8,
  dateTimeMentions: 8,
  corrections: 5,
  candidateIntents: 5,
  ambiguousEntityTypes: 6,
  entityText: 200,
  bookingReference: 100,
});

const TOP_LEVEL_KEYS = Object.freeze([
  'version', 'conversationAct', 'primaryIntent', 'secondaryIntents',
  'entities', 'signals', 'sentiment', 'confidence', 'ambiguity',
]);
const ENTITY_KEYS = Object.freeze([
  'serviceMentions', 'branchMentions', 'providerMentions',
  'dateTimeMentions', 'bookingReference', 'appointmentManagementTarget',
  'corrections',
]);

const mentionSchema = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['text', 'role', 'confidence'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: LIMITS.entityText },
    role: { type: 'string', enum: ENTITY_ROLES },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
});
const SEMANTIC_UNDERSTANDING_JSON_SCHEMA = deepFreeze({
  type: 'object', additionalProperties: false, required: TOP_LEVEL_KEYS,
  properties: {
    version: { type: 'integer', const: 1 },
    conversationAct: { type: 'string', enum: CONVERSATION_ACTS },
    primaryIntent: { type: 'string', enum: PRIMARY_INTENTS },
    secondaryIntents: { type: 'array', maxItems: LIMITS.secondaryIntents, uniqueItems: true, items: { type: 'string', enum: PRIMARY_INTENTS } },
    entities: {
      type: 'object', additionalProperties: false, required: ENTITY_KEYS,
      properties: {
        serviceMentions: { type: 'array', maxItems: LIMITS.mentions, items: mentionSchema },
        branchMentions: { type: 'array', maxItems: LIMITS.mentions, items: mentionSchema },
        providerMentions: { type: 'array', maxItems: LIMITS.mentions, items: mentionSchema },
        dateTimeMentions: {
          type: 'array', maxItems: LIMITS.dateTimeMentions,
          items: {
            type: 'object', additionalProperties: false,
            required: ['text', 'kind', 'role', 'confidence'],
            properties: {
              text: { type: 'string', minLength: 1, maxLength: LIMITS.entityText },
              kind: { type: 'string', enum: DATE_TIME_KINDS },
              role: { type: 'string', enum: ENTITY_ROLES },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        bookingReference: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: LIMITS.bookingReference }] },
        appointmentManagementTarget: { type: 'string', enum: TARGETS },
        corrections: {
          type: 'array', maxItems: LIMITS.corrections,
          items: {
            type: 'object', additionalProperties: false,
            required: ['entityType', 'fromText', 'toText', 'confidence'],
            properties: {
              entityType: { type: 'string', enum: CORRECTION_TYPES },
              fromText: { type: 'string', minLength: 1, maxLength: LIMITS.entityText },
              toText: { type: 'string', minLength: 1, maxLength: LIMITS.entityText },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
    signals: {
      type: 'object', additionalProperties: false, required: SIGNAL_KEYS,
      properties: Object.fromEntries(SIGNAL_KEYS.map((key) => [key, { type: 'boolean' }])),
    },
    sentiment: { type: 'string', enum: SENTIMENTS },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    ambiguity: {
      type: 'object', additionalProperties: false,
      required: ['requiresClarification', 'reason', 'candidateIntents', 'ambiguousEntityTypes'],
      properties: {
        requiresClarification: { type: 'boolean' },
        reason: { type: 'string', enum: AMBIGUITY_REASONS },
        candidateIntents: { type: 'array', maxItems: LIMITS.candidateIntents, uniqueItems: true, items: { type: 'string', enum: PRIMARY_INTENTS } },
        ambiguousEntityTypes: { type: 'array', maxItems: LIMITS.ambiguousEntityTypes, uniqueItems: true, items: { type: 'string', enum: AMBIGUOUS_ENTITY_TYPES } },
      },
    },
  },
});

function createSemanticUnderstandingResult(input) {
  requirePlainObject(input, 'semantic understanding');
  exactKeys(input, TOP_LEVEL_KEYS, 'semantic understanding');
  if (input.version !== 1) invalid('Unsupported semantic understanding version.');

  const primaryIntent = enumValue(input.primaryIntent, PRIMARY_INTENTS, 'primaryIntent');
  const secondaryIntents = enumArray(
    input.secondaryIntents, PRIMARY_INTENTS, 'secondaryIntents',
    LIMITS.secondaryIntents, { disallow: new Set(['unknown', primaryIntent]) }
  );
  const entities = validateEntities(input.entities);
  const signals = validateSignals(input.signals);
  const ambiguity = validateAmbiguity(input.ambiguity);

  const result = {
    version: 1,
    conversationAct: enumValue(input.conversationAct, CONVERSATION_ACTS, 'conversationAct'),
    primaryIntent,
    secondaryIntents,
    entities,
    signals,
    sentiment: enumValue(input.sentiment, SENTIMENTS, 'sentiment'),
    confidence: confidence(input.confidence, 'confidence'),
    ambiguity,
  };
  return deepFreeze(result);
}

function validateEntities(value) {
  requirePlainObject(value, 'entities');
  exactKeys(value, ENTITY_KEYS, 'entities');
  return {
    serviceMentions: mentionArray(value.serviceMentions, 'serviceMentions'),
    branchMentions: mentionArray(value.branchMentions, 'branchMentions'),
    providerMentions: mentionArray(value.providerMentions, 'providerMentions'),
    dateTimeMentions: dateTimeArray(value.dateTimeMentions),
    bookingReference: nullableBoundedString(value.bookingReference, 'bookingReference', LIMITS.bookingReference),
    appointmentManagementTarget: enumValue(value.appointmentManagementTarget, TARGETS, 'appointmentManagementTarget'),
    corrections: correctionArray(value.corrections),
  };
}

function mentionArray(value, field) {
  boundedArray(value, field, LIMITS.mentions);
  return value.map((item, index) => {
    requirePlainObject(item, `${field}[${index}]`);
    exactKeys(item, ['text', 'role', 'confidence'], `${field}[${index}]`);
    return {
      text: boundedString(item.text, `${field}[${index}].text`, LIMITS.entityText),
      role: enumValue(item.role, ENTITY_ROLES, `${field}[${index}].role`),
      confidence: confidence(item.confidence, `${field}[${index}].confidence`),
    };
  });
}

function dateTimeArray(value) {
  boundedArray(value, 'dateTimeMentions', LIMITS.dateTimeMentions);
  return value.map((item, index) => {
    requirePlainObject(item, `dateTimeMentions[${index}]`);
    exactKeys(item, ['text', 'kind', 'role', 'confidence'], `dateTimeMentions[${index}]`);
    return {
      text: boundedString(item.text, `dateTimeMentions[${index}].text`, LIMITS.entityText),
      kind: enumValue(item.kind, DATE_TIME_KINDS, `dateTimeMentions[${index}].kind`),
      role: enumValue(item.role, ENTITY_ROLES, `dateTimeMentions[${index}].role`),
      confidence: confidence(item.confidence, `dateTimeMentions[${index}].confidence`),
    };
  });
}

function correctionArray(value) {
  boundedArray(value, 'corrections', LIMITS.corrections);
  return value.map((item, index) => {
    requirePlainObject(item, `corrections[${index}]`);
    exactKeys(item, ['entityType', 'fromText', 'toText', 'confidence'], `corrections[${index}]`);
    return {
      entityType: enumValue(item.entityType, CORRECTION_TYPES, `corrections[${index}].entityType`),
      fromText: boundedString(item.fromText, `corrections[${index}].fromText`, LIMITS.entityText),
      toText: boundedString(item.toText, `corrections[${index}].toText`, LIMITS.entityText),
      confidence: confidence(item.confidence, `corrections[${index}].confidence`),
    };
  });
}

function validateSignals(value) {
  requirePlainObject(value, 'signals');
  exactKeys(value, SIGNAL_KEYS, 'signals');
  const result = {};
  for (const key of SIGNAL_KEYS) {
    if (typeof value[key] !== 'boolean') invalid(`signals.${key} must be a boolean.`);
    result[key] = value[key];
  }
  return result;
}

function validateAmbiguity(value) {
  requirePlainObject(value, 'ambiguity');
  exactKeys(value, ['requiresClarification', 'reason', 'candidateIntents', 'ambiguousEntityTypes'], 'ambiguity');
  if (typeof value.requiresClarification !== 'boolean') {
    invalid('ambiguity.requiresClarification must be a boolean.');
  }
  const reason = enumValue(value.reason, AMBIGUITY_REASONS, 'ambiguity.reason');
  if (value.requiresClarification === false && reason !== 'none') {
    invalid('Non-ambiguous understanding must use ambiguity reason none.');
  }
  if (value.requiresClarification === true && reason === 'none') {
    invalid('Ambiguous understanding must state a reason.');
  }
  return {
    requiresClarification: value.requiresClarification,
    reason,
    candidateIntents: enumArray(value.candidateIntents, PRIMARY_INTENTS, 'ambiguity.candidateIntents', LIMITS.candidateIntents, { disallow: new Set(['unknown']) }),
    ambiguousEntityTypes: enumArray(value.ambiguousEntityTypes, AMBIGUOUS_ENTITY_TYPES, 'ambiguity.ambiguousEntityTypes', LIMITS.ambiguousEntityTypes),
  };
}

function exactKeys(value, allowed, field) {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) invalid(`${field} contains unsupported field: ${key}.`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) invalid(`${field}.${key} is required.`);
  }
}

function enumArray(value, allowed, field, maximum, { disallow = new Set() } = {}) {
  boundedArray(value, field, maximum);
  const result = [];
  for (const item of value) {
    const normalized = enumValue(item, allowed, field);
    if (disallow.has(normalized)) invalid(`${field} contains a disallowed value.`);
    if (result.includes(normalized)) invalid(`${field} contains duplicate values.`);
    result.push(normalized);
  }
  return result;
}

function boundedArray(value, field, maximum) {
  if (!Array.isArray(value)) invalid(`${field} must be an array.`);
  if (value.length > maximum) invalid(`${field} exceeds its maximum size.`);
}

function enumValue(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(`${field} is invalid.`);
  return value;
}

function confidence(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    invalid(`${field} must be a number between 0 and 1.`);
  }
  return value;
}

function boundedString(value, field, maximum) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    invalid(`${field} must be a non-empty bounded string.`);
  }
  return value;
}

function nullableBoundedString(value, field, maximum) {
  if (value === null) return null;
  return boundedString(value, field, maximum);
}

function requirePlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid(`${field} must be a plain object.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function invalid(message) {
  throw new ValidationError(message);
}

module.exports = Object.freeze({
  createSemanticUnderstandingResult,
  PRIMARY_INTENTS,
  CONVERSATION_ACTS,
  SENTIMENTS,
  SIGNAL_KEYS,
  ENTITY_ROLES,
  DATE_TIME_KINDS,
  TARGETS,
  CORRECTION_TYPES,
  AMBIGUITY_REASONS,
  AMBIGUOUS_ENTITY_TYPES,
  LIMITS,
  SEMANTIC_UNDERSTANDING_JSON_SCHEMA,
});
