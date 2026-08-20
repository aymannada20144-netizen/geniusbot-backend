'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');

const policy = new ShadenPolicy();
const clinicId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const appointmentId = '33333333-3333-4333-8333-333333333333';

test('bare and natural Arabic cancellation forms use the cancellation intent', () => {
  for (const text of [
    'الغاء',
    'إلغاء',
    'الغي',
    'ألغي',
    'إلغاء موعد',
    'إلغاء الموعد',
    'إلغاء موعدي',
    'ابغى الغي موعدي',
    'أريد إلغاء الموعد',
    'ممكن ألغي الحجز',
  ]) {
    assert.equal(
      policy.recognize(text).type,
      'booking_cancellation_request',
      text
    );
  }
});

test('raw bare cancellation starts safe appointment review without execution', async () => {
  const harness = cancellationHarness();
  const result = await harness.turn(null, 'الغاء');

  assert.equal(result.nextState.cancellation.step, 'awaiting_confirmation');
  assert.match(result.reply, /تأكيد إلغاء هذا الموعد/u);
  assert.equal(harness.cancelCalls.length, 0);
});

test('bare cancellation cannot bypass selection, verification, or confirmation', async () => {
  const harness = cancellationHarness({ knownPatient: false });
  const result = await harness.turn(null, 'الغاء');

  assert.equal(result.nextState.cancellation.step, 'awaiting_reference');
  assert.match(result.reply, /رقم الحجز/u);
  assert.doesNotMatch(result.reply, /جلديه|الحمدانيه/u);
  assert.equal(harness.cancelCalls.length, 0);
});

test('explicit confirmation remains required and refusal keeps the appointment', async () => {
  const confirmedHarness = cancellationHarness();
  const review = await confirmedHarness.turn(null, 'الغاء');
  const unrelated = await confirmedHarness.turn(review.nextState, 'تمام');
  assert.equal(confirmedHarness.cancelCalls.length, 0);
  const confirmed = await confirmedHarness.turn(unrelated.nextState, 'نعم');
  assert.equal(confirmedHarness.cancelCalls.length, 1);
  assert.equal(confirmed.nextState.cancellation, undefined);

  const keptHarness = cancellationHarness();
  const keepReview = await keptHarness.turn(null, 'إلغاء');
  const kept = await keptHarness.turn(keepReview.nextState, 'لا');
  assert.equal(keptHarness.cancelCalls.length, 0);
  assert.equal(kept.nextState.cancellation, undefined);
});

test('booking confirmation keeps its existing draft-abort precedence', async () => {
  const bookingEngine = {
    async createBooking() {
      throw new Error('booking execution must not occur');
    },
  };
  const engine = new ShadenEngine({ bookingEngine });
  const state = policy.initialState();
  state.booking = {
    step: 'confirmation',
    specialtyId: null,
    serviceId: 'service-1',
    city: null,
    branchId: 'branch-1',
    doctorId: null,
    roomId: null,
    date: null,
    datePeriod: null,
    timePeriod: null,
    preferredStart: '2026-08-25T10:00:00.000Z',
    paymentMethodId: 'payment-1',
    insuranceCompanyId: null,
    insuranceClassId: null,
  };
  const result = await engine.handle({
    message: { text: 'الغاء' },
    currentState: state,
    clinicData: {},
  });

  assert.match(result.reply, /تم إلغاء طلب الحجز/u);
  assert.equal(result.nextState.booking, undefined);
  assert.equal(result.nextState.cancellation, undefined);
});

test('dictionary remains bounded and other management intents do not regress', () => {
  for (const text of ['الغاء رسوم', 'إلغاء الضوضاء', 'ملغي', 'الغالي']) {
    assert.notEqual(policy.recognize(text).type, 'booking_cancellation_request', text);
  }
  assert.equal(policy.recognize('اريد تغيير موعدي').type,
    'booking_modification_request');
  assert.equal(policy.recognize('اريد تغيير الخدمة').type,
    'change_service_request');
  assert.equal(policy.recognize('اريد تغيير الفرع').type,
    'change_branch_request');
});

function cancellationHarness({ knownPatient = true } = {}) {
  const cancelCalls = [];
  const candidate = {
    id: appointmentId,
    clinic_id: clinicId,
    patient_id: patientId,
    booking_reference: '25DD4527',
    service_name: 'جلديه',
    branch_name: 'الحمدانيه',
    appointment_start: '2026-08-25T10:00:00.000Z',
    appointment_end: '2026-08-25T10:30:00.000Z',
    status: 'confirmed',
    updated_at: '2026-08-20T10:00:00.000Z',
  };
  const appointmentService = {
    async getFutureManagementCandidates() { return [candidate]; },
    async cancelAppointment(...args) {
      cancelCalls.push(args);
      return { id: appointmentId, status: 'cancelled' };
    },
  };
  const engine = new ShadenEngine({ appointmentService });
  return {
    cancelCalls,
    turn(currentState, text) {
      return engine.handle({
        message: { text },
        currentState,
        clinicData: {},
        bookingContext: { clinicId },
        patientIdentity: knownPatient
          ? { patient: { id: patientId }, customerName: 'نوره' }
          : null,
      });
    },
  };
}
