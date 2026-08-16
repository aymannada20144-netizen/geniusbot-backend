'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSemanticInteractionEvent,
  EVENT_TYPES,
} = require('../../src/contracts/shaden/SemanticInteractionEvent');

function valid(overrides = {}) {
  return {
    eventVersion: 1,
    type: 'ACCEPT_PENDING',
    source: 'semantic_core',
    guard: {
      contextVersion: 1,
      goal: 'booking',
      step: 'awaiting_confirmation',
      pendingKind: 'confirmation',
      targetType: 'appointment',
    },
    ...overrides,
  };
}

test('SemanticInteractionEvent is strict, bounded, and deeply immutable', () => {
  const event = createSemanticInteractionEvent(valid());
  assert.deepEqual(EVENT_TYPES, ['ACCEPT_PENDING', 'REJECT_PENDING']);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.guard), true);
  assert.deepEqual(Object.keys(event), ['eventVersion', 'type', 'source', 'guard']);
  assert.deepEqual(Object.keys(event.guard), [
    'contextVersion', 'goal', 'step', 'pendingKind', 'targetType',
  ]);
});

test('SemanticInteractionEvent rejects unsupported and execution-bearing data', async (t) => {
  const cases = [
    valid({ eventVersion: 2 }),
    valid({ type: 'EXECUTE_BOOKING' }),
    valid({ source: 'runtime' }),
    { ...valid(), text: 'not allowed' },
    { ...valid(), appointmentId: 'not allowed' },
    { ...valid(), command: 'not allowed' },
    { ...valid(), guard: { ...valid().guard, optionIndex: 1 } },
    { ...valid(), guard: { ...valid().guard, targetType: 'patient' } },
  ];
  for (const input of cases) {
    await t.test(JSON.stringify(input), () => {
      assert.throws(() => createSemanticInteractionEvent(input), {
        code: 'VALIDATION_ERROR',
      });
    });
  }
});
