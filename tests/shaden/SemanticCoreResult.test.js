'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSemanticCoreResult,
  LIMITS,
  SEMANTIC_CORE_JSON_SCHEMA,
} = require('../../src/contracts/shaden/SemanticCoreResult');

function valid(overrides = {}) {
  return {
    contractVersion: 2,
    primaryGoal: 'information',
    conversationAct: 'request',
    confidence: 0.94,
    interpretation: { status: 'clear' },
    ...overrides,
  };
}

test('SemanticCoreResult applies safe optional defaults and freezes deeply', () => {
  const result = createSemanticCoreResult(valid());
  assert.deepEqual(result.mentionedEntities, []);
  assert.deepEqual(result.additionalGoals, []);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.interpretation), true);
  assert.equal(Object.isFrozen(result.mentionedEntities), true);
  assert.equal(Object.isFrozen(result.additionalGoals), true);
});

test('SemanticCoreResult preserves only the approved routing fields', () => {
  const result = createSemanticCoreResult(valid({
    mentionedEntities: [{
      type: 'service', surfaceText: 'للتقشير', conceptText: 'تقشير',
    }],
    additionalGoals: ['booking'],
  }));
  assert.deepEqual(Object.keys(result), [
    'contractVersion', 'primaryGoal', 'conversationAct', 'confidence',
    'interpretation', 'mentionedEntities', 'additionalGoals',
  ]);
  assert.equal(result.additionalGoals[0], 'booking');
});

test('SemanticCoreResult rejects malformed core shapes', async (t) => {
  const cases = [
    ['missing required field', () => {
      const input = valid(); delete input.primaryGoal; return input;
    }],
    ['unknown field', () => ({ ...valid(), reply: 'not allowed' })],
    ['invalid goal', () => valid({ primaryGoal: 'medical_question' })],
    ['invalid act', () => valid({ conversationAct: 'thanks' })],
    ['invalid interpretation', () => valid({ interpretation: { status: 'guess' } })],
    ['interpretation metadata', () => valid({ interpretation: { status: 'clear', reason: 'extra' } })],
    ['invalid version', () => valid({ contractVersion: 1 })],
    ['negative confidence', () => valid({ confidence: -0.01 })],
    ['excess confidence', () => valid({ confidence: 1.01 })],
    ['non-numeric confidence', () => valid({ confidence: '1' })],
    ['unknown entity type', () => valid({ mentionedEntities: [{ type: 'date', surfaceText: 'غدا', conceptText: 'غدا' }] })],
    ['entity workflow role', () => valid({ mentionedEntities: [{ type: 'service', surfaceText: 'فيلر', conceptText: 'فيلر', role: 'requested' }] })],
    ['duplicate primary goal', () => valid({ additionalGoals: ['information'] })],
    ['unknown additional goal', () => valid({ additionalGoals: ['unknown'] })],
  ];
  for (const [name, makeInput] of cases) {
    await t.test(name, () => {
      assert.throws(() => createSemanticCoreResult(makeInput()), {
        code: 'VALIDATION_ERROR',
      });
    });
  }
});

test('SemanticCoreResult enforces collection bounds', () => {
  const entities = Array.from(
    { length: LIMITS.mentionedEntities + 1 },
    () => ({ type: 'service', surfaceText: 'فيلر', conceptText: 'فيلر' })
  );
  assert.throws(
    () => createSemanticCoreResult(valid({ mentionedEntities: entities })),
    { code: 'VALIDATION_ERROR' }
  );
  assert.throws(
    () => createSemanticCoreResult(valid({
      additionalGoals: ['booking', 'availability'],
    })),
    { code: 'VALIDATION_ERROR' }
  );
});

test('SemanticCoreResult JSON schema requires only the minimal core', () => {
  assert.deepEqual(SEMANTIC_CORE_JSON_SCHEMA.required, [
    'contractVersion', 'primaryGoal', 'conversationAct', 'confidence',
    'interpretation',
  ]);
  assert.equal(
    SEMANTIC_CORE_JSON_SCHEMA.properties.mentionedEntities.maxItems,
    5
  );
  assert.equal(
    SEMANTIC_CORE_JSON_SCHEMA.properties.additionalGoals.maxItems,
    1
  );
  assert.deepEqual(
    SEMANTIC_CORE_JSON_SCHEMA.properties.conversationAct.enum,
    [
      'inform', 'request', 'accept', 'reject', 'correct', 'complaint',
      'objection', 'hesitation', 'social',
    ]
  );
});
