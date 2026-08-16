'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePendingInteraction,
  RESOLUTIONS,
} = require('../../src/services/shaden/PendingInteractionResolver');

function context(overrides = {}) {
  return {
    contextVersion: 1,
    active: { goal: 'booking', step: 'awaiting_confirmation' },
    pending: { kind: 'confirmation', targetType: 'appointment' },
    ...overrides,
  };
}

function event(type = 'ACCEPT_PENDING', guardOverrides = {}) {
  return {
    eventVersion: 1,
    type,
    source: 'semantic_core',
    guard: {
      contextVersion: 1,
      goal: 'booking',
      step: 'awaiting_confirmation',
      pendingKind: 'confirmation',
      targetType: 'appointment',
      ...guardOverrides,
    },
  };
}

test('resolver exposes only bounded stance outcomes', () => {
  assert.deepEqual(RESOLUTIONS, ['accept', 'reject', 'unresolved']);
  for (const result of [
    resolvePendingInteraction({ context: context(), interactiveResolution: 'accept' }),
    resolvePendingInteraction({ context: context(), interactiveResolution: 'reject' }),
    resolvePendingInteraction({ context: context() }),
  ]) {
    assert.equal(typeof result, 'string');
    assert.equal(RESOLUTIONS.includes(result), true);
  }
});

test('authoritative interactive resolution wins every conflict', () => {
  assert.equal(resolvePendingInteraction({
    context: context(),
    interactiveResolution: 'accept',
    deterministicResolution: 'reject',
    semanticEvent: event('REJECT_PENDING'),
  }), 'accept');
  assert.equal(resolvePendingInteraction({
    context: context(),
    interactiveResolution: 'reject',
    deterministicResolution: 'accept',
    semanticEvent: event('ACCEPT_PENDING'),
  }), 'reject');
});

test('deterministic resolution wins conflicting semantic evidence', () => {
  assert.equal(resolvePendingInteraction({
    context: context(),
    deterministicResolution: 'accept',
    semanticEvent: event('REJECT_PENDING'),
  }), 'accept');
  assert.equal(resolvePendingInteraction({
    context: context(),
    deterministicResolution: 'reject',
    semanticEvent: event('ACCEPT_PENDING'),
  }), 'reject');
});

test('valid guarded semantic events resolve only after higher priorities', () => {
  assert.equal(resolvePendingInteraction({
    context: context(), semanticEvent: event('ACCEPT_PENDING'),
  }), 'accept');
  assert.equal(resolvePendingInteraction({
    context: context(), semanticEvent: event('REJECT_PENDING'),
  }), 'reject');
});

test('stale or mismatched semantic guards remain unresolved', async (t) => {
  for (const [field, value] of [
    ['contextVersion', 2],
    ['goal', 'availability'],
    ['step', 'awaiting_selection'],
    ['pendingKind', 'selection'],
    ['targetType', 'service'],
  ]) {
    await t.test(field, () => {
      assert.equal(resolvePendingInteraction({
        context: context(), semanticEvent: event('ACCEPT_PENDING', { [field]: value }),
      }), 'unresolved');
    });
  }
});

test('a non-confirmation current context cannot consume any evidence', async (t) => {
  for (const semanticContext of [
    context({ active: { goal: 'booking', step: 'awaiting_selection' } }),
    context({ pending: { kind: 'selection', targetType: 'service' } }),
    context({ active: null }),
    context({ pending: null }),
  ]) {
    await t.test(JSON.stringify(semanticContext), () => {
      assert.equal(resolvePendingInteraction({
        context: semanticContext,
        interactiveResolution: 'accept',
        deterministicResolution: 'accept',
        semanticEvent: event('ACCEPT_PENDING'),
      }), 'unresolved');
    });
  }
});

test('invalid or stale interactive evidence is never semantically rescued', () => {
  assert.equal(resolvePendingInteraction({
    context: context(),
    interactiveResolution: 'invalid',
    deterministicResolution: 'accept',
    semanticEvent: event('ACCEPT_PENDING'),
  }), 'unresolved');
  assert.equal(resolvePendingInteraction({
    context: context(),
    interactiveResolution: 'unsupported',
    semanticEvent: event('ACCEPT_PENDING'),
  }), 'unresolved');
});

test('absent evidence and malformed semantic events remain unresolved', () => {
  assert.equal(resolvePendingInteraction({ context: context() }), 'unresolved');
  assert.equal(resolvePendingInteraction({
    context: context(), semanticEvent: { type: 'ACCEPT_PENDING' },
  }), 'unresolved');
});

test('resolver never mutates context or event', () => {
  const suppliedContext = context();
  const suppliedEvent = event();
  const beforeContext = structuredClone(suppliedContext);
  const beforeEvent = structuredClone(suppliedEvent);
  resolvePendingInteraction({
    context: suppliedContext,
    semanticEvent: suppliedEvent,
  });
  assert.deepEqual(suppliedContext, beforeContext);
  assert.deepEqual(suppliedEvent, beforeEvent);
});
