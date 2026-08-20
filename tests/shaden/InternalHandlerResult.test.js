'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const {
  userFacingHandlerResult,
} = require('../../src/contracts/shaden/InternalHandlerResult');

const TERMINAL = Object.freeze({
  lifecycleVersion: 1,
  type: 'terminal',
  owner: 'booking',
  nextStep: null,
  reason: 'completed',
});

test('plain strings preserve the existing normalized result', () => {
  const state = { version: 1 };
  assert.deepEqual(ShadenEngine.normalizeEngineReply('same reply', state), {
    reply: 'same reply',
    nextState: state,
  });
});

test('existing reply objects preserve interaction and notification behavior', () => {
  const state = { version: 1 };
  const interaction = { version: 1, mode: 'reply_buttons' };
  assert.deepEqual(ShadenEngine.normalizeEngineReply({
    reply: 'same reply', interaction, notificationAttempted: true,
  }, state), {
    reply: 'same reply', nextState: state, interaction,
    notificationAttempted: true,
  });
});

test('internal lifecycle metadata survives normalization', () => {
  const state = { version: 1 };
  const declared = ShadenEngine.normalizeEngineReply({
    reply: 'reply', lifecycleOutcome: TERMINAL,
  }, state);
  assert.deepEqual(declared.lifecycleOutcome, TERMINAL);
  assert.equal(Object.isFrozen(declared.lifecycleOutcome), true);

  const undeclared = ShadenEngine.normalizeEngineReply({
    reply: 'reply', undeclaredLifecycleReason: 'legacy_undeclared',
  }, state);
  assert.equal(undeclared.undeclaredLifecycleReason, 'legacy_undeclared');
});

test('delivery projection strips lifecycle metadata from state and output', () => {
  const state = { version: 1, booking: { step: 'service' } };
  const normalized = ShadenEngine.normalizeEngineReply({
    reply: 'reply',
    interaction: { version: 1 },
    lifecycleOutcome: TERMINAL,
  }, state);
  const projected = userFacingHandlerResult(normalized);
  assert.deepEqual(projected, {
    reply: 'reply', nextState: state, interaction: { version: 1 },
  });
  assert.equal('lifecycleOutcome' in projected, false);
  assert.equal('undeclaredLifecycleReason' in projected, false);
  assert.equal(JSON.stringify(projected.nextState).includes('lifecycle'), false);
});

test('invalid metadata is rejected without mutating result or state', () => {
  const state = { version: 1, booking: { step: 'service' } };
  const input = {
    reply: 'reply',
    lifecycleOutcome: { ...TERMINAL, appointmentId: 'domain-id' },
  };
  const beforeState = structuredClone(state);
  const beforeInput = structuredClone(input);
  assert.throws(() => ShadenEngine.normalizeEngineReply(input, state));
  assert.deepEqual(state, beforeState);
  assert.deepEqual(input, beforeInput);

  assert.throws(() => ShadenEngine.normalizeEngineReply({
    reply: 'reply',
    lifecycleOutcome: TERMINAL,
    undeclaredLifecycleReason: 'legacy_undeclared',
  }, state));
  assert.throws(() => ShadenEngine.normalizeEngineReply({
    reply: 'reply', undeclaredLifecycleReason: 'arbitrary',
  }, state));
});
