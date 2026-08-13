'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  patient: '22222222-2222-4222-8222-222222222222',
  appointment: '33333333-3333-4333-8333-333333333333',
  oldService: '44444444-4444-4444-8444-444444444444',
  newService: '55555555-5555-4555-8555-555555555555',
  branch: '66666666-6666-4666-8666-666666666666',
  doctor: '77777777-7777-4777-8777-777777777777',
  room: '88888888-8888-4888-8888-888888888888',
};

function candidate() {
  return {
    id: IDS.appointment, clinic_id: IDS.clinic, patient_id: IDS.patient,
    service_id: IDS.oldService, branch_id: IDS.branch,
    doctor_id: null, room_id: null, booking_reference: 'ABC12345',
    appointment_start: '2026-08-20T09:00:00.000Z',
    appointment_end: '2026-08-20T09:30:00.000Z', status: 'confirmed',
    updated_at: '2026-08-13T08:00:00.000Z', service_name: 'ليزر',
    branch_name: 'الروضة', quoted_price: '100.00', currency: 'SAR',
  };
}

function proposal() {
  return {
    appointment: candidate(),
    service: { id: IDS.newService, name: 'بوتكس' },
    assignment: {
      doctor_id: IDS.doctor, doctor_name: 'د. نورة',
      room_id: IDS.room, room_number: '4',
    },
    price: { price: '250.00', currency: 'SAR' },
    appointmentStart: '2026-08-20T09:00:00.000Z',
    appointmentEnd: '2026-08-20T10:00:00.000Z', requiresNewSlot: false,
  };
}

function initialState() {
  return { version: 1, mode: 'idle', step: null, customer: { name: null }, context: null, options: [] };
}

function input(state, text, value) {
  return {
    message: { text, ...(value ? { rawPayload: { value } } : {}) },
    currentState: state,
    clinicData: {
      services: [
        { id: IDS.oldService, name: 'ليزر', isBookingEnabled: true },
        { id: IDS.newService, name: 'بوتكس', isBookingEnabled: true },
      ],
    },
    bookingContext: { clinicId: IDS.clinic },
    patientIdentity: { patient: { id: IDS.patient }, customerName: null },
  };
}

describe('Shaden change-service flow', () => {
  test('auto-selects one appointment, reviews dependencies, and confirms once', async () => {
    let changes = 0;
    const appointmentService = {
      async getFutureManagementCandidates() { return [candidate()]; },
      async previewServiceChange() { return proposal(); },
      async changeAppointmentService() {
        changes += 1;
        return { ...candidate(), service_id: IDS.newService };
      },
    };
    const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
    const started = await engine.handle(input(initialState(), 'ابي اغير الفيلر لبوتكس'));
    assert.equal(started.nextState.changeService.step, 'awaiting_confirmation');
    assert.equal(started.interaction.mode, 'reply_buttons');
    assert.match(started.reply, /ABC12345/u);
    assert.deepEqual(started.interaction.options.map(({ id }) => id), [
      'change-service-confirm:yes', 'change-service-confirm:keep',
    ]);
    assert.match(started.reply, /ليزر/u);
    assert.match(started.reply, /بوتكس/u);
    assert.match(started.reply, /د\. نورة/u);
    assert.match(started.reply, /الغرفة/u);
    assert.match(started.reply, /250/u);
    assert.equal(changes, 0);

    const completed = await engine.handle(input(
      started.nextState, 'تأكيد تغيير الخدمة', 'change-service-confirm:yes'
    ));
    assert.equal(changes, 1);
    assert.equal(completed.nextState.changeService, undefined);
    assert.match(completed.reply, /ABC12345/u);

    const repeated = await engine.handle(input(
      completed.nextState, '', 'change-service-confirm:yes'
    ));
    assert.equal(changes, 1);
    assert.doesNotMatch(repeated.reply, /تم تغيير خدمة الموعد بنجاح/u);
  });

  test('generic request still asks for service and free-text intent can interrupt', async () => {
    const appointmentService = {
      async getFutureManagementCandidates() { return [candidate()]; },
    };
    const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
    const started = await engine.handle(input(initialState(), 'ابي اغير الخدمة'));
    assert.equal(started.nextState.changeService.step, 'awaiting_service');
    assert.equal(started.interaction.mode, 'list');
    const interrupted = await engine.handle(input(started.nextState, 'ابغى حجز جديد'));
    assert.equal(interrupted.nextState.changeService, undefined);
    assert.ok(interrupted.nextState.booking);
  });

  test('unknown phone discloses nothing before verification and exhausts at three', async () => {
    const appointmentService = {
      async verifyAppointmentOwnership() { return { verified: false }; },
    };
    const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
    const unknownInput = (state, text) => ({
      ...input(state, text), patientIdentity: null,
    });
    let result = await engine.handle(unknownInput(initialState(), 'ابي اغير الفيلر لبوتكس'));
    assert.match(result.reply, /رقم الحجز/u);
    assert.doesNotMatch(result.reply, /ليزر|الروضة/u);
    result = await engine.handle(unknownInput(result.nextState, 'ABC12345'));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await engine.handle(unknownInput(result.nextState, '0500000000'));
    }
    assert.equal(result.nextState.changeService, undefined);
    assert.equal(JSON.stringify(result.nextState).includes('0500000000'), false);
  });
});
