'use strict';

const ValidationError = require('../../core/errors/ValidationError');

const CONTRACT_VERSION = 2;
const PRIMARY_GOALS = Object.freeze([
  'information',
  'booking',
  'availability',
  'appointment_query',
  'appointment_change',
  'appointment_cancel',
  'appointment_reschedule',
  'human_handover',
  'social_engagement',
  'unknown',
]);
const CONVERSATION_ACTS = Object.freeze([
  'inform',
  'request',
  'accept',
  'reject',
  'correct',
  'complaint',
  'objection',
  'hesitation',
  'social',
]);
const INTERPRETATION_STATUSES = Object.freeze([
  'clear',
  'uncertain',
  'dependent',
]);
const ENTITY_TYPES = Object.freeze(['service', 'branch', 'provider']);
const LIMITS = Object.freeze({
  mentionedEntities: 5,
  additionalGoals: 1,
  entityText: 200,
});

const CORE_KEYS = Object.freeze([
  'contractVersion',
  'primaryGoal',
  'conversationAct',
  'confidence',
  'interpretation',
  'mentionedEntities',
  'additionalGoals',
]);
const REQUIRED_CORE_KEYS = Object.freeze([
  'contractVersion',
  'primaryGoal',
  'conversationAct',
  'confidence',
  'interpretation',
]);

const entitySchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['type', 'surfaceText', 'conceptText'],
  properties: {
    type: { type: 'string', enum: ENTITY_TYPES },
    surfaceText: {
      type: 'string',
      minLength: 1,
      maxLength: LIMITS.entityText,
      description: 'Exact contiguous text copied from the inbound message.',
    },
    conceptText: {
      type: 'string',
      minLength: 1,
      maxLength: LIMITS.entityText,
      description: 'Generic morphological normalization only; never a catalog identity or a more specific concept.',
    },
  },
});

const SEMANTIC_CORE_JSON_SCHEMA = deepFreeze({
  type: 'object',
  additionalProperties: false,
  required: REQUIRED_CORE_KEYS,
  properties: {
    contractVersion: { type: 'integer', const: CONTRACT_VERSION },
    primaryGoal: { type: 'string', enum: PRIMARY_GOALS },
    conversationAct: { type: 'string', enum: CONVERSATION_ACTS },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    interpretation: {
      type: 'object',
      additionalProperties: false,
      required: ['status'],
      properties: {
        status: { type: 'string', enum: INTERPRETATION_STATUSES },
      },
    },
    mentionedEntities: {
      type: 'array',
      maxItems: LIMITS.mentionedEntities,
      items: entitySchema,
    },
    additionalGoals: {
      type: 'array',
      maxItems: LIMITS.additionalGoals,
      items: { type: 'string', enum: PRIMARY_GOALS },
    },
  },
});

function createSemanticCoreResult(input) {
  requirePlainObject(input, 'semantic core');
  rejectUnknownKeys(input, CORE_KEYS, 'semantic core');
  requireKeys(input, REQUIRED_CORE_KEYS, 'semantic core');

  if (input.contractVersion !== CONTRACT_VERSION) {
    invalid('Unsupported semantic core contractVersion.');
  }

  const primaryGoal = enumValue(input.primaryGoal, PRIMARY_GOALS, 'primaryGoal');
  const additionalGoals = goalArray(input.additionalGoals ?? [], primaryGoal);
  const mentionedEntities = entityArray(input.mentionedEntities ?? []);
  const interpretation = validateInterpretation(input.interpretation);

  return deepFreeze({
    contractVersion: CONTRACT_VERSION,
    primaryGoal,
    conversationAct: enumValue(
      input.conversationAct,
      CONVERSATION_ACTS,
      'conversationAct'
    ),
    confidence: boundedConfidence(input.confidence),
    interpretation,
    mentionedEntities,
    additionalGoals,
  });
}

function validateInterpretation(input) {
  requirePlainObject(input, 'interpretation');
  rejectUnknownKeys(input, ['status'], 'interpretation');
  requireKeys(input, ['status'], 'interpretation');
  return {
    status: enumValue(
      input.status,
      INTERPRETATION_STATUSES,
      'interpretation.status'
    ),
  };
}

function entityArray(input) {
  boundedArray(input, 'mentionedEntities', LIMITS.mentionedEntities);
  return input.map((entity, index) => {
    const field = `mentionedEntities[${index}]`;
    requirePlainObject(entity, field);
    rejectUnknownKeys(entity, ['type', 'surfaceText', 'conceptText'], field);
    requireKeys(entity, ['type', 'surfaceText', 'conceptText'], field);
    return {
      type: enumValue(entity.type, ENTITY_TYPES, `${field}.type`),
      surfaceText: boundedString(
        entity.surfaceText,
        `${field}.surfaceText`,
        LIMITS.entityText
      ),
      conceptText: boundedString(
        entity.conceptText,
        `${field}.conceptText`,
        LIMITS.entityText
      ),
    };
  });
}

function goalArray(input, primaryGoal) {
  boundedArray(input, 'additionalGoals', LIMITS.additionalGoals);
  const result = [];
  for (const item of input) {
    const goal = enumValue(item, PRIMARY_GOALS, 'additionalGoals');
    if (goal === 'unknown' || goal === primaryGoal || result.includes(goal)) {
      invalid('additionalGoals contains a redundant or unsupported goal.');
    }
    result.push(goal);
  }
  return result;
}

function boundedArray(value, field, maximum) {
  if (!Array.isArray(value)) invalid(`${field} must be an array.`);
  if (value.length > maximum) invalid(`${field} exceeds its maximum size.`);
}

function boundedString(value, field, maximum) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum
  ) {
    invalid(`${field} must be a non-empty bounded string.`);
  }
  return value;
}

function boundedConfidence(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalid('confidence must be a number between 0 and 1.');
  }
  return value;
}

function enumValue(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    invalid(`${field} is invalid.`);
  }
  return value;
}

function requirePlainObject(value, field) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${field} must be a plain object.`);
  }
}

function rejectUnknownKeys(value, allowed, field) {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) invalid(`${field} contains unsupported field: ${key}.`);
  }
}

function requireKeys(value, required, field) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      invalid(`${field}.${key} is required.`);
    }
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
  createSemanticCoreResult,
  CONTRACT_VERSION,
  PRIMARY_GOALS,
  CONVERSATION_ACTS,
  INTERPRETATION_STATUSES,
  ENTITY_TYPES,
  LIMITS,
  SEMANTIC_CORE_JSON_SCHEMA,
});
