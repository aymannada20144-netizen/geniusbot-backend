'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createFlowLifecycleOutcome,
} = require('../../src/contracts/shaden/FlowLifecycleOutcome');

test('creates immutable bounded lifecycle outcomes', () => {
  const continuation = createFlowLifecycleOutcome({
    lifecycleVersion: 1,
    type: 'continue',
    owner: 'booking',
    nextStep: 'service',
    reason: null,
  });
  assert.equal(Object.isFrozen(continuation), true);
  assert.deepEqual(continuation, {
    lifecycleVersion: 1,
    type: 'continue',
    owner: 'booking',
    nextStep: 'service',
    reason: null,
  });

  const recovery = createFlowLifecycleOutcome({
    lifecycleVersion: 1,
    type: 'recover',
    owner: 'booking',
    nextStep: 'branch',
    reason: 'no_availability',
  });
  assert.equal(recovery.reason, 'no_availability');

  const terminal = createFlowLifecycleOutcome({
    lifecycleVersion: 1,
    type: 'terminal',
    owner: 'booking',
    nextStep: null,
    reason: 'completed',
  });
  assert.equal(terminal.nextStep, null);
});

test('rejects domain data and invalid lifecycle combinations', () => {
  const base = {
    lifecycleVersion: 1,
    type: 'continue',
    owner: 'booking',
    nextStep: 'service',
    reason: null,
  };
  assert.throws(() => createFlowLifecycleOutcome({ ...base, appointmentId: 'id' }));
  assert.throws(() => createFlowLifecycleOutcome({ ...base, selectedValue: 'value' }));
  assert.throws(() => createFlowLifecycleOutcome({ ...base, reason: 'arbitrary' }));
  assert.throws(() => createFlowLifecycleOutcome({
    ...base,
    type: 'terminal',
    nextStep: 'service',
    reason: 'completed',
  }));
});
