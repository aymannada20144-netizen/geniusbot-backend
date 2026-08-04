'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const BookingEngine = require('../../src/modules/bookings/BookingEngine');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

describe('Shaden confirmed booking execution', () => {
  test('confirmation executes BookingEngine once and reports persisted success', async () => {
    const calls = [];
    const engine = createEngine(async (input) => {
      calls.push(input);
      return successfulServiceResult();
    });
    const result = await confirm(engine);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].clinic_id, 'clinic-1');
    assert.equal(calls[0].phone_number, '+966500000001');
    assert.equal(calls[0].full_name, 'إسراء');
    assert.equal(
      result.reply.replaceAll('\u200f', ''),
      '✅ تم تسجيل طلب حجزك بنجاح\n\n' +
      'طلبك بانتظار تأكيد العيادة، وستصلك رسالة منفصلة بعد التأكيد 🌸'
    );
    assert.equal('booking' in result.nextState, false);
  });

  test('failed BookingResult does not claim success and preserves confirmation', async () => {
    const engine = createEngine(async () => ({
      success: false,
      reason: 'validation_failed',
    }));
    const result = await confirm(engine);

    assert.doesNotMatch(result.reply, /تم حجز موعدك بنجاح/);
    assert.match(result.reply, /لم يتم إنشاء الحجز/);
    assert.equal(result.nextState.booking.step, 'confirmation');
  });

  test('unavailable result preserves booking and requests another time', async () => {
    const engine = createEngine(async () => ({
      success: false,
      reason: 'slot_not_available',
      availability: { available: false },
    }));
    const result = await confirm(engine);

    assert.doesNotMatch(result.reply, /تم حجز موعدك بنجاح/);
    assert.match(result.reply, /غير متاح/);
    assert.equal(result.nextState.booking.step, 'availability');
    assert.equal(result.nextState.booking.preferredStart, null);
    assert.equal(result.nextState.booking.serviceId, 'service-1');
  });

  test('replacement time preserves insurance and payment selections', async () => {
    const engine = createEngine(async () => ({
      success: false,
      reason: 'slot_not_available',
      availability: { available: false },
    }));
    const unavailable = await turn(engine, bookingState({
      paymentMethodId: 'insurance-1',
      insuranceCompanyId: 'company-1',
      insuranceClassId: 'class-a',
    }), 'Ù†Ø¹Ù…');

    const replacement = await turn(
      engine,
      unavailable.nextState,
      '2026-08-03 11:00'
    );

    assert.equal(replacement.nextState.booking.step, 'confirmation');
    assert.equal(replacement.nextState.booking.paymentMethodId, 'insurance-1');
    assert.equal(replacement.nextState.booking.insuranceCompanyId, 'company-1');
    assert.equal(replacement.nextState.booking.insuranceClassId, 'class-a');
  });

  test('a repeated confirmation after success does not execute again', async () => {
    let calls = 0;
    const engine = createEngine(async () => {
      calls += 1;
      return successfulServiceResult();
    });
    const first = await confirm(engine);
    const second = await engine.handle({
      message: { text: 'نعم' },
      currentState: first.nextState,
      clinicData: clinicData(),
      bookingContext: bookingContext(),
    });

    assert.equal(calls, 1);
    assert.equal('booking' in second.nextState, false);
  });

  test('insurance requires a company and accepted class before confirmation', async () => {
    const engine = createEngine(async () => successfulServiceResult());
    let state = bookingState({ step: 'payment_method', paymentMethodId: null });

    let result = await turn(engine, state, 'تأمين');
    assert.equal(result.nextState.booking.step, 'insurance_company');
    assert.equal(typeof result.reply, 'string');
    assert.equal(result.interaction.version, 1);
    assert.equal(result.interaction.mode, 'list');
    assert.equal(result.interaction.purpose, 'select_insurance_company');
    assert.equal(result.interaction.displayText, '🛡️ اختاري شركة التأمين.');
    assert.equal(result.interaction.listPrompt, 'عرض الشركات');
    assert.deepEqual(result.interaction.options, [
      { id: 'company-1', label: 'شركة ألف' },
      { id: 'company-2', label: 'بوبا' },
      { id: 'company-3', label: 'التعاونية' },
    ]);
    assert.equal(
      result.interaction.options.some((option) => 'description' in option),
      false
    );
    state = result.nextState;

    result = await turn(engine, state, 'شركة ألف');
    assert.equal(result.nextState.booking.step, 'insurance_class');
    assert.equal(result.interaction, undefined);
    state = result.nextState;

    result = await turn(engine, state, 'فئة A');
    assert.equal(result.nextState.booking.step, 'confirmation');
    assert.equal(result.nextState.booking.insuranceCompanyId, 'company-1');
    assert.equal(result.nextState.booking.insuranceClassId, 'class-a');
    assert.equal(result.interaction, undefined);
  });

  test('payment selection exposes the active methods as reply buttons', async () => {
    const engine = createEngine(async () => successfulServiceResult());
    const result = await turn(engine, bookingState({
      step: 'payment_method',
      paymentMethodId: null,
    }), 'اختيار غير صالح');

    assert.equal(result.reply && typeof result.reply, 'string');
    assert.equal(result.nextState.booking.step, 'payment_method');
    assert.equal(result.interaction.version, 1);
    assert.equal(result.interaction.mode, 'reply_buttons');
    assert.equal(result.interaction.purpose, 'select_payment_method');
    assert.equal(result.interaction.displayText, '💳 اختاري طريقة الدفع.');
    assert.deepEqual(
      result.interaction.options.map((option) => option.id),
      ['cash-1', 'insurance-1']
    );
    assert.deepEqual(
      result.interaction.options.map((option) => option.label),
      ['كاش', 'تأمين']
    );
  });

  test('invalid insurance company selection repeats the list', async () => {
    const result = await turn(
      createEngine(async () => successfulServiceResult()),
      bookingState({
        step: 'insurance_company',
        paymentMethodId: 'insurance-1',
      }),
      'شركة غير موجودة'
    );
    assert.equal(result.nextState.booking.step, 'insurance_company');
    assert.equal(typeof result.reply, 'string');
    assert.equal(result.interaction.purpose, 'select_insurance_company');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'company-1', 'company-2', 'company-3',
    ]);
  });

  test('invalid insurance company option sets preserve text fallback', async () => {
    const invalidSets = [
      [],
      Array.from({ length: 11 }, (_, index) => ({
        id: `company-${index}`, name: `شركة ${index}`,
      })),
      [{ id: '', name: 'بوبا' }],
      [{ id: 'company-1', name: '' }],
      [{ id: 'duplicate', name: 'بوبا' }, { id: 'duplicate', name: 'التعاونية' }],
    ];
    for (const insuranceCompanies of invalidSets) {
      const data = clinicData();
      data.insuranceCompanies = insuranceCompanies;
      const result = await new ShadenEngine().handle({
        message: { text: 'تأمين' },
        currentState: bookingState({
          step: 'payment_method',
          paymentMethodId: null,
        }),
        clinicData: data,
        bookingContext: bookingContext(),
      });
      assert.equal(typeof result.reply, 'string');
      assert.equal(result.interaction, undefined);
      assert.equal(result.nextState.booking.step, 'insurance_company');
    }
  });

  test('general insurance company inquiry remains text only', async () => {
    const result = await new ShadenEngine().handle({
      message: { text: 'ما شركات التأمين؟' },
      currentState: null,
      clinicData: clinicData(),
    });
    assert.equal(typeof result.reply, 'string');
    assert.equal(result.interaction, undefined);
  });

  test('invalid payment option counts preserve the text response', async () => {
    const data = clinicData();
    data.paymentMethods = [];
    const result = await new ShadenEngine().handle({
      message: { text: 'اختيار غير صالح' },
      currentState: bookingState({
        step: 'payment_method',
        paymentMethodId: null,
      }),
      clinicData: data,
      bookingContext: bookingContext(),
    });
    assert.equal(typeof result.reply, 'string');
    assert.equal(result.interaction, undefined);
  });

  test('more than three payment methods preserve the text response', async () => {
    const data = clinicData();
    data.paymentMethods.push(
      { id: 'card-1', name: 'Card', code: 'card' },
      { id: 'transfer-1', name: 'Transfer', code: 'transfer' }
    );
    const result = await new ShadenEngine().handle({
      message: { text: 'اختيار غير صالح' },
      currentState: bookingState({
        step: 'payment_method', paymentMethodId: null,
      }),
      clinicData: data,
      bookingContext: bookingContext(),
    });
    assert.equal(typeof result.reply, 'string');
    assert.equal(result.interaction, undefined);
  });

  test('async availability transition preserves the payment interaction', async () => {
    const engine = new ShadenEngine({
      bookingEngine: new BookingEngine({
        bookingService: {
          bookAppointment: async () => successfulServiceResult(),
          checkAvailability: async () => ({
            success: true,
            availability: { available: true },
            assignment: { doctor_id: 'doctor-17' },
          }),
        },
      }),
    });
    const initialState = bookingState({
      step: 'availability',
      preferredStart: null,
      paymentMethodId: null,
    });
    const originalBooking = structuredClone(initialState.booking);
    const result = await turn(engine, initialState, '2026-08-10 11:00');

    assert.equal(typeof result.reply, 'string');
    assert.ok(result.nextState);
    assert.equal(result.nextState.booking.step, 'payment_method');
    assert.equal(result.nextState.booking.serviceId, originalBooking.serviceId);
    assert.equal(result.nextState.booking.branchId, originalBooking.branchId);
    assert.equal(result.interaction.version, 1);
    assert.equal(result.interaction.mode, 'reply_buttons');
    assert.equal(result.interaction.purpose, 'select_payment_method');
    assert.equal(result.interaction.displayText, '💳 اختاري طريقة الدفع.');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'cash-1', 'insurance-1',
    ]);
  });

  test('rejected insurance class can continue with cash without restarting', async () => {
    const engine = createEngine(async () => successfulServiceResult());
    const state = bookingState({
      step: 'insurance_class',
      paymentMethodId: 'insurance-1',
      insuranceCompanyId: 'company-1',
    });

    let result = await turn(engine, state, 'فئة C');
    assert.equal(result.nextState.booking.step, 'insurance_class');
    assert.match(result.reply, /غير مقبولة/);

    result = await turn(engine, result.nextState, 'كاش');
    assert.equal(result.nextState.booking.step, 'confirmation');
    assert.equal(result.nextState.booking.paymentMethodId, 'cash-1');
    assert.equal(result.nextState.booking.serviceId, 'service-1');
  });
});

function createEngine(bookAppointment) {
  return new ShadenEngine({
    bookingEngine: new BookingEngine({
      bookingService: { bookAppointment },
    }),
  });
}

function confirm(engine) {
  return turn(engine, bookingState(), 'نعم');
}

function turn(engine, currentState, text) {
  return Promise.resolve(engine.handle({
    message: { text },
    currentState,
    clinicData: clinicData(),
    bookingContext: bookingContext(),
  }));
}

function bookingState(overrides = {}) {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'إسراء' },
    context: null,
    options: [],
    booking: {
      step: 'confirmation',
      serviceId: 'service-1',
      branchId: 'branch-1',
      doctorId: null,
      preferredStart: '2026-08-02T14:00:00.000Z',
      paymentMethodId: 'cash-1',
      insuranceCompanyId: null,
      insuranceClassId: null,
      ...overrides,
    },
  };
}

function bookingContext() {
  return {
    clinicId: 'clinic-1',
    conversationId: 'conversation-1',
    channel: 'whatsapp',
    channelIdentity: '+966500000001',
    patientId: null,
  };
}

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'العيادة' },
    services: [{ id: 'service-1', name: 'إزالة الشعر بالليزر' }],
    branches: [{ id: 'branch-1', name: 'فرع الروضة' }],
    paymentMethods: [
      { id: 'cash-1', name: 'Cash', code: 'cash' },
      { id: 'insurance-1', name: 'Insurance', code: 'insurance' },
    ],
    insuranceCompanies: [
      { id: 'company-1', name: 'شركة ألف' },
      { id: 'company-2', name: 'بوبا' },
      { id: 'company-3', name: 'التعاونية' },
    ],
    insuranceClasses: [
      {
        id: 'class-a',
        insuranceCompanyId: 'company-1',
        name: 'فئة A',
        isAccepted: true,
      },
      {
        id: 'class-c',
        insuranceCompanyId: 'company-1',
        name: 'فئة C',
        isAccepted: false,
      },
    ],
    specialties: [],
    workingHours: [],
  };
}

function successfulServiceResult() {
  return {
    success: true,
    stage: 'appointment_created',
    clinic: {},
    service: {},
    patient: {
      id: 'patient-1',
      clinic_id: 'clinic-1',
      full_name: 'إسراء',
      phone_number: '+966500000001',
    },
    availability: { available: true },
    assignment: { doctor_id: 'doctor-17' },
    appointment: { id: 'appointment-100', booking_reference: '25DD4527', status: 'pending' },
  };
}
