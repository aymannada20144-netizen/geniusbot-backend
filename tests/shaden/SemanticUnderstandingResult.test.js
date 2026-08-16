'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSemanticUnderstandingResult,
  LIMITS,
} = require('../../src/contracts/shaden/SemanticUnderstandingResult');

function validResult(overrides = {}) {
  return {
    version: 1,
    conversationAct: 'question',
    primaryIntent: 'medical_question',
    knowledgeTopic: 'preparation',
    secondaryIntents: [],
    entities: {
      serviceMentions: [],
      branchMentions: [],
      providerMentions: [],
      dateTimeMentions: [],
      bookingReference: null,
      appointmentManagementTarget: 'unspecified',
      corrections: [],
    },
    signals: {
      confirmation: false,
      rejection: false,
      correction: false,
      interruption: false,
      conditional: false,
      hesitation: false,
      objection: false,
      complaint: false,
      medicalQuestion: true,
      medicalRisk: false,
      humanHandover: false,
      legalEscalation: false,
      botFrustration: false,
      abuseOrThreat: false,
    },
    sentiment: 'neutral',
    confidence: 0.9,
    ambiguity: {
      requiresClarification: false,
      reason: 'none',
      candidateIntents: [],
      ambiguousEntityTypes: [],
    },
    ...overrides,
  };
}

test('SemanticUnderstandingResult validates strict data-only output', () => {
  const result = createSemanticUnderstandingResult(validResult());
  assert.equal(result.primaryIntent, 'medical_question');
  assert.equal(result.knowledgeTopic, 'preparation');
  assert.equal(Object.isFrozen(result.entities), true);
  assert.equal(Object.isFrozen(result.signals), true);
});

test('SemanticUnderstandingResult rejects hostile and malformed shapes', async (t) => {
  const cases = [
    ['unknown enum', () => validResult({ primaryIntent: 'do_anything' })],
    ['unknown knowledge topic', () => validResult({ knowledgeTopic: 'instructions' })],
    ['extra key', () => ({ ...validResult(), explanation: 'because' })],
    ['action field', () => ({ ...validResult(), action: 'START_BOOKING' })],
    ['reply field', () => ({ ...validResult(), reply: 'hello' })],
    ['facts field', () => ({ ...validResult(), facts: ['invented'] })],
    ['fabricated identifier field', () => ({
      ...validResult(),
      entities: { ...validResult().entities, serviceId: '00000000-0000-0000-0000-000000000001' },
    })],
    ['invalid confidence', () => validResult({ confidence: 1.01 })],
    ['coerced confidence', () => validResult({ confidence: '0.9' })],
    ['oversized array', () => validResult({ secondaryIntents: Array(LIMITS.secondaryIntents + 1).fill('booking') })],
    ['oversized string', () => ({
      ...validResult(),
      entities: {
        ...validResult().entities,
        serviceMentions: [{ text: 'س'.repeat(LIMITS.entityText + 1), concept: null, role: 'requested', confidence: 1 }],
      },
    })],
    ['unsupported schema version', () => validResult({ version: 2 })],
  ];
  for (const [name, build] of cases) {
    await t.test(name, () => {
      assert.throws(() => createSemanticUnderstandingResult(build()), { code: 'VALIDATION_ERROR' });
    });
  }
});

test('SemanticUnderstandingResult represents explicit ambiguity strictly', () => {
  const result = createSemanticUnderstandingResult(validResult({
    primaryIntent: 'unknown',
    ambiguity: {
      requiresClarification: true,
      reason: 'intent_unclear',
      candidateIntents: ['booking', 'appointment_query'],
      ambiguousEntityTypes: ['appointment_target'],
    },
  }));
  assert.equal(result.ambiguity.requiresClarification, true);
});

module.exports = { validResult };
