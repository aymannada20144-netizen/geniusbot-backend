'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bridgeSemanticInteraction,
} = require('../../src/services/shaden/SemanticInteractionBridge');

function semantic(overrides = {}) {
  return {
    contractVersion: 2,
    primaryGoal: 'booking',
    conversationAct: 'accept',
    confidence: 0.95,
    interpretation: { status: 'clear' },
    mentionedEntities: [],
    additionalGoals: [],
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    contextVersion: 1,
    active: { goal: 'booking', step: 'awaiting_confirmation' },
    pending: { kind: 'confirmation', targetType: 'appointment' },
    ...overrides,
  };
}

test('bridge emits only bounded accept and reject confirmation events', () => {
  assert.equal(
    bridgeSemanticInteraction({ semanticResult: semantic(), context: context() }).type,
    'ACCEPT_PENDING'
  );
  assert.equal(
    bridgeSemanticInteraction({
      semanticResult: semantic({ conversationAct: 'reject' }),
      context: context(),
    }).type,
    'REJECT_PENDING'
  );
});

test('bridge derives an immutable guard only from SemanticContext', () => {
  const supplied = context();
  const event = bridgeSemanticInteraction({
    semanticResult: semantic(), context: supplied,
  });
  assert.deepEqual(event.guard, {
    contextVersion: 1,
    goal: 'booking',
    step: 'awaiting_confirmation',
    pendingKind: 'confirmation',
    targetType: 'appointment',
  });
  assert.equal(Object.isFrozen(event), true);
  for (const forbidden of [
    'text', 'value', 'option', 'optionIndex', 'id', 'appointmentReference',
    'patient', 'record', 'date', 'time', 'command', 'outcome',
  ]) {
    assert.equal(Object.hasOwn(event, forbidden), false);
    assert.equal(Object.hasOwn(event.guard, forbidden), false);
  }
});

test('bridge returns null for every non-emitting semantic combination', async (t) => {
  const cases = [
    ['non-confirmation step', semantic(), context({ active: { goal: 'booking', step: 'awaiting_selection' } })],
    ['selection pending', semantic(), context({ pending: { kind: 'selection', targetType: 'service' } })],
    ['goal mismatch', semantic({ primaryGoal: 'availability' }), context()],
    ['dependent', semantic({ interpretation: { status: 'dependent' } }), context()],
    ['uncertain', semantic({ interpretation: { status: 'uncertain' } }), context()],
    ['low confidence', semantic({ confidence: 0.84 }), context()],
    ['additional goal', semantic({ additionalGoals: ['availability'] }), context()],
    ['entity evidence', semantic({ mentionedEntities: [{ type: 'service', surfaceText: 'service', conceptText: 'service' }] }), context()],
    ['missing active', semantic(), context({ active: null })],
    ['missing pending', semantic(), context({ pending: null })],
  ];
  for (const act of [
    'correct', 'request', 'complaint', 'objection', 'hesitation',
    'social', 'inform',
  ]) cases.push([`act:${act}`, semantic({ conversationAct: act }), context()]);

  for (const [name, semanticResult, semanticContext] of cases) {
    await t.test(name, () => {
      assert.equal(
        bridgeSemanticInteraction({ semanticResult, context: semanticContext }),
        null
      );
    });
  }
});

test('bridge never mutates its semantic result or context', () => {
  const semanticResult = semantic();
  const semanticContext = context();
  const beforeSemantic = structuredClone(semanticResult);
  const beforeContext = structuredClone(semanticContext);
  bridgeSemanticInteraction({ semanticResult, context: semanticContext });
  assert.deepEqual(semanticResult, beforeSemantic);
  assert.deepEqual(semanticContext, beforeContext);
});
