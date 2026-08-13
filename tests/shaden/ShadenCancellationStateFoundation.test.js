'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const {
  extractBookingReference,
  resolveBookingIntent,
} = require('../../src/services/shaden/ShadenIntentResolver');

const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('Shaden booking-reference parsing', () => {
  test('extracts an uppercase valid booking reference', () => {
    assert.equal(extractBookingReference('25DD4527'), '25DD4527');
    assert.equal(extractBookingReference('رقم الحجز 25DD4527'), '25DD4527');
  });

  test('normalizes a lowercase booking reference', () => {
    assert.equal(
      extractBookingReference('مرجع الموعد: 25dd4527'),
      '25DD4527'
    );
  });

  test('rejects invalid booking references', () => {
    assert.equal(extractBookingReference('رقم الحجز 25DD452G'), null);
    assert.equal(extractBookingReference('رقم الحجز 25DD45270'), null);
    assert.equal(extractBookingReference('رقم الحجز 25DD452'), null);
  });

  test('does not extract an unlabelled reference from unrelated text', () => {
    assert.equal(extractBookingReference('الخدمة deadbeef ممتازة'), null);
    assert.equal(extractBookingReference('موعدي الأسبوع القادم'), null);
  });

  test('returns cancellation intent and supplied reference together', () => {
    assert.deepEqual(
      resolveBookingIntent('إلغاء الحجز 25dd4527'),
      {
        type: 'booking_cancellation_request',
        bookingReference: '25DD4527',
      }
    );
  });

  test('preserves existing intent precedence and result shapes', () => {
    assert.deepEqual(resolveBookingIntent('إلغاء الحجز'), {
      type: 'booking_cancellation_request',
    });
    assert.deepEqual(resolveBookingIntent('أريد تعديل الحجز'), {
      type: 'booking_modification_request',
    });
    assert.deepEqual(resolveBookingIntent('ما رقم الحجز؟'), {
      type: 'booking_reference_request',
    });
    assert.equal(resolveBookingIntent('الخدمة deadbeef ممتازة'), null);
  });

  test('recognizes natural cancellation request prefixes strictly', () => {
    for (const phrase of [
      'اريد الغاء موعد',
      'اريد الغاء موعدي',
      'أريد إلغاء موعد',
      'أريد إلغاء موعدي',
      'الغاء موعد',
    ]) {
      assert.deepEqual(resolveBookingIntent(phrase), {
        type: 'booking_cancellation_request',
      });
    }

    assert.deepEqual(resolveBookingIntent('اريد حجز موعد'), {
      type: 'booking',
      serviceText: 'موعد',
    });
    assert.deepEqual(resolveBookingIntent('اريد موعد'), {
      type: 'booking',
      serviceText: null,
    });
    assert.deepEqual(resolveBookingIntent('تعديل موعد'), {
      type: 'booking_modification_request',
    });
    assert.deepEqual(resolveBookingIntent('موعد'), {
      type: 'booking',
      serviceText: null,
    });
    assert.deepEqual(resolveBookingIntent('عرض المواعيد'), null);
  });
});

describe('Shaden cancellation state normalization', () => {
  test('normalizes a valid cancellation state', async () => {
    const cancellation = validCancellationState({
      candidateAppointmentIds: [APPOINTMENT_ID],
      selectedAppointmentId: APPOINTMENT_ID,
      bookingReference: '25dd4527',
      ownershipVerified: true,
      confirmationPending: true,
      step: 'awaiting_confirmation',
      reviewedUpdatedAt: '2026-08-12T08:00:00.000Z',
    });

    const result = await handle(rootState({ cancellation }));

    assert.deepEqual(result.cancellation, {
      ...cancellation,
      bookingReference: '25DD4527',
    });
    assert.notEqual(result.cancellation, cancellation);
  });

  test('drops malformed cancellation state without affecting safe root state', () => {
    const state = rootState({
      cancellation: validCancellationState({
        verificationAttempts: 3,
      }),
    });
    state.customer.name = 'نورة';
    state.context = { inquiry: 'services' };

    const result = handle(state, 'ما الخدمات');

    assert.equal('cancellation' in result, false);
    assert.equal(result.customer.name, 'نورة');
    assert.deepEqual(result.context, { inquiry: 'services' });
  });

  test('preserves an existing valid booking state alongside cancellation', () => {
    const state = rootState({ cancellation: validCancellationState() });
    state.booking = {
      step: 'service',
      serviceId: null,
      branchId: null,
      doctorId: null,
      preferredStart: null,
      paymentMethodId: null,
    };

    const result = handle(state);

    assert.deepEqual(result.booking, state.booking);
    assert.deepEqual(result.cancellation, state.cancellation);
  });

  test('clears cancellation state after the third verification failure', () => {
    const state = rootState({
      cancellation: validCancellationState({ verificationAttempts: 2 }),
    });

    ShadenEngine.recordCancellationVerificationFailure(state);

    assert.equal('cancellation' in state, false);
    assert.equal(ShadenEngine.MAX_CANCELLATION_VERIFICATION_ATTEMPTS, 3);
  });

  test('rejects phone and unrelated PII fields instead of persisting them', () => {
    for (const field of ['registeredMobile', 'phone', 'patientName']) {
      const cancellation = validCancellationState();
      cancellation[field] = '+966501234567';
      const result = handle(rootState({ cancellation }));
      assert.equal('cancellation' in result, false);
    }
  });

  test('clear and replacement helpers support terminal and reset rules', () => {
    const state = rootState({ cancellation: validCancellationState() });
    ShadenEngine.clearCancellationState(state);
    assert.equal('cancellation' in state, false);

    ShadenEngine.replaceCancellationState(state, {
      bookingReference: '25dd4527',
      verificationRequired: true,
    });
    assert.equal(state.cancellation.bookingReference, '25DD4527');
    assert.equal(state.cancellation.verificationAttempts, 0);
    assert.equal(state.cancellation.verificationRequired, true);
  });
});

function handle(currentState, text = 'غير معروف') {
  const result = new ShadenEngine({ appointmentService: {} }).handle({
    message: { text },
    currentState,
    clinicData: {},
    bookingContext: {
      clinicId: '22222222-2222-4222-8222-222222222222',
    },
  });
  return typeof result?.then === 'function'
    ? result.then((resolved) => resolved.nextState)
    : result.nextState;
}

function rootState(extra = {}) {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: null },
    context: null,
    options: [],
    ...extra,
  };
}

function validCancellationState(overrides = {}) {
  return {
    intent: 'appointment_cancellation',
    step: 'awaiting_verification',
    candidateAppointmentIds: [],
    selectedAppointmentId: null,
    bookingReference: '25DD4527',
    verificationRequired: true,
    ownershipVerified: false,
    verificationAttempts: 0,
    confirmationPending: false,
    cancellationReason: null,
    reviewedUpdatedAt: null,
    ...overrides,
  };
}
