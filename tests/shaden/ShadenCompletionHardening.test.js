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
    assert.equal(result.interaction.version, 1);
    assert.equal(result.interaction.mode, 'list');
    assert.equal(result.interaction.purpose, 'select_service');
    assert.equal(
      result.interaction.displayText,
      '✨ اختاري الخدمة المناسبة من القائمة.'
    );
    assert.equal(
      result.interaction.options.some((option) => 'description' in option),
      false
    );
    assert.deepEqual(
      result.interaction.options.map((option) => option.id),
      ['service:service-filler', 'service:service-laser']
    );
  });

  test('large service selection paginates deterministically without losing services', () => {
    const engine = new ShadenEngine();
    const data = clinicData();
    data.services = Array.from({ length: 18 }, (_, index) => ({
      id: `service-${index + 1}`,
      name: `خدمة ${String(index + 1).padStart(2, '0')}`,
    }));

    const first = engine.handle({
      message: { text: 'ابغى حجز' },
      currentState: idleState(),
      clinicData: data,
    });
    assert.equal(first.interaction.listPrompt, 'عرض الخدمات');
    assert.equal(first.interaction.options.length, 9);
    assert.equal(first.interaction.options.at(-1).label, 'عرض المزيد');

    const second = engine.handle({
      message: { text: 'عرض المزيد' },
      currentState: first.nextState,
      clinicData: data,
    });
    assert.equal(second.nextState.booking.step, 'service');
    assert.equal(second.interaction.options.length, 10);
    assert.equal(second.interaction.options.at(-2).label, 'السابق');
    assert.equal(second.interaction.options.at(-1).label, 'عرض المزيد');

    const third = engine.handle({
      message: { text: 'عرض المزيد' },
      currentState: second.nextState,
      clinicData: data,
    });
    assert.equal(third.interaction.options.length, 3);
    assert.equal(third.interaction.options.at(-1).label, 'السابق');

    const serviceIds = [first, second, third].flatMap((result) =>
      result.interaction.options
        .filter((option) => option.id.startsWith('service:'))
        .map((option) => option.id)
    );
    assert.deepEqual(serviceIds, data.services.map(({ id }) => `service:${id}`));

    const selected = engine.handle({
      message: { text: 'خدمة 10' },
      currentState: second.nextState,
      clinicData: data,
    });
    assert.equal(selected.nextState.booking.serviceId, 'service-10');
    assert.equal(selected.nextState.booking.step, 'city');
    assert.deepEqual(selected.nextState.options, []);
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
      assert.equal(result.interaction.mode, 'list');
      assert.equal(result.interaction.purpose, 'select_city');
      assert.equal(result.interaction.displayText, '🏙️ اختاري المدينة المناسبة.');
      assert.equal(
        result.interaction.options.some((option) => 'description' in option),
        false
      );
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
    assert.equal(result.interaction.mode, 'list');
    assert.equal(result.interaction.purpose, 'select_branch');
    assert.equal(result.interaction.displayText, '📍 اختاري الفرع المناسب.');
    assert.equal(
      result.interaction.options.some((option) => 'description' in option),
      false
    );
    assert.deepEqual(
      result.interaction.options.map((option) => option.id),
      ['branch:branch-jeddah']
    );
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

describe('unified interactive presentation', () => {
  test('general inquiries with structured options use the shared interaction contract', () => {
    const engine = new ShadenEngine();
    const data = clinicData();
    data.specialties = [
      { id: 'specialty-derma', name: 'الجلدية' },
      { id: 'specialty-dental', name: 'الأسنان' },
    ];

    for (const [text, purpose, mode] of [
      ['ما الخدمات', 'view_services', 'list'],
      ['ما التخصصات', 'view_specialties', 'list'],
      ['ما الفروع', 'view_branches', 'list'],
      ['ما طرق الدفع', 'view_payment_methods', 'reply_buttons'],
      ['ما شركات التأمين', 'view_insurance_companies', 'list'],
      ['ما فئات التأمين', 'view_insurance_classes', 'reply_buttons'],
    ]) {
      const result = engine.handle({
        message: { text },
        currentState: idleState(),
        clinicData: data,
      });
      assert.equal(result.interaction.version, 1, text);
      assert.equal(result.interaction.purpose, purpose, text);
      assert.equal(result.interaction.mode, mode, text);
      assert.ok(result.interaction.displayText, text);
      assert.ok(result.reply, text);
      assert.equal(result.nextState.booking, undefined, text);
    }
  });

  test('informational responses without options remain text', () => {
    const result = new ShadenEngine().handle({
      message: { text: 'شكرا' },
      currentState: idleState(),
      clinicData: clinicData(),
    });
    assert.equal(typeof result.reply, 'string');
    assert.equal(result.interaction, undefined);
  });

  test('general service pagination is navigation and never starts booking', () => {
    const engine = new ShadenEngine();
    const data = clinicData();
    data.services = Array.from({ length: 18 }, (_, index) => ({
      id: `general-service-${index + 1}`,
      name: `خدمة عامة ${String(index + 1).padStart(2, '0')}`,
    }));

    const first = engine.handle({
      message: { text: 'ما الخدمات' },
      currentState: idleState(),
      clinicData: data,
    });
    const second = engine.handle({
      message: { text: 'عرض المزيد' },
      currentState: first.nextState,
      clinicData: data,
    });
    const previous = engine.handle({
      message: { text: 'السابق' },
      currentState: second.nextState,
      clinicData: data,
    });

    assert.equal(first.interaction.purpose, 'view_services');
    assert.equal(second.interaction.purpose, 'view_services');
    assert.equal(previous.interaction.purpose, 'view_services');
    assert.equal(second.nextState.booking, undefined);
    assert.equal(previous.nextState.booking, undefined);
    assert.equal(second.interaction.options.length <= 10, true);
    assert.equal(previous.interaction.options[0].id, first.interaction.options[0].id);
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
  test('pending success omits presentation details and keeps the waiting state', async () => {
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
    assert.match(result.reply, /ستصلك رسالة منفصلة بعد التأكيد/u);
    assert.doesNotMatch(result.reply, /شركة التأمين|فئة التأمين|25DD4527/u);
    assert.doesNotMatch(result.reply, /00000000-0000-4000/u);
    assert.equal(result.nextState.booking, undefined);
  });
});
