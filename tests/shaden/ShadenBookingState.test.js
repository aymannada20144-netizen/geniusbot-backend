'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require(
  '../../src/services/shaden/ShadenEngine'
);

const STEPS = [
  'service',
  'branch',
  'doctor',
  'availability',
  'patient',
  'payment_method',
  'confirmation',
  'ready',
];

describe('Shaden booking state normalization', () => {
  test('default state does not contain booking', () => {
    assert.equal('booking' in handle(null), false);
  });

  test('legacy v1 state without booking remains compatible', () => {
    const state = rootState();
    assert.deepEqual(handle(state), state);
  });

  test('accepts a valid service step', () => {
    assert.deepEqual(handleWithBooking(bookingState()), bookingState());
  });

  test('accepts a valid branch step', () => {
    const booking = bookingState({ step: 'branch', serviceId: 'service-1' });
    assert.deepEqual(handleWithBooking(booking), booking);
  });

  test('accepts a valid state with null doctorId', () => {
    const booking = bookingState({
      step: 'availability',
      serviceId: 'service-1',
      branchId: 'branch-1',
      doctorId: null,
    });
    assert.deepEqual(handleWithBooking(booking), booking);
  });

  test('accepts a valid ready step', () => {
    const booking = readyBooking();
    assert.deepEqual(handleWithBooking(booking), booking);
  });

  for (const step of STEPS) {
    test(`accepts the supported ${step} step`, () => {
      const booking = validBookingForStep(step);
      assert.deepEqual(handleWithBooking(booking), booking);
    });
  }

  test('drops booking with an unknown step', () => {
    assertBookingDropped(bookingState({ step: 'unknown' }));
  });

  test('drops booking with an unknown own property', () => {
    assertBookingDropped({ ...bookingState(), extra: true });
  });

  test('drops booking with a missing required field', () => {
    const booking = bookingState();
    delete booking.doctorId;
    assertBookingDropped(booking);
  });

  for (const [name, booking] of [
    ['array', []],
    ['Date', new Date()],
    ['custom prototype', Object.create({})],
    ['null', null],
  ]) {
    test(`drops booking when it is ${name}`, () => {
      assertBookingDropped(booking);
    });
  }

  test('does not execute a root booking accessor', () => {
    let executed = false;
    const state = rootState();
    Object.defineProperty(state, 'booking', {
      enumerable: true,
      get() {
        executed = true;
        return bookingState();
      },
    });
    assert.equal('booking' in handle(state), false);
    assert.equal(executed, false);
  });

  test('does not execute a booking.step accessor', () => {
    let executed = false;
    const booking = bookingState();
    Object.defineProperty(booking, 'step', {
      enumerable: true,
      get() {
        executed = true;
        return 'service';
      },
    });
    assertBookingDropped(booking);
    assert.equal(executed, false);
  });

  for (const field of [
    'serviceId',
    'branchId',
    'doctorId',
    'paymentMethodId',
  ]) {
    test(`does not execute a booking.${field} accessor`, () => {
      let executed = false;
      const booking = bookingState();
      Object.defineProperty(booking, field, {
        enumerable: true,
        get() {
          executed = true;
          return null;
        },
      });
      assertBookingDropped(booking);
      assert.equal(executed, false);
    });
  }

  test('does not execute a preferredStart accessor', () => {
    let executed = false;
    const booking = bookingState();
    Object.defineProperty(booking, 'preferredStart', {
      enumerable: true,
      get() {
        executed = true;
        return null;
      },
    });
    assertBookingDropped(booking);
    assert.equal(executed, false);
  });

  for (const [name, value] of [
    ['whitespace-only', '   '],
    ['number', 17],
    ['undefined', undefined],
  ]) {
    test(`drops a ${name} ID`, () => {
      assertBookingDropped(bookingState({ serviceId: value }));
    });
  }

  test('drops whitespace-only preferredStart', () => {
    assertBookingDropped(bookingState({ preferredStart: '   ' }));
  });

  test('accepts null doctorId', () => {
    const booking = validBookingForStep('doctor');
    booking.doctorId = null;
    assert.deepEqual(handleWithBooking(booking), booking);
  });

  test('service step permits all selections to be null', () => {
    assert.deepEqual(handleWithBooking(bookingState()), bookingState());
  });

  test('drops branch step without serviceId', () => {
    assertBookingDropped(bookingState({ step: 'branch' }));
  });

  test('drops doctor step without branchId', () => {
    assertBookingDropped(bookingState({
      step: 'doctor',
      serviceId: 'service-1',
    }));
  });

  test('availability step permits null doctorId', () => {
    const booking = validBookingForStep('availability');
    booking.doctorId = null;
    assert.deepEqual(handleWithBooking(booking), booking);
  });

  test('drops patient step without preferredStart', () => {
    assertBookingDropped(bookingState({
      step: 'patient',
      serviceId: 'service-1',
      branchId: 'branch-1',
    }));
  });

  test('drops payment_method step without preferredStart', () => {
    assertBookingDropped(bookingState({
      step: 'payment_method',
      serviceId: 'service-1',
      branchId: 'branch-1',
    }));
  });

  test('drops confirmation step without paymentMethodId', () => {
    assertBookingDropped(bookingState({
      step: 'confirmation',
      serviceId: 'service-1',
      branchId: 'branch-1',
      preferredStart: '2026-08-01T10:00:00.000Z',
    }));
  });

  test('drops ready step without paymentMethodId', () => {
    assertBookingDropped(bookingState({
      step: 'ready',
      serviceId: 'service-1',
      branchId: 'branch-1',
      preferredStart: '2026-08-01T10:00:00.000Z',
    }));
  });

  test('does not mutate the input', () => {
    const state = rootState();
    state.booking = readyBooking();
    const snapshot = structuredClone(state);
    handle(state);
    assert.deepEqual(state, snapshot);
  });

  test('returns a new booking object', () => {
    const booking = readyBooking();
    assert.notEqual(handleWithBooking(booking), booking);
  });

  test('preserves accepted strings without trimming', () => {
    const booking = readyBooking({
      serviceId: ' service-1 ',
      preferredStart: ' 2026-08-01T10:00:00.000Z ',
    });
    assert.deepEqual(handleWithBooking(booking), booking);
  });

  test('preserves booking through a serialization round trip', () => {
    const state = rootState();
    state.booking = readyBooking();
    const first = handle(state);
    const second = handle(JSON.parse(JSON.stringify(first)));
    assert.deepEqual(second.booking, first.booking);
  });

  test('malformed booking does not affect customer or context', () => {
    const state = rootState();
    state.customer.name = 'نورة';
    state.context = { inquiry: 'services' };
    state.booking = bookingState({ step: 'branch' });
    const normalized = handle(state, 'ما الخدمات');
    assert.equal(normalized.customer.name, 'نورة');
    assert.equal('booking' in normalized, false);
  });

  test('current booking message starts booking state without changing mode', () => {
    const normalized = handle(null, 'اريد حجز موعد');
    assert.equal(normalized.mode, 'idle');
    assert.equal(normalized.booking.step, 'service');
  });
});

function handle(currentState, text = 'غير معروف') {
  const engine = new ShadenEngine();
  return engine.handle({
    message: { text },
    currentState,
    clinicData: {},
  }).nextState;
}

function handleWithBooking(booking) {
  const state = rootState();
  state.booking = booking;
  return handle(state).booking;
}

function assertBookingDropped(booking) {
  const state = rootState();
  state.booking = booking;
  assert.equal('booking' in handle(state), false);
}

function rootState() {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: null },
    context: null,
    options: [],
  };
}

function bookingState(overrides = {}) {
  return {
    step: 'service',
    serviceId: null,
    branchId: null,
    doctorId: null,
    preferredStart: null,
    paymentMethodId: null,
    ...overrides,
  };
}

function readyBooking(overrides = {}) {
  return bookingState({
    step: 'ready',
    serviceId: 'service-1',
    branchId: 'branch-1',
    preferredStart: '2026-08-01T10:00:00.000Z',
    paymentMethodId: 'payment-1',
    ...overrides,
  });
}

function validBookingForStep(step) {
  switch (step) {
    case 'service':
      return bookingState();
    case 'branch':
      return bookingState({ step, serviceId: 'service-1' });
    case 'doctor':
    case 'availability':
      return bookingState({
        step,
        serviceId: 'service-1',
        branchId: 'branch-1',
      });
    case 'patient':
    case 'payment_method':
      return bookingState({
        step,
        serviceId: 'service-1',
        branchId: 'branch-1',
        preferredStart: '2026-08-01T10:00:00.000Z',
      });
    case 'confirmation':
    case 'ready':
      return readyBooking({ step });
    default:
      throw new Error(`Unsupported test step: ${step}`);
  }
}
