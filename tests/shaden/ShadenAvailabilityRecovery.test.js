'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');

const NOW = new Date('2026-08-05T08:00:00.000Z');
const REQUEST = 'بعد بكرة الساعة 6 م';

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

function bookingState(step = 'date_period') {
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
      doctorId: 'doctor-1',
      date: null,
      datePeriod: null,
      timePeriod: null,
      preferredStart: step === 'availability' ? 'date:2026-08-07' : null,
      paymentMethodId: 'cash',
      insuranceCompanyId: null,
      insuranceClassId: null,
    },
  };
}

function harness({
  availability = ['unavailable'],
  alternatives = [],
  alternativesError = null,
} = {}) {
  const checks = [];
  const alternativeCalls = [];
  const bookingEngine = {
    async getAvailableDates() {
      return { success: true, dates: ['2026-08-07', '2026-08-08'] };
    },
    async checkAvailability(command) {
      checks.push(command);
      return { status: availability.shift() || 'unavailable', reason: 'slot_not_available' };
    },
    async getAvailableAlternatives(command) {
      alternativeCalls.push(command);
      if (alternativesError) throw alternativesError;
      return { success: true, alternatives };
    },
  };
  const engine = new ShadenEngine({
    bookingEngine,
    clock: { now: () => NOW },
  });
  return { engine, checks, alternativeCalls };
}

function turn(engine, message, currentState = bookingState()) {
  return engine.handle({
    message,
    currentState,
    clinicData: clinicData(),
    bookingContext: { clinicId: 'clinic-1' },
  });
}

const alternatives = [
  { date: '2026-08-07', time: '17:00' },
  { date: '2026-08-07', time: '19:00' },
  { date: '2026-08-08', time: '09:00' },
];

describe('minimal availability recovery', () => {
  test('available natural-language appointment keeps the existing success path', async () => {
    const { engine, checks, alternativeCalls } = harness({ availability: ['available'] });
    const result = await turn(engine, { text: REQUEST });

    assert.equal(result.nextState.booking.step, 'confirmation');
    assert.equal(result.nextState.booking.preferredStart, '2026-08-07T15:00:00.000Z');
    assert.equal(checks.length, 1);
    assert.equal(alternativeCalls.length, 0);
  });

  test('unavailable appointment shows at most three structured alternatives in supplied order', async () => {
    const offered = [...alternatives, { date: '2026-08-09', time: '10:00' }];
    const { engine, alternativeCalls } = harness({ alternatives: offered });
    const current = bookingState();
    const result = await turn(engine, { text: REQUEST }, current);

    assert.equal(result.interaction.mode, 'reply_buttons');
    assert.equal(result.interaction.purpose, 'select_booking_alternative');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'booking-alternative:2026-08-07T17:00',
      'booking-alternative:2026-08-07T19:00',
      'booking-alternative:2026-08-08T09:00',
    ]);
    assert.deepEqual(alternativeCalls[0], {
      clinicId: 'clinic-1',
      service: { id: 'service-1' },
      branch: { id: 'branch-1' },
      doctor: { id: 'doctor-1' },
      preferredStart: '2026-08-07T15:00:00.000Z',
      limit: 3,
    });
    assert.equal(result.nextState.booking.serviceId, current.booking.serviceId);
    assert.equal(result.nextState.booking.city, current.booking.city);
    assert.equal(result.nextState.booking.branchId, current.booking.branchId);
    assert.equal(result.nextState.booking.doctorId, current.booking.doctorId);
  });

  test('valid alternative id is rechecked and continues the same booking', async () => {
    const { engine, checks } = harness({ availability: ['available'] });
    const current = bookingState('availability');
    const result = await turn(engine, {
      text: 'موعد بديل',
      rawPayload: { value: 'booking-alternative:2026-08-07T17:00' },
    }, current);

    assert.equal(checks.length, 1);
    assert.equal(checks[0].availability.preferredStart, '2026-08-07T14:00:00.000Z');
    assert.equal(result.nextState.booking.preferredStart, '2026-08-07T14:00:00.000Z');
    assert.equal(result.nextState.booking.step, 'confirmation');
    assert.equal(result.nextState.booking.serviceId, 'service-1');
    assert.equal(result.nextState.booking.branchId, 'branch-1');
    assert.equal(result.nextState.booking.doctorId, 'doctor-1');
  });

  test('malformed or out-of-step alternative ids are not consumed', async () => {
    const malformed = harness({ availability: ['available'] });
    const current = bookingState('availability');
    const malformedResult = await turn(malformed.engine, {
      text: 'موعد بديل',
      rawPayload: { value: 'booking-alternative:not-a-slot' },
    }, current);
    assert.equal(malformed.checks.length, 0);
    assert.equal(malformedResult.nextState.booking.step, 'availability');
    assert.equal(malformedResult.nextState.booking.preferredStart, 'date:2026-08-07');

    const wrongStep = harness({ availability: ['available'] });
    const wrongStepResult = await turn(wrongStep.engine, {
      text: 'موعد بديل',
      rawPayload: { value: 'booking-alternative:2026-08-07T17:00' },
    });
    assert.equal(wrongStep.checks.length, 0);
    assert.equal(wrongStepResult.nextState.booking.step, 'date_period');
  });

  test('alternative that became unavailable is not saved and safely refreshes recovery', async () => {
    const { engine } = harness({ availability: ['unavailable'], alternatives });
    const result = await turn(engine, {
      text: 'موعد بديل',
      rawPayload: { value: 'booking-alternative:2026-08-07T17:00' },
    }, bookingState('availability'));

    assert.equal(result.nextState.booking.step, 'availability');
    assert.notEqual(result.nextState.booking.preferredStart, '2026-08-07T14:00:00.000Z');
    assert.equal(result.interaction.purpose, 'select_booking_alternative');
  });

  test('no alternatives uses the stable rejection reply', async () => {
    const { engine } = harness({ alternatives: [] });
    const result = await turn(engine, { text: REQUEST });
    const expected = new ShadenPolicy().bookingAvailabilityRejected({
      reason: 'slot_not_available',
      branch: clinicData().branches[0],
    });

    assert.equal(result.reply, expected);
    assert.equal(result.interaction, undefined);
    assert.equal(result.nextState.booking.step, 'availability');
  });

  test('alternative lookup failure uses stable fallback and preserves session', async () => {
    const current = bookingState();
    const { engine } = harness({ alternativesError: new Error('lookup failed') });
    const result = await turn(engine, { text: REQUEST }, current);

    assert.equal(result.interaction, undefined);
    assert.equal(result.nextState.booking.step, 'availability');
    assert.equal(result.nextState.booking.serviceId, current.booking.serviceId);
    assert.equal(result.nextState.booking.city, current.booking.city);
    assert.equal(result.nextState.booking.branchId, current.booking.branchId);
    assert.equal(result.nextState.booking.doctorId, current.booking.doctorId);
  });
});
