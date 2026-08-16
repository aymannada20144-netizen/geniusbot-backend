'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createConversationalUnderstandingResult,
} = require('../../src/contracts/shaden/ConversationalUnderstandingResult');

test('ConversationalUnderstandingResult', async (t) => {
  await t.test('preserves only validated semantic service evidence', () => {
    const result = createConversationalUnderstandingResult({
      entities: {
        serviceMentions: [{
          text: 'Ø§Ù„Ù„ÙŠØ²Ø±',
          concept: 'Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø´Ø¹Ø± Ø¨Ø§Ù„Ù„ÙŠØ²Ø±',
          role: 'requested',
          confidence: 0.99,
        }],
      },
    });
    assert.equal(result.entities.serviceMentions.length, 1);
    assert.equal(result.entities.serviceMentions[0].concept, 'Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø´Ø¹Ø± Ø¨Ø§Ù„Ù„ÙŠØ²Ø±');
    assert.equal(Object.isFrozen(result.entities.serviceMentions), true);
  });
  await t.test('creates a safe default result', () => {
    const result = createConversationalUnderstandingResult();

    assert.equal(result.version, 1);
    assert.equal(result.primaryIntent, 'unknown');
    assert.deepEqual(result.secondaryIntents, []);
    assert.deepEqual(result.entities, {});
    assert.equal(result.conversationAct, 'statement');
    assert.equal(result.sentiment, 'neutral');
    assert.equal(result.confidence, 0);

    assert.deepEqual(result.signals, {
      confirmation: false,
      rejection: false,
      correction: false,
      interruption: false,
      conditional: false,
      hesitation: false,
      objection: false,
      complaint: false,
      medicalQuestion: false,
      medicalRisk: false,
      humanHandover: false,
      legalEscalation: false,
      botFrustration: false,
      abuseOrThreat: false,
    });
  });

  await t.test('preserves a valid structured understanding', () => {
    const result = createConversationalUnderstandingResult({
      primaryIntent: 'medical_question',
      secondaryIntents: [
        'availability_request',
        'booking',
      ],
      entities: {
        service: 'ليزر',
        preferredDay: 'الخميس',
      },
      conversationAct: 'question',
      sentiment: 'worried',
      signals: {
        hesitation: true,
        medicalQuestion: true,
        conditional: true,
      },
      confidence: 0.94,
    });

    assert.equal(result.primaryIntent, 'medical_question');

    assert.deepEqual(result.secondaryIntents, [
      'availability_request',
      'booking',
    ]);

    assert.deepEqual(result.entities, {
      service: 'ليزر',
      preferredDay: 'الخميس',
    });

    assert.equal(result.conversationAct, 'question');
    assert.equal(result.sentiment, 'worried');

    assert.equal(result.signals.hesitation, true);
    assert.equal(result.signals.medicalQuestion, true);
    assert.equal(result.signals.conditional, true);

    assert.equal(result.confidence, 0.94);
  });

  await t.test('rejects unsupported classifications safely', () => {
    const result = createConversationalUnderstandingResult({
      primaryIntent: 'delete_database',
      conversationAct: 'execute_command',
      sentiment: 'extreme',
      confidence: 5,
    });

    assert.equal(result.primaryIntent, 'unknown');
    assert.equal(result.conversationAct, 'statement');
    assert.equal(result.sentiment, 'neutral');
    assert.equal(result.confidence, 1);
  });

  await t.test('normalizes malformed values without throwing', () => {
    const result = createConversationalUnderstandingResult({
      secondaryIntents: [
        'booking',
        'booking',
        '',
        null,
      ],
      entities: {
        service: 'بوتكس',
        nested: { unsafe: true },
        array: ['x'],
      },
      confidence: 'not-a-number',
    });

    assert.deepEqual(result.secondaryIntents, ['booking']);

    assert.deepEqual(result.entities, {
      service: 'بوتكس',
    });

    assert.equal(result.confidence, 0);
  });

  await t.test('returns immutable top-level structures', () => {
    const result = createConversationalUnderstandingResult({
      primaryIntent: 'booking',
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.signals), true);
    assert.equal(Object.isFrozen(result.entities), true);
    assert.equal(Object.isFrozen(result.secondaryIntents), true);
  });
  test('preserves extended conversational safety signals', () => {
  const result = createConversationalUnderstandingResult({
    signals: {
      legalEscalation: true,
      botFrustration: true,
      abuseOrThreat: true,
    },
  });

  assert.equal(result.signals.legalEscalation, true);
  assert.equal(result.signals.botFrustration, true);
  assert.equal(result.signals.abuseOrThreat, true);
});

});
