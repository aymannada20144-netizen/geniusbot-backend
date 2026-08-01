'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const BookingEngine = require('../../src/modules/bookings/BookingEngine');
const { parsePreferredStart, parseTimePart } = require(
  '../../src/services/shaden/BookingDateTimeParser'
);

describe('Booking date-time parsing', () => {
  const policy = new ShadenPolicy();
  for (const [input, expected] of [
    ['6 م', 18], ['٦ م', 18], ['6 مساءً', 18],
    ['6 ص', 6], ['12 ص', 0], ['12 م', 12],
  ]) {
    test(`${input} resolves deterministically`, () => {
      assert.equal(parseTimePart(policy.normalize(input)).hour, expected);
    });
  }

  test('PM survives normalization and today 6 PM is 18:00 Riyadh', () => {
    const parsed = parsePreferredStart(
      'اليوم الساعة 6 م',
      null,
      policy,
      { now: new Date('2026-07-31T09:00:00.000Z'), timeZone: 'Asia/Riyadh' }
    );
    assert.equal(parsed.value, '2026-07-31T15:00:00.000Z');
  });

  test('ambiguous hour requests clarification instead of guessing', () => {
    const parsed = parsePreferredStart('اليوم الساعة 6', null, policy, {
      now: new Date('2026-07-31T09:00:00.000Z'), timeZone: 'Asia/Riyadh',
    });
    assert.equal(parsed.complete, false);
    assert.equal(parsed.ambiguousTime, true);
  });
});

describe('Shaden early availability validation', () => {
  test('weekly closed day is rejected before payment and preserves selections', async () => {
    const engine = earlyEngine('branch_closed');
    const result = await turn(engine, 'اليوم الساعة 6 م');
    assert.equal(result.nextState.booking.step, 'availability');
    assert.equal(result.nextState.booking.serviceId, 'service-1');
    assert.equal(result.nextState.booking.city, 'جدة');
    assert.equal(result.nextState.booking.branchId, 'branch-1');
    assert.equal(result.nextState.booking.preferredStart, 'time:18:00');
    assert.match(result.reply, /مغلق/);
    assert.doesNotMatch(result.reply, /طريقة الدفع|ملخص الحجز/);
  });

  test('holiday and outside-hours reasons remain specific', async () => {
    assert.match((await turn(earlyEngine('clinic_holiday'), '2026-08-02 11:00')).reply, /إجازة مسجلة/);
    assert.match((await turn(earlyEngine('outside_branch_working_hours'), '2026-08-02 08:00')).reply, /خارج مواعيد عمل/);
  });

  test('valid slot advances to payment', async () => {
    const result = await turn(earlyEngine(null), '2026-08-02 11:00');
    assert.equal(result.nextState.booking.step, 'payment_method');
    assert.match(result.reply, /طريقة الدفع/);
  });

  test('replacement date reuses preserved time and continues same booking', async () => {
    const engine = earlyEngine(null);
    const state = bookingState();
    state.booking.preferredStart = 'time:18:00';
    const result = await Promise.resolve(engine.handle({
      message: { text: 'الأحد' }, currentState: state,
      clinicData: clinicData(), bookingContext: bookingContext(),
    }));
    assert.equal(result.nextState.booking.step, 'payment_method');
    assert.equal(result.nextState.booking.serviceId, 'service-1');
  });
});

describe('Booking room confirmation', () => {
  test('actual persisted room number and name are rendered without UUID', async () => {
    const bookingEngine = new BookingEngine({ bookingService: {
      bookAppointment: async () => ({
        success: true,
        assignment: { doctor_id: 'doctor-id', room_id: 'room-uuid' },
        appointment: {
          id: 'appointment-100', booking_reference: '25DD4527', status: 'pending', appointment_start: '2026-08-02T08:00:00.000Z',
          service_name: 'فيلر', branch_name: 'فرع الصالحية', doctor_name: 'د. علياء',
          room_id: 'room-uuid', room_number: '102', room_name: 'غرفة ليزر 2',
          payment_method_name: 'كاش',
        },
      }),
    } });
    const engine = new ShadenEngine({ bookingEngine });
    const state = bookingState();
    state.booking.step = 'confirmation';
    state.booking.preferredStart = '2026-08-02T08:00:00.000Z';
    state.booking.paymentMethodId = 'cash-1';
    const result = await Promise.resolve(engine.handle({
      message: { text: 'نعم' }, currentState: state,
      clinicData: clinicData(), bookingContext: bookingContext(),
    }));
    assert.match(result.reply, /\*الغرفة:\*/);
    assert.match(result.reply, /غرفة ليزر/);
    assert.doesNotMatch(result.reply, /room-uuid/);
  });

  test('room line is omitted when persisted appointment has no room', () => {
    const reply = new ShadenPolicy().bookingCreated({
      service: { name: 'استشارة' }, branch: { name: 'الفرع' }, doctor: null,
      room: null, paymentMethod: { name: 'كاش' },
      preferredStart: '2026-08-02T08:00:00.000Z', appointment: { id: '123', booking_reference: '25DD4527', status: 'pending' },
    });
    assert.doesNotMatch(reply, /الغرفة:/);
  });

  test('room number remains visible when room name is absent', () => {
    const reply = new ShadenPolicy().bookingCreated({
      service: { name: 'ليزر', requiresRoom: true }, branch: { name: 'الفرع' }, doctor: null,
      room: { number: '102', name: null }, paymentMethod: { name: 'كاش' },
      preferredStart: '2026-08-02T08:00:00.000Z', appointment: { id: '123' },
    });
    assert.match(reply, /\*الغرفة:\*/);
    assert.match(reply, /102/);
  });
});

function earlyEngine(reason) {
  return new ShadenEngine({
    clock: { now: () => new Date('2026-07-31T09:00:00.000Z') },
    bookingEngine: {
      checkAvailability: async () => reason
        ? { status: 'unavailable', metadata: { reasonCode: reason } }
        : { status: 'available' },
    },
  });
}

function turn(engine, text) {
  return Promise.resolve(engine.handle({
    message: { text }, currentState: bookingState(),
    clinicData: clinicData(), bookingContext: bookingContext(),
  }));
}

function bookingState() {
  return {
    version: 1, mode: 'idle', step: null, customer: { name: 'منة' },
    context: null, options: [], booking: {
      step: 'availability', serviceId: 'service-1', city: 'جدة',
      branchId: 'branch-1', doctorId: null, preferredStart: null,
      paymentMethodId: null, insuranceCompanyId: null, insuranceClassId: null,
    },
  };
}

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'العيادة' },
    services: [{ id: 'service-1', name: 'فيلر', requiresDoctor: true, requiresRoom: true }],
    branches: [{ id: 'branch-1', name: 'فرع الصالحية', city: 'جدة', timezone: 'Asia/Riyadh' }],
    paymentMethods: [{ id: 'cash-1', name: 'كاش', code: 'cash' }],
    insuranceCompanies: [], insuranceClasses: [], specialties: [], workingHours: [],
  };
}

function bookingContext() {
  return { clinicId: 'clinic-1', conversationId: 'conversation-1', channel: 'whatsapp', channelIdentity: '+966500000001', patientId: 'patient-1' };
}

