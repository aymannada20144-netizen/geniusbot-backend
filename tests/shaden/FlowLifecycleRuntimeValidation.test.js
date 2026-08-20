'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

const validate = createShadenEngine.validateInternalLifecycleResult;

test('central boundary accepts matching declarations without mutation', () => {
  const result = {
    reply: 'internal reply',
    nextState: { booking: { step: 'service' } },
    lifecycleOutcome: {
      lifecycleVersion: 1,
      type: 'continue',
      owner: 'booking',
      nextStep: 'service',
      reason: null,
    },
  };
  const before = structuredClone(result);
  assert.equal(validate(result), undefined);
  assert.deepEqual(result, before);
});

test('central boundary fails closed on owner, step, terminal, and conflict violations', () => {
  const base = {
    lifecycleVersion: 1,
    type: 'continue',
    owner: 'booking',
    nextStep: 'service',
    reason: null,
  };
  const invalid = [
    { nextState: { cancellation: { step: 'awaiting_selection' } }, lifecycleOutcome: base },
    { nextState: { booking: { step: 'branch' } }, lifecycleOutcome: base },
    {
      nextState: { booking: { step: 'confirmation' } },
      lifecycleOutcome: { ...base, type: 'terminal', nextStep: null, reason: 'completed' },
    },
    {
      nextState: { booking: { step: 'service' }, cancellation: { step: 'awaiting_selection' } },
      lifecycleOutcome: base,
    },
  ];
  for (const result of invalid) {
    assert.throws(() => validate(result), (error) =>
      error.name === 'LifecycleInvariantError' &&
      error.code === 'SHADEN_LIFECYCLE_INVARIANT');
  }
});

test('temporary undeclared results remain compatible without becoming valid', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const result = {
      reply: 'legacy result',
      nextState: { booking: { step: 'date_period' } },
      undeclaredLifecycleReason: 'legacy_undeclared',
    };
    assert.equal(validate(result), undefined);
    assert.equal('lifecycleOutcome' in result, false);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test('central boundary rejects unannotated and conflicting metadata', () => {
  assert.throws(() => validate({
    reply: 'unannotated',
    nextState: { version: 1 },
  }), (error) =>
    error.name === 'LifecycleInvariantError' &&
    error.code === 'SHADEN_LIFECYCLE_INVARIANT');

  assert.throws(() => validate({
    reply: 'conflicting',
    nextState: { version: 1 },
    lifecycleOutcome: {
      lifecycleVersion: 1,
      type: 'terminal',
      owner: 'booking',
      nextStep: null,
      reason: 'completed',
    },
    undeclaredLifecycleReason: 'legacy_undeclared',
  }), (error) =>
    error.name === 'LifecycleInvariantError' &&
    error.code === 'SHADEN_LIFECYCLE_INVARIANT');
});
