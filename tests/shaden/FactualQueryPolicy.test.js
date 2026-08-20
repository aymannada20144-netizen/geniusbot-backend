'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const FactualQueryPolicy = require('../../src/services/shaden/FactualQueryPolicy');

const policy = new FactualQueryPolicy();
const resolved = (overrides = {}) => ({
  service: { status: 'RESOLVED' }, branch: { status: 'RESOLVED' },
  specialty: { status: 'RESOLVED' }, city: { status: 'RESOLVED' },
  ...overrides,
});

test('routes migrated factual queries with resolved relevant constraints', () => {
  const cases = [
    [{ serviceText: 'service' }, resolved()],
    [{ serviceText: 'service', branchText: 'branch' }, resolved()],
    [{}, resolved()],
  ];
  for (const [proposals, resolution] of cases) {
    const result = policy.decide({
      dialogAct: 'question', inquiryTarget: 'services', proposals, resolution,
    });
    assert.equal(result.action, 'ROUTE_TO_DOMAIN_QUERY');
  }
});

test('clarifies every unresolved or ambiguous relevant constraint', () => {
  for (const [type, status] of [
    ['branch', 'UNRESOLVED'], ['branch', 'AMBIGUOUS'],
    ['service', 'UNRESOLVED'], ['service', 'AMBIGUOUS'],
  ]) {
    const result = policy.decide({
      dialogAct: 'question', inquiryTarget: 'services',
      proposals: { serviceText: 'service', branchText: 'branch' },
      resolution: resolved({ [type]: { status } }),
    });
    assert.equal(result.action, 'CLARIFY');
    assert.equal(result.entityType, type);
  }
});

test('resolved semantic service precedence ignores stale unresolved specialty', () => {
  const result = policy.decide({
    dialogAct: 'question', inquiryTarget: 'services',
    proposals: {
      serviceText: 'service', branchText: 'branch',
      specialtyText: 'stale malformed legacy proposal',
    },
    resolution: resolved({ specialty: { status: 'UNRESOLVED' } }),
  });
  assert.equal(result.action, 'ROUTE_TO_DOMAIN_QUERY');
  assert.deepEqual(result.relevantConstraints, ['service', 'branch']);
});

test('explicitly unmigrated capability is the only out-of-scope decision', () => {
  const result = policy.decide({
    dialogAct: 'question', inquiryTarget: 'payment_methods',
  });
  assert.equal(result.action, 'OUT_OF_SCOPE');
  assert.equal(result.reason, 'CAPABILITY_NOT_MIGRATED');

  const missingResolution = policy.decide({
    dialogAct: 'question', inquiryTarget: 'services',
    proposals: { branchText: 'branch' }, resolution: null,
  });
  assert.equal(missingResolution.action, 'CLARIFY');
  assert.notEqual(missingResolution.action, 'OUT_OF_SCOPE');
});
