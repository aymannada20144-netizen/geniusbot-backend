'use strict';

const ValidationError = require('../../core/errors/ValidationError');
const { PRIMARY_GOALS } = require('./SemanticCoreResult');
const {
  CONTEXT_VERSION,
  SEMANTIC_PHASES,
  PENDING_KINDS,
  TARGET_TYPES,
} = require('./SemanticContext');

const EVENT_VERSION = 1;
const EVENT_TYPES = Object.freeze(['ACCEPT_PENDING', 'REJECT_PENDING']);
const EVENT_SOURCE = 'semantic_core';
const EVENT_KEYS = Object.freeze(['eventVersion', 'type', 'source', 'guard']);
const GUARD_KEYS = Object.freeze([
  'contextVersion', 'goal', 'step', 'pendingKind', 'targetType',
]);

function createSemanticInteractionEvent(input) {
  requirePlainObject(input, 'semantic interaction event');
  exactKeys(input, EVENT_KEYS, 'semantic interaction event');
  if (input.eventVersion !== EVENT_VERSION) invalid('Unsupported eventVersion.');
  if (input.source !== EVENT_SOURCE) invalid('Unsupported event source.');

  requirePlainObject(input.guard, 'semantic interaction event guard');
  exactKeys(input.guard, GUARD_KEYS, 'semantic interaction event guard');
  if (input.guard.contextVersion !== CONTEXT_VERSION) {
    invalid('Unsupported guard contextVersion.');
  }

  return deepFreeze({
    eventVersion: EVENT_VERSION,
    type: enumValue(input.type, EVENT_TYPES, 'type'),
    source: EVENT_SOURCE,
    guard: {
      contextVersion: CONTEXT_VERSION,
      goal: enumValue(input.guard.goal, PRIMARY_GOALS, 'guard.goal'),
      step: enumValue(input.guard.step, SEMANTIC_PHASES, 'guard.step'),
      pendingKind: enumValue(
        input.guard.pendingKind,
        PENDING_KINDS,
        'guard.pendingKind'
      ),
      targetType: enumValue(
        input.guard.targetType,
        TARGET_TYPES,
        'guard.targetType'
      ),
    },
  });
}

function exactKeys(value, expected, field) {
  const keys = Object.keys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => !expected.includes(key))
  ) invalid(`${field} must contain exactly the supported fields.`);
}

function enumValue(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    invalid(`${field} is invalid.`);
  }
  return value;
}

function requirePlainObject(value, field) {
  if (
    !value || typeof value !== 'object' || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) invalid(`${field} must be a plain object.`);
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
  createSemanticInteractionEvent,
  EVENT_VERSION,
  EVENT_TYPES,
  EVENT_SOURCE,
});
