'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

test('Journey A rejects an incompatible service/branch before availability', async () => {
  const calls = [];
  const engine = engineWithDates(calls);
  const state = bookingState({
    step: 'date_period',
    serviceId: 'service-riyadh',
    city: 'جدة',
    branchId: 'branch-jeddah',
  });
  const rejected = await turn(engine, state, 'التالي');
  assert.equal(calls.length, 0);
  assert.match(rejected.reply, /الخدمة المختارة غير متاحة/u);
  assert.equal(rejected.nextState.booking.step, 'branch');
  assert.equal(rejected.nextState.booking.branchId, null);

  const changed = await turn(engine, rejected.nextState, 'خدمة جدة');
  assert.equal(changed.nextState.booking.serviceId, 'service-jeddah');
  assert.equal(changed.nextState.booking.city, 'جدة');
  assert.equal(changed.nextState.booking.step, 'branch');
  const continued = await interactiveTurn(
    engine,
    changed.nextState,
    'branch:branch-jeddah',
    'فرع جدة'
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    serviceId: 'service-jeddah',
    branchId: 'branch-jeddah',
  });
  assert.equal(continued.nextState.booking.step, 'date_period');
});

test('Journey B changing service clears all dependent booking fields', async () => {
  const engine = engineWithDates([]);
  const state = bookingState({
    step: 'confirmation',
    serviceId: 'service-riyadh',
    city: 'الرياض',
    branchId: 'branch-riyadh',
    doctorId: 'doctor-old',
    roomId: 'room-old',
    date: '2026-08-20',
    datePeriod: 'this_week',
    timePeriod: 'morning',
    preferredStart: '2026-08-20T08:00:00.000Z',
    paymentMethodId: 'cash-old',
    insuranceCompanyId: 'company-old',
    insuranceClassId: 'class-old',
  });
  const result = await turn(engine, state, 'خدمة جدة');
  const booking = result.nextState.booking;
  assert.equal(booking.serviceId, 'service-jeddah');
  assert.equal(booking.city, 'جدة');
  assert.equal(booking.step, 'branch');
  for (const field of [
    'branchId', 'doctorId', 'roomId', 'date', 'datePeriod', 'timePeriod',
    'preferredStart', 'paymentMethodId', 'insuranceCompanyId',
    'insuranceClassId',
  ]) assert.equal(booking[field], null, field);
});

function engineWithDates(calls) {
  return new ShadenEngine({
    clock: { now: () => new Date('2026-08-17T08:00:00.000Z') },
    bookingEngine: {
      async getAvailableDates({ service, branch }) {
        calls.push({ serviceId: service.id, branchId: branch.id });
        return { dates: ['2026-08-20'] };
      },
    },
  });
}

function turn(engine, currentState, text) {
  return engine.handle({
    message: { text, rawPayload: {} },
    currentState,
    clinicData: data(),
    bookingContext: { clinicId: 'clinic-1' },
  });
}

function interactiveTurn(engine, currentState, value, text) {
  return engine.handle({
    message: { text, rawPayload: { value } },
    currentState,
    clinicData: data(),
    bookingContext: { clinicId: 'clinic-1' },
  });
}

function bookingState(overrides) {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'نورة' },
    context: null,
    options: [],
    booking: {
      step: 'service', specialtyId: null, serviceId: null, city: null,
      branchId: null, doctorId: null, roomId: null, date: null,
      datePeriod: null, timePeriod: null, preferredStart: null,
      paymentMethodId: null, insuranceCompanyId: null,
      insuranceClassId: null, ...overrides,
    },
  };
}

function data() {
  return {
    clinic: { id: 'clinic-1', name: 'العيادة' },
    services: [
      { id: 'service-riyadh', name: 'خدمة الرياض', isBookingEnabled: true },
      { id: 'service-jeddah', name: 'خدمة جدة', isBookingEnabled: true },
    ],
    branches: [
      { id: 'branch-riyadh', name: 'فرع الرياض', city: 'الرياض' },
      { id: 'branch-jeddah', name: 'فرع جدة', city: 'جدة' },
    ],
    serviceBranchCompatibilityAvailable: true,
    serviceBranchAssignments: [
      { serviceId: 'service-riyadh', branchId: 'branch-riyadh' },
      { serviceId: 'service-jeddah', branchId: 'branch-jeddah' },
    ],
    specialties: [], paymentMethods: [], insuranceCompanies: [],
    insuranceClasses: [], workingHours: [],
  };
}
