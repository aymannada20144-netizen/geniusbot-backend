'use strict';

const ValidationError = require('../../core/errors/ValidationError');
const {
  PRIMARY_GOALS,
} = require('./SemanticCoreResult');

const CONTEXT_VERSION = 1;
const SEMANTIC_PHASES = Object.freeze([
  'collecting_information',
  'awaiting_selection',
  'awaiting_confirmation',
  'verification',
]);
const PENDING_KINDS = Object.freeze([
  'confirmation',
  'selection',
  'information',
  'correction',
  'free_text',
]);
const TARGET_TYPES = Object.freeze([
  'service',
  'branch',
  'provider',
  'appointment',
  'date',
  'time',
]);

function createSemanticContext(input) {
  requirePlainObject(input, 'semantic context');
  exactKeys(input, ['contextVersion', 'active', 'pending'], 'semantic context');
  if (input.contextVersion !== CONTEXT_VERSION) {
    invalid('Unsupported semantic context version.');
  }

  return deepFreeze({
    contextVersion: CONTEXT_VERSION,
    active: nullableActive(input.active),
    pending: nullablePending(input.pending),
  });
}

function nullableActive(value) {
  if (value === null) return null;
  requirePlainObject(value, 'active');
  exactKeys(value, ['goal', 'step'], 'active');
  return {
    goal: enumValue(value.goal, PRIMARY_GOALS, 'active.goal'),
    step: enumValue(value.step, SEMANTIC_PHASES, 'active.step'),
  };
}

function nullablePending(value) {
  if (value === null) return null;
  requirePlainObject(value, 'pending');
  exactKeys(value, ['kind', 'targetType'], 'pending');
  return {
    kind: enumValue(value.kind, PENDING_KINDS, 'pending.kind'),
    targetType: enumValue(value.targetType, TARGET_TYPES, 'pending.targetType'),
  };
}

function exactKeys(value, expected, field) {
  const keys = Object.keys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => !expected.includes(key))
  ) {
    invalid(`${field} must contain exactly the supported fields.`);
  }
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function invalid(message) {
  throw new ValidationError(message);
}

module.exports = Object.freeze({
  createSemanticContext,
  CONTEXT_VERSION,
  SEMANTIC_PHASES,
  PENDING_KINDS,
  TARGET_TYPES,
});
