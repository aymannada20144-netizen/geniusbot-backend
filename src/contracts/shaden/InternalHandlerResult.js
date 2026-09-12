'use strict';

const {
  createFlowLifecycleOutcome,
} = require('./FlowLifecycleOutcome');

const UNDECLARED_LIFECYCLE_REASONS = Object.freeze(['legacy_undeclared']);
const OPERATIONAL_DISPOSITIONS = Object.freeze([
  'CONSUMED',
  'KNOWLEDGE_INTERRUPTION',
  'UNCONSUMED',
  'OPERATIONAL_ONLY',
]);

function operationalDispositionFrom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(input, 'operationalDisposition');
  if (!descriptor || descriptor.get || descriptor.set) return null;
  return OPERATIONAL_DISPOSITIONS.includes(descriptor.value)
    ? descriptor.value
    : null;
}

function lifecycleMetadataFrom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const hasOutcome = Object.prototype.hasOwnProperty.call(input, 'lifecycleOutcome');
  const hasUndeclared = Object.prototype.hasOwnProperty.call(
    input, 'undeclaredLifecycleReason'
  );
  if (hasOutcome && hasUndeclared) {
    throw new TypeError('Handler result cannot declare and remain undeclared.');
  }
  if (hasOutcome) {
    return Object.freeze({
      lifecycleOutcome: createFlowLifecycleOutcome(input.lifecycleOutcome),
    });
  }
  if (hasUndeclared) {
    if (!UNDECLARED_LIFECYCLE_REASONS.includes(input.undeclaredLifecycleReason)) {
      throw new TypeError('Unsupported undeclared lifecycle reason.');
    }
    return Object.freeze({
      undeclaredLifecycleReason: input.undeclaredLifecycleReason,
    });
  }
  return {};
}

function userFacingHandlerResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Normalized handler result is required.');
  }
  return {
    reply: input.reply,
    nextState: input.nextState,
    ...(input.interaction ? { interaction: input.interaction } : {}),
    ...(input.notificationAttempted
      ? { notificationAttempted: true }
      : {}),
  };
}

module.exports = Object.freeze({
  lifecycleMetadataFrom,
  operationalDispositionFrom,
  userFacingHandlerResult,
  UNDECLARED_LIFECYCLE_REASONS,
  OPERATIONAL_DISPOSITIONS,
});
