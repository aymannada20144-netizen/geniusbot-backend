'use strict';

const {
  createSemanticContext,
} = require('../../contracts/shaden/SemanticContext');
const {
  createSemanticInteractionEvent,
} = require('../../contracts/shaden/SemanticInteractionEvent');

const RESOLUTIONS = Object.freeze(['accept', 'reject', 'unresolved']);
const INTERACTIVE_RESOLUTIONS = Object.freeze([
  'absent', 'accept', 'reject', 'invalid',
]);
const DETERMINISTIC_RESOLUTIONS = Object.freeze([
  'unresolved', 'accept', 'reject',
]);

function resolvePendingInteraction({
  context,
  interactiveResolution = 'absent',
  deterministicResolution = 'unresolved',
  semanticEvent = null,
} = {}) {
  const authoritativeContext = createSemanticContext(context);
  if (!isPendingConfirmation(authoritativeContext)) return 'unresolved';

  if (!INTERACTIVE_RESOLUTIONS.includes(interactiveResolution)) {
    return 'unresolved';
  }
  if (interactiveResolution === 'accept' || interactiveResolution === 'reject') {
    return interactiveResolution;
  }
  if (interactiveResolution === 'invalid') return 'unresolved';

  if (!DETERMINISTIC_RESOLUTIONS.includes(deterministicResolution)) {
    return 'unresolved';
  }
  if (
    deterministicResolution === 'accept' ||
    deterministicResolution === 'reject'
  ) return deterministicResolution;

  const event = validatedEventOrNull(semanticEvent);
  if (!event || !guardMatches(event.guard, authoritativeContext)) {
    return 'unresolved';
  }
  return event.type === 'ACCEPT_PENDING' ? 'accept' : 'reject';
}

function isPendingConfirmation(context) {
  return context.active?.step === 'awaiting_confirmation' &&
    context.pending?.kind === 'confirmation';
}

function validatedEventOrNull(value) {
  if (value === null) return null;
  try {
    return createSemanticInteractionEvent(value);
  } catch {
    return null;
  }
}

function guardMatches(guard, context) {
  return guard.contextVersion === context.contextVersion &&
    guard.goal === context.active.goal &&
    guard.step === context.active.step &&
    guard.pendingKind === context.pending.kind &&
    guard.targetType === context.pending.targetType;
}

module.exports = Object.freeze({
  resolvePendingInteraction,
  RESOLUTIONS,
  INTERACTIVE_RESOLUTIONS,
  DETERMINISTIC_RESOLUTIONS,
});
