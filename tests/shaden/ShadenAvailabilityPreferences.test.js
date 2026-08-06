'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const NOW = new Date('2026-08-05T08:00:00.000Z');

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'عيادات أوريان' },
    assistantIdentity: { name: 'شادن', gender: 'female' },
    services: [{ id: 'service-1', name: 'فيلر' }],
    branches: [{ id: 'branch-1', name: 'الصالحية', city: 'جدة', timezone: 'Asia/Riyadh' }],
    specialties: [],
    paymentMethods: [{ id: 'cash', name: 'كاش', code: 'cash' }],
    insuranceCompanies: [],
    insuranceClasses: [],
    workingHours: [],
  };
}

function state({ step = 'date_period', date = null, doctorId = null } = {}) {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'منة' },
    context: null,
    options: [],
    booking: {
      step,
      specialtyId: null,
      serviceId: 'service-1',
      city: 'جدة',
      branchId: 'branch-1',
      doctorId,
      roomId: null,
      date,
      datePeriod: null,
      timePeriod: null,
      preferredStart: null,
      paymentMethodId: 'cash',
      insuranceCompanyId: null,
      insuranceClassId: null,
    },
  };
}

function harness({
  preferredResult,
  checkStatus = 'available',
  alternatives = [],
  now = NOW,
} = {}) {
  const preferredCalls = [];
  const checks = [];
  const bookingEngine = {
    async getPreferredAvailability(command) {
      preferredCalls.push(command);
      return preferredResult || {
        success: true,
        preferredStart: '2026-08-05T09:00:00.000Z',
        date: '2026-08-05',
        time: '12:00',
        doctorId: 'doctor-auto',
        roomId: 'room-auto',
      };
    },
    async checkAvailability(command) {
      checks.push(command);
      return checkStatus === 'available'
        ? {
          status: 'available',
          doctor: { id: command.doctor?.id || 'doctor-auto' },
          room: { id: command.room?.id || 'room-auto' },
        }
        : { status: 'unavailable', reason: 'slot_not_available' };
    },
    async getAvailableAlternatives() {
      return { success: true, alternatives };
    },
    async getAvailableDates() {
      return { success: true, dates: ['2026-08-07'] };
    },
  };
  return {
    engine: new ShadenEngine({ bookingEngine, clock: { now: () => now } }),
    preferredCalls,
    checks,
  };
}

function turn(engine, text, currentState = state(), rawPayload = null) {
  return engine.handle({
    message: { text, ...(rawPayload ? { rawPayload } : {}) },
    currentState,
    clinicData: clinicData(),
    bookingContext: { clinicId: 'clinic-1' },
  });
}

describe('natural availability preferences', () => {
  for (const phrase of ['أقرب موعد', 'أول موعد متاح']) {
    test(`${phrase} requests the same nearest-available search from now`, async () => {
      const { engine, preferredCalls, checks } = harness();
      const result = await turn(engine, phrase);

      assert.equal(preferredCalls[0].mode, 'nearest_available');
      assert.equal(preferredCalls[0].from, NOW.toISOString());
      assert.equal(preferredCalls[0].date, null);
      assert.equal(checks.length, 1);
      assert.equal(result.nextState.booking.step, 'confirmation');
    });
  }

  test('بكرة أي وقت searches tomorrow only', async () => {
    const preferredResult = {
      success: true,
      preferredStart: '2026-08-06T06:00:00.000Z',
      date: '2026-08-06',
      time: '09:00',
      doctorId: 'doctor-auto',
      roomId: 'room-auto',
    };
    const { engine, preferredCalls } = harness({ preferredResult });
    await turn(engine, 'بكرة أي وقت');

    assert.equal(preferredCalls[0].mode, 'any_time');
    assert.equal(preferredCalls[0].date, '2026-08-06');
  });

  test('بكرة أي وقت explains a closed tomorrow before later alternatives', async () => {
    const current = state();
    const { engine } = harness({
      now: new Date('2026-08-06T08:00:00.000Z'),
      preferredResult: {
        success: false,
        reason: 'no_available_slot',
        unavailableReason: 'closed_day',
        date: '2026-08-07',
        recoveryStart: '2026-08-06T21:00:00.000Z',
      },
      alternatives: [{ date: '2026-08-08', time: '09:00' }],
    });
    const result = await turn(engine, 'بكرة أي وقت', current);

    assert.match(result.reply, /غدًا الجمعة والعيادة مغلقة/u);
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'booking-alternative:2026-08-08T09:00',
    ]);
    assert.equal(result.nextState.booking.serviceId, current.booking.serviceId);
    assert.equal(result.nextState.booking.city, current.booking.city);
    assert.equal(result.nextState.booking.branchId, current.booking.branchId);
  });

  test('بكرة أي وقت explains a full open tomorrow before later alternatives', async () => {
    const { engine } = harness({
      now: new Date('2026-08-06T08:00:00.000Z'),
      preferredResult: {
        success: false,
        reason: 'no_available_slot',
        unavailableReason: 'no_availability',
        date: '2026-08-07',
        recoveryStart: '2026-08-06T21:00:00.000Z',
      },
      alternatives: [{ date: '2026-08-08', time: '09:00' }],
    });
    const result = await turn(engine, 'بكرة أي وقت');

    assert.match(result.reply, /لا توجد مواعيد متاحة غدًا/u);
    assert.equal(result.interaction.options[0].id, 'booking-alternative:2026-08-08T09:00');
  });

  test('successful tomorrow and open-ended nearest searches show no bounded recovery explanation', async () => {
    const tomorrow = harness({ preferredResult: {
      success: true,
      preferredStart: '2026-08-06T06:00:00.000Z',
      date: '2026-08-06',
      time: '09:00',
      doctorId: 'doctor-auto',
      roomId: 'room-auto',
    } });
    const tomorrowResult = await turn(tomorrow.engine, 'بكرة أي وقت');
    assert.doesNotMatch(tomorrowResult.reply, /أقرب المواعيد المتاحة بعد ذلك/u);

    const nearest = harness({ preferredResult: {
      success: false,
      reason: 'no_available_slot',
      unavailableReason: 'closed_day',
      date: '2026-08-05',
      recoveryStart: '2026-08-04T21:00:00.000Z',
    } });
    const nearestResult = await turn(nearest.engine, 'أقرب موعد');
    assert.doesNotMatch(nearestResult.reply, /غدًا|أقرب المواعيد المتاحة بعد ذلك/u);
  });

  test('أي وقت uses the saved date and does not invent one without context', async () => {
    const preferredResult = {
      success: true,
      preferredStart: '2026-08-09T07:00:00.000Z',
      date: '2026-08-09',
      time: '10:00',
      doctorId: null,
      roomId: 'room-auto',
    };
    const saved = harness({ preferredResult });
    await turn(saved.engine, 'أي وقت', state({ step: 'time_period', date: '2026-08-09' }));
    assert.equal(saved.preferredCalls[0].date, '2026-08-09');

    const missing = harness();
    const result = await turn(missing.engine, 'أي وقت');
    assert.equal(missing.preferredCalls.length, 0);
    assert.equal(result.nextState.booking.preferredStart, null);
    assert.equal(result.nextState.booking.step, 'date_period');
  });

  test('doctor constraint is omitted when unset and preserved when explicit', async () => {
    const open = harness();
    await turn(open.engine, 'أقرب موعد');
    assert.equal(open.preferredCalls[0].doctor, null);

    const explicit = harness({ preferredResult: {
      success: true,
      preferredStart: '2026-08-05T09:00:00.000Z',
      date: '2026-08-05',
      time: '12:00',
      doctorId: 'doctor-explicit',
      roomId: 'room-1',
    } });
    await turn(explicit.engine, 'أقرب موعد', state({ doctorId: 'doctor-explicit' }));
    assert.deepEqual(explicit.preferredCalls[0].doctor, { id: 'doctor-explicit' });
  });

  test('engine-assigned resources are rechecked and persisted without changing booking scope', async () => {
    const current = state();
    const { engine, checks } = harness();
    const result = await turn(engine, 'أقرب موعد', current);

    assert.deepEqual(checks[0].doctor, { id: 'doctor-auto' });
    assert.deepEqual(checks[0].room, { id: 'room-auto' });
    assert.equal(result.nextState.booking.doctorId, 'doctor-auto');
    assert.equal(result.nextState.booking.roomId, 'room-auto');
    assert.equal(result.nextState.booking.serviceId, current.booking.serviceId);
    assert.equal(result.nextState.booking.city, current.booking.city);
    assert.equal(result.nextState.booking.branchId, current.booking.branchId);
  });

  test('slot lost before payment uses recovery without losing the session', async () => {
    const current = state();
    const { engine, checks } = harness({
      checkStatus: 'unavailable',
      alternatives: [{ date: '2026-08-05', time: '13:00' }],
    });
    const result = await turn(engine, 'أقرب موعد', current);

    assert.equal(checks.length, 1);
    assert.equal(result.nextState.booking.step, 'availability');
    assert.equal(result.nextState.booking.doctorId, null);
    assert.equal(result.nextState.booking.roomId, null);
    assert.equal(result.nextState.booking.serviceId, current.booking.serviceId);
    assert.equal(result.interaction.purpose, 'select_booking_alternative');
  });

  test('interactive priority and explicit date-time path remain unchanged', async () => {
    const interactive = harness();
    const interactiveResult = await turn(
      interactive.engine,
      'أقرب موعد',
      state(),
      { value: 'date-period:1-10' }
    );
    assert.equal(interactive.preferredCalls.length, 0);
    assert.equal(interactiveResult.nextState.booking.step, 'date');

    const explicit = harness({ preferredResult: null });
    const explicitResult = await turn(explicit.engine, 'بعد بكرة الساعة 6 م');
    assert.equal(explicit.preferredCalls.length, 0);
    assert.equal(explicit.checks.length, 1);
    assert.equal(explicitResult.nextState.booking.preferredStart, '2026-08-07T15:00:00.000Z');
  });
});
