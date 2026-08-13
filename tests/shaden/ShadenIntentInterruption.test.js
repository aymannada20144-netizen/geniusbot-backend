'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';

function rootState() {
  return {
    version: 1, mode: 'idle', step: null, customer: { name: null },
    context: { inquiry: 'appointment_cancellation' }, options: ['stale'],
  };
}

function cancellationState(step = 'awaiting_selection') {
  const state = rootState();
  state.cancellation = ShadenEngine.createCancellationState({ step });
  state.cancellation.candidateAppointmentIds = [APPOINTMENT_ID];
  state.cancellation.ownershipVerified = true;
  return state;
}

function rescheduleState(step = 'awaiting_selection') {
  const state = rootState();
  state.context = { inquiry: 'appointment_reschedule' };
  state.reschedule = {
    intent: 'appointment_reschedule', step,
    candidateAppointmentIds: [APPOINTMENT_ID], selectedAppointmentId: null,
    bookingReference: null, verificationRequired: false,
    ownershipVerified: true, verificationAttempts: 0,
    availableDates: [], availableTimes: [], selectedDate: null,
    selectedTime: null, confirmationPending: false,
    dateTimeExpressions: [],
  };
  return state;
}

function handle(state, text, rawPayload) {
  const candidate = {
    id: APPOINTMENT_ID, booking_reference: 'ABC12345', status: 'confirmed',
    clinic_id: CLINIC_ID, patient_id: PATIENT_ID,
    service_name: 'ليزر', branch_name: 'الروضة',
    appointment_start: '2026-08-20T09:00:00.000Z',
    appointment_end: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-13T09:00:00.000Z',
  };
  return new ShadenEngine({
    appointmentService: {
      async getFutureManagementCandidates() { return [candidate]; },
    },
  }).handle({
    message: { text, ...(rawPayload ? { rawPayload } : {}) },
    currentState: state, clinicData: {},
    bookingContext: { clinicId: CLINIC_ID },
    patientIdentity: { patient: { id: PATIENT_ID }, customerName: null },
  });
}

describe('explicit intent interruption', () => {
  test('different explicit intents clear management routing and reroute immediately', async () => {
    for (const [state, text, expected] of [
      [cancellationState(), 'ابغى حجز جديد', 'booking'],
      [cancellationState(), 'كم رسوم الالغاء؟', 'unsupported'],
      [rescheduleState(), 'ابي اغير الفيلر لبوتكس', 'unsupported'],
      [cancellationState(), 'ابغى اغير موعدي', 'management'],
      [rescheduleState(), 'ابغى الغي حجز', 'management'],
    ]) {
      const result = await handle(state, text);
      assert.equal(result.nextState.options.length, 0, text);
      assert.notEqual(result.nextState.context?.inquiry,
        'appointment_cancellation', text);
      if (expected === 'booking') assert.ok(result.nextState.booking, text);
      if (expected === 'unsupported') {
        assert.equal(result.nextState.cancellation, undefined, text);
        assert.equal(result.nextState.reschedule, undefined, text);
        assert.doesNotMatch(result.reply, /الاختيار غير صحيح/u, text);
      }
      if (expected === 'management') {
        assert.doesNotMatch(result.reply, /الاختيار غير صحيح/u, text);
      }
    }
  });

  test('true step replies and unrelated text do not interrupt selection state', async () => {
    for (const text of ['1', 'كلام غير متعلق']) {
      const result = await handle(cancellationState(), text);
      assert.ok(result.nextState.cancellation, text);
    }
  });

  test('interactive selection remains state-first', async () => {
    const result = await handle(cancellationState(), '', {
      value: `cancellation-appointment:${APPOINTMENT_ID}`,
    });
    assert.ok(result.nextState.cancellation);
  });
});
