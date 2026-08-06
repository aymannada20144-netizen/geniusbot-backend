'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'عيادات أوريان' },
    assistantIdentity: { name: 'شادن', gender: 'female' },
    services: [{ id: 'service-filler', name: 'فيلر' }],
    branches: [{
      id: 'branch-jeddah',
      name: 'الصالحية',
      city: 'جدة',
      timezone: 'Asia/Riyadh',
    }],
    specialties: [],
    paymentMethods: [{ id: 'cash', name: 'كاش', code: 'cash' }],
    insuranceCompanies: [],
    insuranceClasses: [],
    workingHours: [],
  };
}

function datePeriodState() {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'منة' },
    context: { source: 'characterization-test' },
    options: [],
    booking: {
      step: 'date_period',
      serviceId: 'service-filler',
      city: 'جدة',
      branchId: 'branch-jeddah',
      doctorId: 'doctor-7',
      date: null,
      datePeriod: null,
      timePeriod: null,
      preferredStart: null,
      paymentMethodId: 'cash',
      insuranceCompanyId: null,
      insuranceClassId: null,
    },
  };
}

function availableDatesEngine(onAvailability = null) {
  return {
    async getAvailableDates() {
      return { success: true, dates: ['2026-08-08', '2026-08-12', '2026-08-19'] };
    },
    async checkAvailability(command) {
      onAvailability?.(command);
      return { status: 'available', metadata: {} };
    },
  };
}

function engine(onAvailability = null) {
  return new ShadenEngine({
    bookingEngine: availableDatesEngine(onAvailability),
    clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
  });
}

function turn(message, currentState = datePeriodState(), bookingEngine = engine()) {
  return bookingEngine.handle({
    message,
    currentState,
    clinicData: clinicData(),
    bookingContext: { clinicId: 'clinic-1' },
  });
}

function assertPriorBookingDataPreserved(actual, before) {
  for (const field of [
    'serviceId',
    'city',
    'branchId',
    'doctorId',
    'paymentMethodId',
    'insuranceCompanyId',
    'insuranceClassId',
  ]) {
    assert.equal(actual[field], before[field], `${field} should be preserved`);
  }
}

describe('date_period integration boundary', () => {
  test('natural-language date-time uses the production parser and current availability path', async () => {
    const current = datePeriodState();
    let availabilityCommand;
    const result = await turn(
      { text: 'بعد بكرة الساعة 6 م' },
      current,
      engine((command) => { availabilityCommand = command; })
    );

    assert.equal(
      availabilityCommand.availability.preferredStart,
      '2026-08-07T15:00:00.000Z'
    );
    assert.equal(result.nextState.booking.step, 'confirmation');
    assert.equal(result.nextState.booking.datePeriod, null);
    assert.equal(result.nextState.booking.date, null);
    assert.equal(
      result.nextState.booking.preferredStart,
      '2026-08-07T15:00:00.000Z'
    );
    assertPriorBookingDataPreserved(result.nextState.booking, current.booking);
  });

  test('valid interactiveReplyId stores the selected period and advances unchanged', async () => {
    const current = datePeriodState();
    const result = await turn({
      text: '11–20',
      rawPayload: { value: 'date-period:11-20' },
    }, current);

    assert.equal(result.nextState.booking.step, 'date');
    assert.equal(result.nextState.booking.datePeriod, '11-20');
    assert.equal(result.interaction.purpose, 'select_date');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'date:2026-08-12',
      'date:2026-08-19',
    ]);
    assertPriorBookingDataPreserved(result.nextState.booking, current.booking);
  });

  test('unrecognized text redisplays periods without resetting prior booking data', async () => {
    const current = datePeriodState();
    const before = structuredClone(current.booking);
    const result = await turn({ text: 'نص غير مفهوم' }, current);

    assert.equal(result.nextState.booking.step, 'date_period');
    assert.equal(result.interaction.purpose, 'select_date_period');
    assertPriorBookingDataPreserved(result.nextState.booking, before);
    assert.equal(result.nextState.booking.datePeriod, null);
    assert.equal(result.nextState.booking.preferredStart, null);
  });

  test('parser failure is contained and redisplays periods without resetting booking', async () => {
    const parserPath = require.resolve('../../src/services/shaden/BookingDateTimeParser');
    const enginePath = require.resolve('../../src/services/shaden/ShadenEngine');
    const cachedParser = require.cache[parserPath];
    const cachedEngine = require.cache[enginePath];
    require.cache[parserPath] = {
      ...cachedParser,
      exports: {
        ...cachedParser.exports,
        parsePreferredStart() {
          throw new Error('parser failure');
        },
      },
    };
    delete require.cache[enginePath];
    const EngineWithFailingParser = require('../../src/services/shaden/ShadenEngine');
    require.cache[parserPath] = cachedParser;
    require.cache[enginePath] = cachedEngine;

    const current = datePeriodState();
    const before = structuredClone(current.booking);
    const failingEngine = new EngineWithFailingParser({
      bookingEngine: availableDatesEngine(),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    });
    const result = await turn({ text: 'بعد بكرة الساعة 6 م' }, current, failingEngine);

    assert.equal(result.nextState.booking.step, 'date_period');
    assert.equal(result.interaction.purpose, 'select_date_period');
    assertPriorBookingDataPreserved(result.nextState.booking, before);
    assert.equal(result.nextState.booking.preferredStart, null);
  });
});
