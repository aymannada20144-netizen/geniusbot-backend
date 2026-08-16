'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSemanticContext,
  SEMANTIC_PHASES,
  PENDING_KINDS,
  TARGET_TYPES,
} = require('../../src/contracts/shaden/SemanticContext');

test('SemanticContext creates a bounded immutable context', () => {
  const result = createSemanticContext({
    contextVersion: 1,
    active: { goal: 'booking', step: 'awaiting_confirmation' },
    pending: { kind: 'confirmation', targetType: 'appointment' },
  });
  assert.equal(result.active.goal, 'booking');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.active), true);
  assert.equal(Object.isFrozen(result.pending), true);
});

test('SemanticContext accepts the minimal empty context', () => {
  assert.deepEqual(createSemanticContext({
    contextVersion: 1, active: null, pending: null,
  }), { contextVersion: 1, active: null, pending: null });
});

test('SemanticContext exposes only approved bounded vocabularies', () => {
  assert.deepEqual(SEMANTIC_PHASES, [
    'collecting_information', 'awaiting_selection',
    'awaiting_confirmation', 'verification',
  ]);
  assert.deepEqual(PENDING_KINDS, [
    'confirmation', 'selection', 'information', 'correction', 'free_text',
  ]);
  assert.deepEqual(TARGET_TYPES, [
    'service', 'branch', 'provider', 'appointment', 'date', 'time',
  ]);
});

test('SemanticContext rejects unsupported, unsafe, and malformed fields', async (t) => {
  const cases = [
    { contextVersion: 2, active: null, pending: null },
    { contextVersion: 1, active: null, pending: null, history: [] },
    { contextVersion: 1, active: { goal: 'complaint', step: 'verification' }, pending: null },
    { contextVersion: 1, active: { goal: 'booking', step: 'service' }, pending: null },
    { contextVersion: 1, active: null, pending: { kind: 'execute', targetType: 'appointment' } },
    { contextVersion: 1, active: null, pending: { kind: 'selection', targetType: 'patient' } },
    { contextVersion: 1, active: null, pending: { kind: 'selection', targetType: 'service', id: 'unsafe' } },
  ];
  for (const input of cases) {
    await t.test(JSON.stringify(input), () => {
      assert.throws(() => createSemanticContext(input), {
        code: 'VALIDATION_ERROR',
      });
    });
  }
});
