'use strict';

const {
  createSemanticCoreResult,
} = require('../../contracts/shaden/SemanticCoreResult');
const {
  createSemanticContext,
} = require('../../contracts/shaden/SemanticContext');
const {
  createSemanticInteractionEvent,
} = require('../../contracts/shaden/SemanticInteractionEvent');
const {
  CONFIDENCE_THRESHOLD,
} = require('./SemanticCorePolicy');

function bridgeSemanticInteraction({ semanticResult, context } = {}) {
  const semantic = createSemanticCoreResult(semanticResult);
  const validatedContext = createSemanticContext(context);
  const active = validatedContext.active;
  const pending = validatedContext.pending;

  if (
    !active ||
    !pending ||
    active.step !== 'awaiting_confirmation' ||
    pending.kind !== 'confirmation' ||
    semantic.interpretation.status !== 'clear' ||
    semantic.primaryGoal !== active.goal ||
    semantic.additionalGoals.length !== 0 ||
    semantic.mentionedEntities.length !== 0 ||
    semantic.confidence < CONFIDENCE_THRESHOLD
  ) return null;

  const type = {
    accept: 'ACCEPT_PENDING',
    reject: 'REJECT_PENDING',
  }[semantic.conversationAct];
  if (!type) return null;

  return createSemanticInteractionEvent({
    eventVersion: 1,
    type,
    source: 'semantic_core',
    guard: {
      contextVersion: validatedContext.contextVersion,
      goal: active.goal,
      step: active.step,
      pendingKind: pending.kind,
      targetType: pending.targetType,
    },
  });
}

module.exports = Object.freeze({ bridgeSemanticInteraction });
