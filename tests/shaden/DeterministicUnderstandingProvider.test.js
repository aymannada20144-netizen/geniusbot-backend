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

  await t.test('maps appointment information intents explicitly', async () => {
    const cases = [
      ['appointment_query_request', 'appointment_query', 'question'],
      ['booking_status_request', 'appointment_query', 'question'],
      ['booking_reference_request', 'appointment_query', 'question'],
      ['cancellation_information_request', 'appointment_query', 'question'],
    ];

    for (const [type, intent, act] of cases) {
      const provider = new DeterministicUnderstandingProvider({
        policy: {
          recognize() {
            return { type };
          },
        },
      });

      const result = await provider.understand({
        text: 'test',
      });

      assert.equal(result.primaryIntent, intent, type);
      assert.equal(result.conversationAct, act, type);
    }
  });

  await t.test('preserves confirmation and rejection as conversational signals', async () => {
    const confirmationProvider =
      new DeterministicUnderstandingProvider({
        policy: {
          recognize() {
            return {
              type: 'conditional_confirmation',
              destructive: false,
            };
          },
        },
      });

    const confirmation =
      await confirmationProvider.understand({
        text: 'تمام بس...',
      });

    assert.equal(confirmation.primaryIntent, 'unknown');
    assert.equal(confirmation.conversationAct, 'confirmation');
    assert.equal(confirmation.signals.confirmation, true);
    assert.equal(confirmation.signals.conditional, true);

    const rejectionProvider =
      new DeterministicUnderstandingProvider({
        policy: {
          recognize() {
            return {
              type: 'booking_rejection',
            };
          },
        },
      });

    const rejection =
      await rejectionProvider.understand({
        text: 'لا ما أبي أحجز',
      });

    assert.equal(rejection.primaryIntent, 'unknown');
    assert.equal(rejection.conversationAct, 'rejection');
    assert.equal(rejection.signals.rejection, true);
  });

  await t.test('promotes the first compound intent and preserves the rest', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'compound_appointment_request',
            intents: [
              'change_branch_request',
              'booking',
            ],
            conditional: true,
            destructive: false,
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'test',
    });

    assert.equal(
      result.primaryIntent,
      'appointment_change_branch'
    );

    assert.deepEqual(
      result.secondaryIntents,
      ['booking']
    );

    assert.equal(result.conversationAct, 'request');
    assert.equal(result.signals.conditional, true);
  });

  await t.test('recognizes bulk cancellation semantically without execution authority', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'bulk_cancel_request',
            destructive: false,
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'test',
    });

    assert.equal(
      result.primaryIntent,
      'appointment_cancellation'
    );

    assert.equal(result.conversationAct, 'request');
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

  await t.test('merges hesitation without changing the legacy primary intent', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'booking',
            serviceText: 'ليزر',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'أبغى أحجز ليزر بس والله مترددة شوي',
    });

    assert.equal(result.primaryIntent, 'booking');
    assert.equal(result.signals.hesitation, true);
    assert.equal(result.sentiment, 'worried');
  });

  await t.test('merges complaint signals without replacing the legacy intent', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'appointment_query_request',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'وين موعدي؟ وبصراحة انتظرت كثير وما أحد رد',
    });

    assert.equal(
      result.primaryIntent,
      'appointment_query'
    );

    assert.equal(
      result.signals.complaint,
      true
    );

    assert.equal(
      result.sentiment,
      'frustrated'
    );
  });

  await t.test('merges medical red flags while keeping operational intent untouched', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'booking',
            serviceText: 'ليزر',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'أبغى أحجز بس عندي ضيق تنفس',
    });

    assert.equal(
      result.primaryIntent,
      'booking'
    );

    assert.equal(
      result.signals.medicalRisk,
      true
    );
  });

  await t.test('merges explicit human handover request', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'unknown',
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'أبغى أكلم موظفة',
    });

    assert.equal(
      result.primaryIntent,
      'unknown'
    );

    assert.equal(
      result.signals.humanHandover,
      true
    );
  });

  await t.test('does not let detector override state-dependent confirmation signals', async () => {
    const provider = new DeterministicUnderstandingProvider({
      policy: {
        recognize() {
          return {
            type: 'conditional_confirmation',
            conditional: true,
          };
        },
      },
    });

    const result = await provider.understand({
      text: 'تمام بس خليها مساء',
    });

    assert.equal(
      result.signals.confirmation,
      true
    );

    assert.equal(
      result.signals.conditional,
      true
    );
  });
});
  
