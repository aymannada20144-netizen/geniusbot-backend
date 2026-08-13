'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const clinicId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const appointmentId = '33333333-3333-4333-8333-333333333333';
const candidate = {
  id: appointmentId, clinic_id: clinicId, patient_id: patientId,
  service_id: '44444444-4444-4444-8444-444444444444',
  branch_id: '55555555-5555-4555-8555-555555555555',
  doctor_id: '66666666-6666-4666-8666-666666666666',
  room_id: '77777777-7777-4777-8777-777777777777',
  booking_reference: '25DD4527', service_name: 'جلدية',
  branch_name: 'فرع الصالحية',
  appointment_start: '2026-08-20T10:40:00.000Z',
  appointment_end: '2026-08-20T11:00:00.000Z', status: 'confirmed',
};

function harness({ conflict = false, verificationFails = false } = {}) {
  const calls = [];
  const appointmentService = {
    getFutureManagementCandidates: async () => [candidate],
    verifyAppointmentOwnership: async () => verificationFails
      ? { verified: false }
      : { verified: true, appointmentId, patientId },
    resolveAppointmentForManagementByBookingReference: async () => ({
      appointmentId, patientId, clinicId,
    }),
    rescheduleAppointment: async (...args) => {
      calls.push(args);
      if (conflict) {
        const error = new Error('slot'); error.code = 'APPOINTMENT_SLOT_NO_LONGER_AVAILABLE';
        throw error;
      }
      return { ...candidate, appointment_start: args[2], appointment_end: args[3] };
    },
  };
  const bookingEngine = {
    getAvailableDates: async () => ({ success: true, dates: ['2026-08-25'] }),
    getAvailableTimes: async () => ({ success: true, times: ['14:40'] }),
  };
  const engine = new ShadenEngine({
    appointmentService, bookingEngine,
    clock: { now: () => new Date('2026-08-12T09:00:00.000Z') },
  });
  return { engine, calls };
}

const context = { clinicId, conversationId: '88888888-8888-4888-8888-888888888888' };
const identity = { patient: { id: patientId }, customerName: 'مراجع' };

async function knownFlow(config) {
  const { engine, calls } = harness(config);
  let result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
    clinicData: {}, bookingContext: context, patientIdentity: identity });
  assert.equal(result.nextState.reschedule.step, 'awaiting_date');
  result = await engine.handle({ message: '2026-08-25', currentState: result.nextState,
    clinicData: {}, bookingContext: context, patientIdentity: identity });
  assert.equal(result.nextState.reschedule.step, 'awaiting_time');
  result = await engine.handle({ message: '14:40', currentState: result.nextState,
    clinicData: {}, bookingContext: context, patientIdentity: identity });
  assert.equal(result.nextState.reschedule.step, 'awaiting_confirmation');
  result = await engine.handle({ message: { text: '', rawPayload: { value: 'reschedule-confirm:yes' } },
    currentState: result.nextState, clinicData: {}, bookingContext: context,
    patientIdentity: identity });
  return { result, calls };
}

describe('Shaden validated appointment reschedule flow', () => {
  test('same-service candidates remain distinguishable with unchanged interactive IDs', async () => {
    const second = {
      ...candidate,
      id: '99999999-9999-4999-8999-999999999999',
      booking_reference: 'CC43F3CC',
      appointment_start: '2026-08-25T09:20:00.000Z',
      appointment_end: '2026-08-25T09:40:00.000Z',
    };
    const appointmentService = {
      getFutureManagementCandidates: async () => [candidate, second],
    };
    const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
    const result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      `reschedule-appointment:${candidate.id}`,
      `reschedule-appointment:${second.id}`,
    ]);
    assert.match(result.interaction.options[0].label, /25DD4527/);
    assert.match(result.interaction.options[1].label, /CC43F3CC/);
    assert.match(result.interaction.options[0].description, /أغسطس/);
    assert.match(result.interaction.options[0].description, /التاريخ: \u2068\d+ أغسطس 2026\u2069/);
    assert.match(result.interaction.options[0].description, /م/);
    assert.match(result.interaction.options[0].description, /الصالحية/);
    assert.doesNotMatch(result.reply, /1\.|2\.|25DD4527|CC43F3CC/);
  });

  test('known patient selects only available date/time and executes after confirmation', async () => {
    const { result, calls } = await knownFlow();
    assert.match(result.reply, /تم تغيير الموعد بنجاح/);
    assert.equal(result.nextState.reschedule, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], clinicId);
    assert.equal(calls[0][1], appointmentId);
    assert.equal(calls[0][5].patientId, patientId);
    assert.equal(calls[0][5].source, 'shaden');
  });

  test('stale slot maps safely and clears execution state', async () => {
    const { result, calls } = await knownFlow({ conflict: true });
    assert.match(result.reply, /لم يعد متاح/);
    assert.equal(result.nextState.reschedule, undefined);
    assert.equal(calls.length, 1);
  });

  test('unknown phone verifies ownership without persisting submitted mobile', async () => {
    const { engine } = harness();
    let result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: null });
    assert.equal(result.nextState.reschedule.step, 'awaiting_reference');
    result = await engine.handle({ message: '25DD4527', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: null });
    result = await engine.handle({ message: '0501234567', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: null });
    assert.equal(result.nextState.reschedule.step, 'awaiting_date');
    assert.doesNotMatch(JSON.stringify(result.nextState.reschedule), /0501234567/);
  });

  test('confirmation is mandatory', async () => {
    const { engine, calls } = harness();
    let result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    result = await engine.handle({ message: '2026-08-25', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    result = await engine.handle({ message: '14:40', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.equal(calls.length, 0);
    assert.equal(result.interaction.purpose, 'confirm_appointment_reschedule');
    assert.equal(result.interaction.mode, 'reply_buttons');
    assert.deepEqual(result.interaction.options, [
      { id: 'reschedule-confirm:yes', label: 'تأكيد تغيير الموعد' },
      { id: 'reschedule-confirm:keep', label: 'الاحتفاظ بالموعد' },
    ]);
    assert.equal(
      result.interaction.options.every(({ label }) =>
        Array.from(label).length <= 20
      ),
      true
    );
    assert.match(result.reply, /رقم الحجز: 25DD4527/);
    assert.match(result.reply, /الموعد السابق:\n20 أغسطس 2026 — 1:40 م/);
    assert.match(result.reply, /الموعد الجديد:\n25 أغسطس 2026 — 2:40 م/);
    assert.doesNotMatch(result.reply, /2026-08-25|14:40/);
  });

  test('date and time interactive rows never duplicate labels into descriptions', async () => {
    const { engine } = harness();
    let result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.equal(result.interaction.options[0].label, '25 أغسطس 2026');
    assert.equal('description' in result.interaction.options[0], false);
    result = await engine.handle({ message: '2026-08-25', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.equal(result.interaction.options[0].label, '2:40 م');
    assert.equal('description' in result.interaction.options[0], false);
  });

  test('RTL date isolation keeps 18 and 20 before August in appointment rows', async () => {
    const rows = [18, 20].map((day, index) => ({
      ...candidate,
      id: `${index + 8}9999999-9999-4999-8999-999999999999`,
      appointment_start: `2026-08-${day}T15:20:00.000Z`,
    }));
    const engine = new ShadenEngine({
      appointmentService: { getFutureManagementCandidates: async () => rows },
      bookingEngine: {},
    });
    const result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.match(result.interaction.options[0].description, /\u206818 أغسطس 2026\u2069/);
    assert.match(result.interaction.options[1].description, /\u206820 أغسطس 2026\u2069/);
  });

  test('stale confirmation button cannot execute without pending state', async () => {
    const { engine, calls } = harness();
    const result = await engine.handle({
      message: { text: '', rawPayload: { value: 'reschedule-confirm:yes' } },
      currentState: null, clinicData: {}, bookingContext: context,
      patientIdentity: identity,
    });
    assert.equal(calls.length, 0);
    assert.equal(result.nextState.reschedule, undefined);
  });

  test('unknown verification stops after three neutral failures and stores no mobile', async () => {
    const { engine, calls } = harness({ verificationFails: true });
    let result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: null });
    result = await engine.handle({ message: '25DD4527', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: null });
    for (const mobile of ['0500000001', '0500000002', '0500000003']) {
      result = await engine.handle({ message: mobile, currentState: result.nextState,
        clinicData: {}, bookingContext: context, patientIdentity: null });
    }
    assert.equal(result.nextState.reschedule, undefined);
    assert.equal(calls.length, 0);
  });

  test('refusal keeps the original appointment and clears flow state', async () => {
    const { engine, calls } = harness();
    let result = await engine.handle({ message: 'اريد تغيير موعدي', currentState: null,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    result = await engine.handle({ message: '2026-08-25', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    result = await engine.handle({ message: '14:40', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    result = await engine.handle({ message: { text: '', rawPayload: { value: 'reschedule-confirm:keep' } },
      currentState: result.nextState, clinicData: {}, bookingContext: context,
      patientIdentity: identity });
    assert.equal(result.nextState.reschedule, undefined);
    assert.equal(calls.length, 0);
  });

  test('successful reschedule leaves neutral routing for a new booking', async () => {
    const { engine } = harness();
    const { result } = await knownFlow();
    const next = await engine.handle({ message: 'ابغى حجز جديد', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.ok(next.nextState.booking);
    assert.equal(next.nextState.reschedule, undefined);
    assert.deepEqual(next.nextState.options, []);
  });

  test('successful reschedule can immediately enter cancellation routing', async () => {
    const { engine } = harness();
    const { result } = await knownFlow();
    const next = await engine.handle({ message: 'اريد الغاء موعد', currentState: result.nextState,
      clinicData: {}, bookingContext: context, patientIdentity: identity });
    assert.equal(next.nextState.reschedule, undefined);
    assert.ok(next.nextState.cancellation || /موعد/.test(next.reply));
  });
});
