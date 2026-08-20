'use strict';

const FLOW_OWNERS = Object.freeze([
  'booking',
  'cancellation',
  'reschedule',
  'changeService',
  'changeBranch',
]);
const OUTCOME_TYPES = Object.freeze(['continue', 'recover', 'terminal']);
const RECOVERY_REASONS = Object.freeze([
  'no_availability',
  'domain_conflict',
  'temporarily_unavailable',
]);
const TERMINAL_REASONS = Object.freeze([
  'completed',
  'aborted',
  'rejected',
  'failed',
]);
const ALLOWED_KEYS = Object.freeze([
  'lifecycleVersion', 'type', 'owner', 'nextStep', 'reason',
]);

function createFlowLifecycleOutcome(input) {
  if (!isPlainObject(input)) throw new TypeError('Lifecycle outcome must be an object.');
  const keys = Object.keys(input);
  if (keys.length !== ALLOWED_KEYS.length || keys.some((key) => !ALLOWED_KEYS.includes(key))) {
    throw new TypeError('Lifecycle outcome has an invalid shape.');
  }
  if (input.lifecycleVersion !== 1) throw new TypeError('Unsupported lifecycle version.');
  if (!OUTCOME_TYPES.includes(input.type)) throw new TypeError('Unsupported lifecycle outcome type.');
  if (!FLOW_OWNERS.includes(input.owner)) throw new TypeError('Unsupported lifecycle owner.');

  if (input.type === 'continue') {
    if (!isNonBlank(input.nextStep) || input.reason !== null) {
      throw new TypeError('Continue requires nextStep and no reason.');
    }
  } else if (input.type === 'recover') {
    if (!isNonBlank(input.nextStep) || !RECOVERY_REASONS.includes(input.reason)) {
      throw new TypeError('Recover requires nextStep and a bounded recovery reason.');
    }
  } else if (input.nextStep !== null || !TERMINAL_REASONS.includes(input.reason)) {
    throw new TypeError('Terminal requires no nextStep and a bounded terminal reason.');
  }

  return Object.freeze({
    lifecycleVersion: 1,
    type: input.type,
    owner: input.owner,
    nextStep: input.nextStep,
    reason: input.reason,
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isNonBlank(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

module.exports = Object.freeze({
  createFlowLifecycleOutcome,
  FLOW_OWNERS,
  OUTCOME_TYPES,
  RECOVERY_REASONS,
  TERMINAL_REASONS,
});
