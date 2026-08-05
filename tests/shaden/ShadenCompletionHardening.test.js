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

function categorizedClinicData({ includeUncategorized = false } = {}) {
  const data = clinicData();
  data.specialties = [
    { id: 'specialty-derma', name: 'الجلدية' },
    { id: 'specialty-laser', name: 'الليزر' },
  ];
  data.services = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `derma-${index + 1}`,
      name: `جلدية ${index + 1}`,
      specialtyId: 'specialty-derma',
      isBookingEnabled: true,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `laser-${index + 1}`,
      name: `ليزر ${index + 1}`,
      specialtyId: 'specialty-laser',
      isBookingEnabled: true,
    })),
  ];
  if (includeUncategorized) {
    data.services.push({
      id: 'other-1',
      name: 'خدمة أخرى',
      specialtyId: null,
      isBookingEnabled: true,
    });
  }
  return data;
}

function actualServiceSelectionShape() {
  const data = clinicData();
  data.specialties = Array.from({ length: 5 }, (_, index) => ({
    id: `specialty-${index + 1}`,
    name: `تخصص ${index + 1}`,
  }));
  data.services = Array.from({ length: 17 }, (_, index) => ({
    id: `service-${index + 1}`,
    name: `خدمة ${index + 1}`,
    specialtyId: `specialty-${(index % 5) + 1}`,
    isBookingEnabled: true,
  }));
  return data;
}

function availableDatesEngine(
  dates = ['2026-08-06', '2026-08-07'],
  times = ['09:00', '12:00', '16:00', '19:00'],
  availabilityStatus = 'available'
) {
  return {
    async getAvailableDates() {
      return { success: true, dates };
    },
    async getAvailableTimes() {
      return { success: true, times };
    },
    async checkAvailability() {
      return { status: availabilityStatus, metadata: {} };
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
      '💎 اختاري الخدمة:'
    );
    assert.equal(result.interaction.listPrompt, 'عرض الخدمات');
    assert.equal(
      result.interaction.options.some((option) => 'description' in option),
      false
    );
    assert.deepEqual(
      result.interaction.options.map((option) => option.id),
      ['service:service-filler', 'service:service-laser']
    );
  });

  test('more than ten services starts with specialties', () => {
    const result = new ShadenEngine().handle({
      message: { text: 'أبغى حجز' },
      currentState: idleState(),
      clinicData: categorizedClinicData(),
    });
    assert.equal(result.nextState.booking.step, 'specialty');
    assert.equal(result.interaction.purpose, 'select_specialty');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'specialty:specialty-derma',
      'specialty:specialty-laser',
    ]);
  });

  test('active service step with 17 services and 5 specialties returns specialty list', () => {
    const data = actualServiceSelectionShape();
    const state = activeBooking('service');
    state.booking.serviceId = null;
    state.booking.specialtyId = null;
    let formatServicesCalls = 0;
    const policy = new ShadenPolicy();
    const originalServices = policy.services.bind(policy);
    policy.services = (...args) => {
      formatServicesCalls += 1;
      return originalServices(...args);
    };

    const result = new ShadenEngine({ policy }).handle({
      message: { text: 'أبغى حجز' },
      currentState: state,
      clinicData: data,
    });

    assert.equal(result.nextState.booking.step, 'specialty');
    assert.equal(result.interaction?.mode, 'list');
    assert.equal(result.interaction?.listPrompt, 'عرض التخصصات');
    assert.equal(result.interaction?.options.length, 5);
    assert.equal(formatServicesCalls, 0);
    assert.doesNotMatch(result.reply, /الخدمات المتاحة في عيادات أوريان/u);
  });

  test('specialty reply shows only services in that specialty', () => {
    const engine = new ShadenEngine();
    const data = categorizedClinicData();
    const first = engine.handle({
      message: { text: 'حجز' },
      currentState: idleState(),
      clinicData: data,
    });
    const result = engine.handle({
      message: {
        text: 'الجلدية',
        rawPayload: { value: 'specialty:specialty-derma' },
      },
      currentState: first.nextState,
      clinicData: data,
    });
    assert.equal(result.nextState.booking.step, 'service');
    assert.equal(result.nextState.booking.specialtyId, 'specialty-derma');
    assert.equal(result.interaction.options.length, 6);
    assert.deepEqual(
      result.interaction.options.map(({ id }) => id),
      data.services.slice(0, 6).map(({ id }) => `service:${id}`)
    );
    const selectedService = engine.handle({
      message: {
        text: 'جلدية 1',
        rawPayload: { value: 'service:derma-1' },
      },
      currentState: result.nextState,
      clinicData: data,
    });
    assert.equal(selectedService.nextState.booking.serviceId, 'derma-1');
    assert.equal(selectedService.nextState.booking.step, 'city');
  });

  test('uncategorized reply shows only uncategorized services', () => {
    const engine = new ShadenEngine();
    const data = categorizedClinicData({ includeUncategorized: true });
    const first = engine.handle({
      message: { text: 'حجز' }, currentState: idleState(), clinicData: data,
    });
    assert.equal(
      first.interaction.options.at(-1).id,
      'specialty:uncategorized'
    );
    const result = engine.handle({
      message: {
        text: 'خدمات أخرى',
        rawPayload: { value: 'specialty:uncategorized' },
      },
      currentState: first.nextState,
      clinicData: data,
    });
    assert.equal(result.nextState.booking.specialtyId, 'uncategorized');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'service:other-1',
    ]);
  });

  test('invalid specialty and service ids do not change booking selection', () => {
    const engine = new ShadenEngine();
    const data = categorizedClinicData();
    const first = engine.handle({
      message: { text: 'حجز' }, currentState: idleState(), clinicData: data,
    });
    const invalidSpecialty = engine.handle({
      message: { text: 'غير موجود', rawPayload: { value: 'specialty:missing' } },
      currentState: first.nextState,
      clinicData: data,
    });
    assert.equal(invalidSpecialty.nextState.booking.step, 'specialty');
    assert.equal(invalidSpecialty.nextState.booking.specialtyId, null);

    const selectedSpecialty = engine.handle({
      message: { text: 'الجلدية', rawPayload: { value: 'specialty:specialty-derma' } },
      currentState: invalidSpecialty.nextState,
      clinicData: data,
    });
    const invalidService = engine.handle({
      message: { text: 'غير موجود', rawPayload: { value: 'service:laser-1' } },
      currentState: selectedSpecialty.nextState,
      clinicData: data,
    });
    assert.equal(invalidService.nextState.booking.step, 'service');
    assert.equal(invalidService.nextState.booking.serviceId, null);
    assert.equal(invalidService.nextState.booking.specialtyId, 'specialty-derma');
  });

  for (const [replyId, serviceId] of [
    ['service:service-filler', 'service-filler'],
    ['service:service-laser', 'service-laser'],
  ]) {
    test(`maps service list reply and advances the existing booking: ${replyId}`, () => {
      const current = activeBooking('service');
      current.booking.serviceId = null;
      current.booking.city = null;
      const result = new ShadenEngine().handle({
        message: { text: 'عنوان الخدمة', rawPayload: { value: replyId } },
        currentState: current,
        clinicData: clinicData(),
      });
      assert.equal(result.nextState.booking.serviceId, serviceId);
      assert.equal(result.nextState.booking.step, 'city');
      assert.match(result.reply, /اختاري المدينة/u);
      assert.equal(result.interaction.purpose, 'select_city');
    });
  }

  for (const [phrase, serviceId] of [
    ['أبغى حجز فيلر', 'service-filler'],
    ['احجز لي إزالة الشعر بالليزر', 'service-laser'],
  ]) {
    test(`selects an approved mentioned service directly: ${phrase}`, () => {
      const result = new ShadenEngine().handle({ message: { text: phrase }, currentState: idleState(), clinicData: clinicData() });
      assert.equal(result.nextState.booking.serviceId, serviceId);
      assert.equal(result.nextState.booking.step, 'city');
      assert.match(result.reply, /اختاري المدينة/u);
      assert.doesNotMatch(result.reply, /الخدمات المتاحة/u);
      assert.equal(result.interaction.purpose, 'select_city');
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
    assert.equal(result.interaction.purpose, 'select_branch');
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

describe('city interaction scope', () => {
  test('city step sends a deduplicated list from active branches', () => {
    const data = clinicData();
    data.branches.push({
      id: 'branch-riyadh-2',
      name: 'النخيل',
      city: 'الرياض',
    });
    const current = activeBooking('city');
    current.booking.city = null;
    const result = new ShadenEngine().handle({
      message: { text: 'اختيار غير صالح' },
      currentState: current,
      clinicData: data,
    });

    assert.equal(result.nextState.booking.step, 'city');
    assert.equal(result.interaction.mode, 'list');
    assert.equal(result.interaction.purpose, 'select_city');
    assert.equal(result.interaction.displayText, '🏙️ اختاري المدينة:');
    assert.equal(result.interaction.listPrompt, 'عرض المدن');
    assert.equal(result.interaction.options.length, 2);
    assert.deepEqual(
      result.interaction.options.map(({ label }) => label).sort(),
      ['الرياض', 'جدة'].sort()
    );
  });

  test('city list reply saves the city and advances to branch', () => {
    const engine = new ShadenEngine();
    const current = activeBooking('city');
    current.booking.city = null;
    const list = engine.handle({
      message: { text: 'اختيار غير صالح' },
      currentState: current,
      clinicData: clinicData(),
    });
    const option = list.interaction.options.find(({ label }) =>
      label === 'الرياض'
    );
    const selected = engine.handle({
      message: { text: option.label, rawPayload: { value: option.id } },
      currentState: list.nextState,
      clinicData: clinicData(),
    });

    assert.equal(selected.nextState.booking.city, 'الرياض');
    assert.equal(selected.nextState.booking.step, 'branch');
    assert.match(selected.reply, /الفروع المتاحة في الرياض/u);
    assert.equal(selected.interaction.purpose, 'select_branch');
  });

  test('invalid city reply id is rejected without changing booking', () => {
    const current = activeBooking('city');
    current.booking.city = null;
    const result = new ShadenEngine().handle({
      message: { text: 'الرياض', rawPayload: { value: 'city:missing' } },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.city, null);
    assert.equal(result.nextState.booking.step, 'city');
    assert.equal(result.interaction.purpose, 'select_city');
  });

  test('text city selection remains supported', () => {
    const current = activeBooking('city');
    current.booking.city = null;
    const result = new ShadenEngine().handle({
      message: { text: 'جدة' },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.city, 'جدة');
    assert.equal(result.nextState.booking.step, 'branch');
    assert.equal(result.interaction.purpose, 'select_branch');
  });

  test('general branch inquiry remains informational', () => {
    const result = new ShadenEngine().handle({
      message: { text: 'ما هي فروعكم؟' },
      currentState: idleState(),
      clinicData: clinicData(),
    });

    assert.equal(result.interaction, undefined);
    assert.equal(result.nextState.booking, undefined);
  });

  test('more than ten cities keeps the text fallback', () => {
    const data = clinicData();
    data.branches = Array.from({ length: 11 }, (_, index) => ({
      id: `branch-${index + 1}`,
      name: `فرع ${index + 1}`,
      city: `مدينة ${index + 1}`,
    }));
    const current = activeBooking('city');
    current.booking.city = null;
    const result = new ShadenEngine().handle({
      message: { text: 'اختيار غير صالح' },
      currentState: current,
      clinicData: data,
    });

    assert.equal(result.interaction, undefined);
    assert.equal(result.nextState.booking.step, 'city');
    assert.match(result.reply, /اختاري المدينة/u);
  });
});

describe('branch interaction scope', () => {
  test('branch step sends only unique branches from the selected city', () => {
    const data = clinicData();
    data.branches.push({ ...data.branches[0] });
    const result = new ShadenEngine().handle({
      message: { text: 'اختيار غير صالح' },
      currentState: activeBooking('branch'),
      clinicData: data,
    });

    assert.equal(result.interaction.mode, 'list');
    assert.equal(result.interaction.purpose, 'select_branch');
    assert.equal(result.interaction.displayText, '📍 اختاري الفرع:');
    assert.equal(result.interaction.listPrompt, 'عرض الفروع');
    assert.deepEqual(result.interaction.options, [{
      id: 'branch:branch-jeddah',
      label: 'الصالحية',
    }]);
  });

  test('branch list reply saves branchId and advances to date period', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: {
        text: 'الصالحية',
        rawPayload: { value: 'branch:branch-jeddah' },
      },
      currentState: activeBooking('branch'),
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.branchId, 'branch-jeddah');
    assert.equal(result.nextState.booking.step, 'date_period');
    assert.equal(result.interaction.purpose, 'select_date_period');
    assert.equal(result.interaction.displayText, '📅 اختاري الفترة:');
    assert.equal(result.interaction.listPrompt, 'عرض الفترات');
  });

  test('invalid or cross-city branch id is rejected safely', () => {
    const result = new ShadenEngine().handle({
      message: {
        text: 'العليا',
        rawPayload: { value: 'branch:branch-riyadh' },
      },
      currentState: activeBooking('branch'),
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.branchId, null);
    assert.equal(result.nextState.booking.step, 'branch');
    assert.equal(result.interaction.purpose, 'select_branch');
    assert.deepEqual(
      result.interaction.options.map(({ id }) => id),
      ['branch:branch-jeddah']
    );
  });

  test('text branch selection remains supported', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'فرع الصالحية' },
      currentState: activeBooking('branch'),
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.branchId, 'branch-jeddah');
    assert.equal(result.nextState.booking.step, 'date_period');
  });

  test('more than ten branches keeps the text fallback', () => {
    const data = clinicData();
    data.branches = Array.from({ length: 11 }, (_, index) => ({
      id: `jeddah-${index + 1}`,
      name: `فرع ${index + 1}`,
      city: 'جدة',
    }));
    const result = new ShadenEngine().handle({
      message: { text: 'اختيار غير صالح' },
      currentState: activeBooking('branch'),
      clinicData: data,
    });

    assert.equal(result.interaction, undefined);
    assert.equal(result.nextState.booking.step, 'branch');
    assert.match(result.reply, /الفروع المتاحة في جدة/u);
  });
});

describe('date interaction scope', () => {
  test('beginning of month shows only periods containing current-month availability', async () => {
    const current = activeBooking('date_period');
    current.booking.branchId = 'branch-jeddah';
    current.booking.datePeriod = null;
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine([
        '2026-08-02', '2026-08-05', '2026-08-14', '2026-08-25', '2026-09-01',
      ]),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'اختيار غير صالح' },
      currentState: current,
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'date-period:1-10', 'date-period:11-20', 'date-period:21-30',
    ]);
  });

  test('middle and end of month omit periods that have ended', async () => {
    for (const [now, dates, expected] of [[
      '2026-08-15T08:00:00.000Z',
      ['2026-08-16', '2026-08-22'],
      ['date-period:11-20', 'date-period:21-30'],
    ], [
      '2026-08-22T08:00:00.000Z',
      ['2026-08-22', '2026-08-30'],
      ['date-period:21-30'],
    ]]) {
      const current = activeBooking('date_period');
      current.booking.branchId = 'branch-jeddah';
      current.booking.datePeriod = null;
      const result = await new ShadenEngine({
        bookingEngine: availableDatesEngine(dates),
        clock: { now: () => new Date(now) },
      }).handle({
        message: { text: 'اختيار غير صالح' },
        currentState: current,
        clinicData: clinicData(),
      });
      assert.deepEqual(result.interaction.options.map(({ id }) => id), expected);
    }
  });

  for (const [today, lastDate, label] of [
    ['2027-02-21', '2027-02-28', '21–28'],
    ['2028-02-21', '2028-02-29', '21–29'],
    ['2026-04-21', '2026-04-30', '21–30'],
    ['2026-08-21', '2026-08-31', '31'],
  ]) {
    test(`uses the real month end for ${lastDate}`, async () => {
      const current = activeBooking('date_period');
      current.booking.branchId = 'branch-jeddah';
      current.booking.datePeriod = null;
      const result = await new ShadenEngine({
        bookingEngine: availableDatesEngine([lastDate]),
        clock: { now: () => new Date(`${today}T08:00:00.000Z`) },
      }).handle({
        message: { text: 'اختيار غير صالح' },
        currentState: current,
        clinicData: clinicData(),
      });
      assert.equal(result.interaction.options[0].label, label);
    });
  }

  test('valid period stores it and lists only its available dates', async () => {
    const current = activeBooking('date_period');
    current.booking.branchId = 'branch-jeddah';
    current.booking.datePeriod = null;
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(['2026-08-08', '2026-08-12', '2026-08-19']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: '11–20', rawPayload: { value: 'date-period:11-20' } },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.datePeriod, '11-20');
    assert.equal(result.nextState.booking.step, 'date');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'date:2026-08-12', 'date:2026-08-19',
    ]);
  });

  test('today remains selectable when Availability returns a real slot', async () => {
    const current = activeBooking('date_period');
    current.booking.branchId = 'branch-jeddah';
    current.booking.datePeriod = null;
    const engine = new ShadenEngine({
      bookingEngine: availableDatesEngine(['2026-08-05', '2026-08-06']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    });
    const result = await engine.handle({
      message: { text: '1–10', rawPayload: { value: 'date-period:1-10' } },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.interaction.options[0].id, 'date:2026-08-05');
    assert.equal(result.interaction.options[0].label, 'اليوم');
  });

  test('invalid period does not change session', async () => {
    const current = activeBooking('date_period');
    current.booking.branchId = 'branch-jeddah';
    current.booking.datePeriod = null;
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(['2026-08-12']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'فترة', rawPayload: { value: 'date-period:21-30' } },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.datePeriod, null);
    assert.equal(result.nextState.booking.step, 'date_period');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'date-period:11-20',
    ]);
  });

  test('no remaining current-month dates stays at date period without a list', async () => {
    const current = activeBooking('date_period');
    current.booking.branchId = 'branch-jeddah';
    current.booking.datePeriod = null;
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(['2026-09-01']),
      clock: { now: () => new Date('2026-08-31T08:00:00.000Z') },
    }).handle({
      message: { text: 'اختيار غير صالح' },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.step, 'date_period');
    assert.equal(result.interaction, undefined);
    assert.match(result.reply, /الشهر الحالي/u);
  });

  test('every current-month date remains reachable and no date list exceeds ten rows', async () => {
    const dates = Array.from({ length: 31 }, (_, index) =>
      `2026-08-${String(index + 1).padStart(2, '0')}`
    );
    const engine = new ShadenEngine({
      bookingEngine: availableDatesEngine(dates),
      clock: { now: () => new Date('2026-08-01T08:00:00.000Z') },
    });
    const collected = [];
    for (const period of ['1-10', '11-20', '21-30', '31-31']) {
      const current = activeBooking('date_period');
      current.booking.branchId = 'branch-jeddah';
      current.booking.datePeriod = null;
      const result = await engine.handle({
        message: { text: period, rawPayload: { value: `date-period:${period}` } },
        currentState: current,
        clinicData: clinicData(),
      });
      assert.ok(result.interaction.options.length <= 10);
      collected.push(...result.interaction.options.map(({ id }) => id));
    }

    assert.deepEqual(
      collected,
      dates.map((date) => `date:${date}`)
    );
  });

  test('31-31 appears only when day 31 is available and remains on day 31', async () => {
    for (const [dates, expected] of [
      [['2026-08-30'], ['date-period:21-30']],
      [['2026-08-31'], ['date-period:31-31']],
    ]) {
      const current = activeBooking('date_period');
      current.booking.branchId = 'branch-jeddah';
      current.booking.datePeriod = null;
      const result = await new ShadenEngine({
        bookingEngine: availableDatesEngine(dates),
        clock: { now: () => new Date('2026-08-31T08:00:00.000Z') },
      }).handle({
        message: { text: 'اختيار غير صالح' },
        currentState: current,
        clinicData: clinicData(),
      });
      if (dates[0].endsWith('-30')) {
        assert.equal(result.interaction, undefined);
      } else {
        assert.deepEqual(result.interaction.options.map(({ id }) => id), expected);
      }
    }
  });

  test('valid date reply saves booking.date and advances to time', async () => {
    const current = activeBooking('date');
    current.booking.branchId = 'branch-jeddah';
    current.booking.date = null;
    current.booking.datePeriod = '1-10';
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: {
        text: 'الخميس',
        rawPayload: { value: 'date:2026-08-06' },
      },
      currentState: current,
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.date, '2026-08-06');
    assert.equal(result.nextState.booking.datePeriod, null);
    assert.equal(result.nextState.booking.step, 'time_period');
    assert.equal(result.nextState.booking.preferredStart, null);
    assert.equal(result.interaction.purpose, 'select_time_period');
  });

  test('invalid date reply does not change session', async () => {
    const current = activeBooking('date');
    current.booking.branchId = 'branch-jeddah';
    current.booking.date = null;
    current.booking.datePeriod = '1-10';
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: {
        text: 'الخميس',
        rawPayload: { value: 'date:2026-09-01' },
      },
      currentState: current,
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.date, null);
    assert.equal(result.nextState.booking.step, 'date');
    assert.equal(result.interaction.purpose, 'select_date');
  });

  test('next-month text date is rejected without changing session', async () => {
    const current = activeBooking('date');
    current.booking.branchId = 'branch-jeddah';
    current.booking.date = null;
    current.booking.datePeriod = '1-10';
    current.booking.datePeriod = '21-30';
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(['2026-08-25', '2026-09-01']),
      clock: { now: () => new Date('2026-08-22T08:00:00.000Z') },
    }).handle({
      message: { text: '2026-09-01' },
      currentState: current,
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.date, null);
    assert.equal(result.nextState.booking.datePeriod, '21-30');
    assert.equal(result.nextState.booking.step, 'date');
  });

  test('text date selection remains supported', async () => {
    const current = activeBooking('date');
    current.booking.branchId = 'branch-jeddah';
    current.booking.date = null;
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: '2026-08-07' },
      currentState: current,
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.date, '2026-08-07');
    assert.equal(result.nextState.booking.step, 'time_period');
  });

  test('no available dates returns a safe text response and stays at date', async () => {
    const current = activeBooking('date');
    current.booking.branchId = 'branch-jeddah';
    current.booking.date = null;
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine([]),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'اختيار غير صالح' },
      currentState: current,
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.step, 'date');
    assert.equal(result.nextState.booking.date, null);
    assert.equal(result.interaction, undefined);
    assert.match(result.reply, /لا توجد مواعيد متاحة/u);
  });
});

describe('time interaction scope', () => {
  function timeState(step = 'time_period', period = null) {
    const current = activeBooking(step);
    current.booking.branchId = 'branch-jeddah';
    current.booking.date = '2026-08-06';
    current.booking.datePeriod = null;
    current.booking.timePeriod = period;
    return current;
  }

  test('time period list hides empty periods', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, ['09:00', '10:00', '16:30']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'اختيار غير صالح' },
      currentState: timeState(),
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.interaction.displayText, '🕘 اختاري الفترة الزمنية:');
    assert.equal(result.interaction.listPrompt, 'عرض الفترات');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'time-period:morning', 'time-period:afternoon',
    ]);
  });

  test('an eleven-plus-slot base period splits without hiding slots', async () => {
    const morning = Array.from({ length: 12 }, (_, index) => {
      const minutes = 8 * 60 + index * 15;
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    });
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, [...morning, '16:00']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'صباح مبكر', rawPayload: { value: 'time-period:morning-1' } },
      currentState: timeState(),
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.timePeriod, 'morning-1');
    assert.equal(result.nextState.booking.step, 'time');
    assert.equal(result.interaction.displayText, '🕒 اختاري الوقت:');
    assert.equal(result.interaction.listPrompt, 'عرض المواعيد');
    assert.equal(result.interaction.options.length, 10);
    assert.ok(result.interaction.options.every(({ id }) => id < 'time:12:00'));
  });

  for (const count of [5, 10]) {
    test(`${count} contiguous slots remain in one period`, async () => {
      const times = Array.from({ length: count }, (_, index) => {
        const minute = 8 * 60 + index * 15;
        return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      });
      const result = await new ShadenEngine({
        bookingEngine: availableDatesEngine(undefined, times),
        clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
      }).handle({
        message: { text: 'اختيار غير صالح' },
        currentState: timeState(),
        clinicData: clinicData(),
      });
      assert.deepEqual(result.interaction.options.map(({ id }) => id), [
        'time-period:morning',
      ]);
    });
  }

  test('all twenty-eight slots appear once across ordered dynamic periods', async () => {
    const times = [
      ...Array.from({ length: 11 }, (_, index) => `${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`),
      ...Array.from({ length: 11 }, (_, index) => `${String(12 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`),
      ...['16:00', '16:30', '17:00', '17:30', '19:00', '19:30'],
    ];
    const engine = new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, times),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    });
    const periods = await engine.handle({
      message: { text: 'اختيار غير صالح' },
      currentState: timeState(),
      clinicData: clinicData(),
    });
    const collected = [];
    for (const option of periods.interaction.options) {
      const current = timeState();
      const list = await engine.handle({
        message: { text: option.label, rawPayload: { value: option.id } },
        currentState: current,
        clinicData: clinicData(),
      });
      assert.ok(list.interaction.options.length <= 10);
      collected.push(...list.interaction.options.map(({ id }) => id.slice(5)));
    }
    assert.deepEqual(collected, times);
    assert.equal(new Set(collected).size, 28);
  });

  test('invalid time period does not change session', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, ['09:00']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: 'مساء', rawPayload: { value: 'time-period:evening' } },
      currentState: timeState(),
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.timePeriod, null);
    assert.equal(result.nextState.booking.step, 'time_period');
  });

  test('valid time creates preferredStart and advances to payment method', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, ['09:00']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: '09:00 ص', rawPayload: { value: 'time:09:00' } },
      currentState: timeState('time', 'morning'),
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.preferredStart, '2026-08-06T06:00:00.000Z');
    assert.equal(result.nextState.booking.timePeriod, null);
    assert.equal(result.nextState.booking.step, 'payment_method');
    assert.equal(result.interaction.purpose, 'select_payment_method');
  });

  test('invalid time does not change the booking selection', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, ['09:00']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: '10:00', rawPayload: { value: 'time:10:00' } },
      currentState: timeState('time', 'morning'),
      clinicData: clinicData(),
    });

    assert.equal(result.nextState.booking.preferredStart, null);
    assert.equal(result.nextState.booking.timePeriod, 'morning');
    assert.equal(result.nextState.booking.step, 'time');
  });

  test('text time remains supported', async () => {
    const result = await new ShadenEngine({
      bookingEngine: availableDatesEngine(undefined, ['16:00']),
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: '4 مساءً' },
      currentState: timeState('time', 'afternoon'),
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.preferredStart, '2026-08-06T13:00:00.000Z');
    assert.equal(result.nextState.booking.step, 'payment_method');
  });

  test('a slot rejected at final validation reloads the same period safely', async () => {
    let timeReads = 0;
    const engine = {
      async getAvailableTimes() {
        timeReads += 1;
        return { success: true, times: timeReads === 1 ? ['09:00'] : ['09:30'] };
      },
      async checkAvailability() {
        return { status: 'unavailable', reason: 'doctor_conflict', metadata: { reasonCode: 'doctor_conflict' } };
      },
    };
    const result = await new ShadenEngine({
      bookingEngine: engine,
      clock: { now: () => new Date('2026-08-05T08:00:00.000Z') },
    }).handle({
      message: { text: '09:00 ص', rawPayload: { value: 'time:09:00' } },
      currentState: timeState('time', 'morning'),
      clinicData: clinicData(),
      bookingContext: { clinicId: 'clinic-1' },
    });

    assert.equal(result.nextState.booking.preferredStart, null);
    assert.equal(result.nextState.booking.timePeriod, 'morning');
    assert.equal(result.nextState.booking.step, 'time');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), ['time:09:30']);
    assert.match(result.reply, /لم يعد متاح/u);
  });
});

describe('service interaction scope', () => {
  test('general service inquiry remains informational and does not start booking', () => {
    const result = new ShadenEngine().handle({
      message: { text: 'ما الخدمات' },
      currentState: idleState(),
      clinicData: clinicData(),
    });
    assert.match(result.reply, /الخدمات المتاحة/u);
    assert.equal(result.interaction, undefined);
    assert.equal(result.nextState.booking, undefined);
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
