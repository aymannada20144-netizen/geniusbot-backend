'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const DeterministicUnderstandingProvider =
  require('../../src/services/shaden/DeterministicUnderstandingProvider');

test('DeterministicUnderstandingProvider', async (t) => {
  await t.test('maps greeting into conversational understanding', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'greeting',
            kind: 'casual',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'مرحبا',
    });

    assert.equal(result.primaryIntent, 'greeting');
    assert.equal(result.conversationAct, 'greeting');
    assert.equal(result.sentiment, 'neutral');
    assert.equal(result.confidence, 1);
    assert.equal(result.entities.legacyIntentType, 'greeting');
  });

  await t.test('maps booking intent and preserves safe entities', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'booking',
            serviceText: 'ليزر',
            city: 'الرياض',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'أبغى أحجز ليزر بالرياض',
    });

    assert.equal(result.primaryIntent, 'booking');
    assert.equal(result.conversationAct, 'request');

    assert.deepEqual(result.entities, {
      legacyIntentType: 'booking',
      city: 'الرياض',
      serviceText: 'ليزر',
    });

    assert.equal(result.confidence, 1);
  });

  await t.test('maps appointment cancellation without authorizing execution', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'booking_cancellation_request',
            bookingReference: '25DD4527',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'أبغى ألغي موعدي',
    });

    assert.equal(
      result.primaryIntent,
      'appointment_cancellation'
    );

    assert.equal(
      result.conversationAct,
      'request'
    );

    assert.equal(
      result.entities.bookingReference,
      '25DD4527'
    );

    assert.equal(result.confidence, 1);
  });

  await t.test('maps clinic information intents', async () => {
    const cases = [
      ['services', 'services'],
      ['specialties', 'specialties'],
      ['branches', 'branches'],
      ['branch_address', 'branch_address'],
      ['working_hours', 'working_hours'],
      ['payment_methods', 'payment_methods'],
      ['insurance_companies', 'insurance'],
      ['insurance_classes', 'insurance'],
    ];

    for (const [legacyType, expectedIntent] of cases) {
      const provider = new DeterministicUnderstandingProvider({
        policy: {
          recognize() {
            return {
              type: legacyType,
            };
          },
        },
      });

      const result = await provider.understand({
        text: 'test',
      });

      assert.equal(
        result.primaryIntent,
        expectedIntent,
        legacyType
      );
    }
  });

  await t.test('preserves multi-intent information when supplied by legacy resolver', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'medical_question',
            intents: [
              'medical_question',
              'availability_request',
              'booking',
            ],
            serviceText: 'ليزر',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'هل الليزر يوجع وإذا مناسب أشوف موعد؟',
    });

    assert.equal(
      result.primaryIntent,
      'medical_question'
    );

    assert.deepEqual(
      result.secondaryIntents,
      [
        'availability_request',
        'booking',
      ]
    );

    assert.equal(
      result.signals.medicalQuestion,
      true
    );

    assert.equal(
      result.entities.serviceText,
      'ليزر'
    );
  });

  await t.test('returns safe unknown for unsupported legacy intent', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'something_not_mapped',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'anything',
    });

    assert.equal(result.primaryIntent, 'unknown');
    assert.equal(result.confidence, 1);

    assert.equal(
      result.entities.legacyIntentType,
      'something_not_mapped'
    );
  });

  await t.test('returns safe unknown when recognition throws', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          throw new Error('recognition failure');
        },
      },
    });

    const result = await provider.understand({
      text: 'مرحبا',
    });

    assert.equal(result.primaryIntent, 'unknown');
    assert.equal(result.confidence, 0);
    assert.deepEqual(result.entities, {});
  });

  await t.test('returns safe unknown for empty input', async () => {
    const provider = new DeterministicUnderstandingProvider();

    const result = await provider.understand({
      text: '   ',
    });

    assert.equal(result.primaryIntent, 'unknown');
    assert.equal(result.confidence, 0);
  });
});