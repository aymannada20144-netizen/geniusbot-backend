'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const formatter = require('../../src/services/shaden/ShadenMessageFormatter');

const BOOKING_PHRASES = [
  'حجز', 'أبغى حجز', 'ابغى حجز', 'أبي حجز', 'ابي حجز', 'أريد حجز', 'اريد حجز',
  'ودي أحجز', 'ودي احجز', 'أبغى أحجز', 'ابغى احجز', 'احجز لي', 'أبغى موعد',
  'ابغى موعد', 'أبي موعد', 'ابي موعد', 'أريد موعد', 'اريد موعد', 'ممكن أحجز',
  'ممكن احجز', 'هل أقدر أحجز', 'ممكن حجز آخر', 'أبغى حجز ثاني',
];

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'عيادات أوريان' },
    assistantIdentity: { name: 'شادن', gender: 'female' },
    services: [
      { id: 'service-filler', name: 'فيلر' },
      { id: 'service-laser', name: 'إزالة الشعر بالليزر' },
    ],
    branches: [
      { id: 'branch-jeddah', name: 'الصالحية', city: 'جدة' },
      { id: 'branch-riyadh', name: 'العليا — الدمام', city: 'الرياض' },
    ],
    specialties: [],
    paymentMethods: [
      { id: 'cash', name: 'كاش', code: 'cash' },
      { id: 'insurance', name: 'تأمين', code: 'insurance' },
    ],
    insuranceCompanies: [{ id: 'bupa', name: 'بوبا' }],
    insuranceClasses: [{ id: 'a', name: 'A', insuranceCompanyId: 'bupa', isAccepted: true }],
    workingHours: [],
  };
}

function idleState() {
  return { version: 1, mode: 'idle', step: null, customer: { name: 'منة' }, context: null, options: [] };
}

function activeBooking(step = 'branch') {
  return {
    ...idleState(),
    booking: {
      step, serviceId: 'service-filler', city: 'جدة', branchId: null,
      doctorId: null, preferredStart: null, paymentMethodId: null,
      insuranceCompanyId: null, insuranceClassId: null,
    },
  };
}

describe('central booking intent precedence', () => {
  const policy = new ShadenPolicy();

  for (const phrase of BOOKING_PHRASES) {
    test(`recognizes booking phrase: ${phrase}`, () => {
      assert.equal(policy.recognize(phrase).type, 'booking');
    });
  }

  for (const [phrase, type] of [
    ['لا أبغى حجز', 'booking_rejection'],
    ['إلغاء الحجز', 'booking_cancellation_request'],
    ['أريد تعديل الحجز', 'booking_modification_request'],
    ['ما رقم الحجز؟', 'booking_reference_request'],
  ]) {
    test(`${phrase} has precedence over generic booking`, () => {
      assert.equal(policy.recognize(phrase).type, type);
    });
  }
});

describe('booking intent runtime behavior', () => {
  test('generic request starts booking without fallback', () => {
    const result = new ShadenEngine().handle({ message: { text: 'ابغى حجز' }, currentState: idleState(), clinicData: clinicData() });
    assert.equal(result.nextState.booking.step, 'service');
    assert.match(result.reply, /الخدمات المتاحة/u);
    assert.doesNotMatch(result.reply, /لم أفهم/u);
  });

  for (const [phrase, serviceId] of [
    ['أبغى حجز فيلر', 'service-filler'],
    ['احجز لي إزالة الشعر بالليزر', 'service-laser'],
  ]) {
    test(`selects an approved mentioned service directly: ${phrase}`, () => {
      const result = new ShadenEngine().handle({ message: { text: phrase }, currentState: idleState(), clinicData: clinicData() });
      assert.equal(result.nextState.booking.serviceId, serviceId);
      assert.equal(result.nextState.booking.step, 'city');
      assert.match(result.reply, /المدن المتاحة/u);
      assert.doesNotMatch(result.reply, /الخدمات المتاحة/u);
    });
  }

  test('unapproved mentioned service does not create a booking', () => {
    const result = new ShadenEngine().handle({ message: { text: 'أبغى حجز زراعة شعر' }, currentState: idleState(), clinicData: clinicData() });
    assert.equal(result.nextState.booking, undefined);
    assert.match(result.reply, /لا نقدم هذه الخدمة/u);
  });

  test('generic booking language does not erase an active booking', () => {
    const original = activeBooking();
    const result = new ShadenEngine().handle({ message: { text: 'ابغى حجز' }, currentState: original, clinicData: clinicData() });
    assert.equal(result.nextState.booking.step, 'branch');
    assert.equal(result.nextState.booking.serviceId, 'service-filler');
    assert.match(result.reply, /الفروع المتاحة/u);
  });

  test('cancellation phrase at confirmation cancels instead of starting a new booking', () => {
    const current = activeBooking('confirmation');
    current.booking.branchId = 'branch-jeddah';
    current.booking.preferredStart = '2026-08-05T08:00:00.000Z';
    current.booking.paymentMethodId = 'cash';
    const result = new ShadenEngine().handle({ message: { text: 'إلغاء الحجز' }, currentState: current, clinicData: clinicData() });
    assert.equal(result.nextState.booking, undefined);
    assert.match(result.reply, /تم إلغاء طلب الحجز/u);
  });
});

describe('central no-active-branch response', () => {
  test('full city question and contextual city follow-up use the identical formatter template', () => {
    const engine = new ShadenEngine();
    const first = engine.handle({ message: { text: 'هل فرع الدمام يعمل الجمعة؟' }, currentState: idleState(), clinicData: clinicData() });
    assert.equal(first.reply, formatter.formatNoActiveBranches('الدمام'));
    assert.equal(first.nextState.booking, undefined);

    const second = engine.handle({ message: { text: 'ولا مكة' }, currentState: first.nextState, clinicData: clinicData() });
    assert.equal(second.reply, formatter.formatNoActiveBranches('مكة'));
    assert.equal(second.nextState.booking, undefined);
  });

  test('city matching uses branch.city rather than text embedded in branch name', () => {
    const result = new ShadenEngine().handle({ message: { text: 'هل لديكم فرع الدمام' }, currentState: idleState(), clinicData: clinicData() });
    assert.equal(result.reply, formatter.formatNoActiveBranches('الدمام'));
  });
});

describe('incomplete insurance summary fails closed', () => {
  test('missing persisted selection returns to the appropriate insurance step without a summary', async () => {
    const current = activeBooking('availability');
    current.booking.branchId = 'branch-jeddah';
    current.booking.preferredStart = null;
    current.booking.paymentMethodId = 'insurance';
    const engine = new ShadenEngine({
      bookingEngine: { checkAvailability: async () => ({ status: 'available' }) },
      clock: { now: () => new Date('2026-07-31T09:00:00.000Z') },
    });
    const result = await engine.handle({
      message: { text: '2026-08-05 11:00' },
      currentState: current,
      clinicData: clinicData(),
    });
    assert.equal(result.nextState.booking.step, 'insurance_company');
    assert.match(result.reply, /اختاري شركة التأمين/u);
    assert.doesNotMatch(result.reply, /راجعي تفاصيل حجزك/u);
  });
});

describe('persisted insurance success through Shaden runtime', () => {
  test('success uses the appointment presentation reference, status, company, and class', async () => {
    const current = activeBooking('confirmation');
    current.booking.branchId = 'branch-jeddah';
    current.booking.preferredStart = '2026-08-05T08:00:00.000Z';
    current.booking.paymentMethodId = 'insurance';
    current.booking.insuranceCompanyId = 'bupa';
    current.booking.insuranceClassId = 'a';
    const engine = new ShadenEngine({
      bookingEngine: {
        async execute() {
          return {
            type: 'booking_created',
            status: 'completed',
            appointment: {
              id: '00000000-0000-4000-8000-000000000099',
              booking_reference: '25DD4527',
              status: 'pending',
              service_name: 'فيلر',
              branch_name: 'الصالحية',
              appointment_start: '2026-08-05T08:00:00.000Z',
              payment_method_name: 'تأمين',
              payment_method_code: 'insurance',
              insurance_company_name: 'بوبا',
              insurance_class_name: 'A',
            },
          };
        },
      },
    });
    const result = await engine.handle({ message: { text: 'نعم' }, currentState: current, clinicData: clinicData() });
    assert.match(result.reply, /تم تسجيل طلب حجزك بنجاح/u);
    assert.match(result.reply, /بانتظار تأكيد العيادة/u);
    assert.match(result.reply, /شركة التأمين:\* بوبا/u);
    assert.match(result.reply, /فئة التأمين:/u);
    assert.match(result.reply, /25DD4527/u);
    assert.doesNotMatch(result.reply, /00000000-0000-4000/u);
    assert.equal(result.nextState.booking, undefined);
  });
});

