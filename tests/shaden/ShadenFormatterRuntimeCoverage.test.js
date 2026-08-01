'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const formatter = require('../../src/services/shaden/ShadenMessageFormatter');

const { RLM, LRI, PDI } = formatter.controls;
const r = (value) => `${RLM}${value}`;
const i = (value) => `${LRI}${value}${PDI}`;

function data() {
  return {
    clinic: { id: 'clinic-1', name: 'عيادات أوريان' },
    branches: [{ id: 'branch-1', name: 'الصالحية', city: 'جدة', timezone: 'Asia/Riyadh' }],
    services: [{ id: 'service-1', name: 'ليزر' }],
    specialties: [],
    paymentMethods: [{ id: 'insurance-1', name: 'تأمين', code: 'insurance' }],
    insuranceCompanies: [{ id: 'company-1', name: 'بوبا' }, { id: 'company-2', name: 'التعاونية' }],
    insuranceClasses: [
      { id: 'class-a', name: 'A', insuranceCompanyId: 'company-1', isAccepted: true },
      { id: 'class-vip', name: 'VIP', insuranceCompanyId: 'company-1', isAccepted: true },
      { id: 'class-c', name: 'C', insuranceCompanyId: 'company-1', isAccepted: false },
    ],
    workingHours: [],
  };
}

function state(booking = null) {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'منة' },
    context: null,
    options: [],
    ...(booking ? { booking } : {}),
  };
}

describe('Shaden runtime formatter coverage', () => {
  test('general insurance classes and fallback pass through the central formatter', () => {
    const engine = new ShadenEngine();
    const classes = engine.handle({ message: { text: 'ما الفئات المعتمدة' }, currentState: state(), clinicData: data() });
    assert.equal(classes.reply, formatter.formatInsuranceClasses({ items: data().insuranceClasses.filter((item) => item.isAccepted) }));
    assert.match(classes.reply, new RegExp(`${LRI}A${PDI}`));
    assert.match(classes.reply, new RegExp(`${LRI}VIP${PDI}`));

    const fallback = engine.handle({ message: { text: 'طلب غير مفهوم من فضلك' }, currentState: state(), clinicData: data() });
    assert.equal(fallback.reply, formatter.formatUnknown());
  });

  test('booking insurance company and class selection use formatter endings only', () => {
    const engine = new ShadenEngine();
    const companyBooking = {
      step: 'insurance_company', serviceId: 'service-1', city: 'جدة', branchId: 'branch-1',
      doctorId: null, preferredStart: '2026-08-02T08:00:00.000Z', paymentMethodId: 'insurance-1',
      insuranceCompanyId: null, insuranceClassId: null,
    };
    const company = engine.handle({ message: { text: 'غير موجودة' }, currentState: state(companyBooking), clinicData: data() });
    assert.equal(company.reply, formatter.formatInsuranceCompanies({ items: data().insuranceCompanies, selection: true }));
    assert.equal(company.nextState.booking.step, 'insurance_company');

    const selected = engine.handle({ message: { text: 'بوبا' }, currentState: state(companyBooking), clinicData: data() });
    assert.equal(selected.reply, formatter.formatInsuranceClasses({ items: data().insuranceClasses.filter((item) => item.insuranceCompanyId === 'company-1' && item.isAccepted), selection: true }));
    assert.equal(selected.nextState.booking.step, 'insurance_class');
  });

  test('ambiguous booking time uses contextual clarification and preserves booking state', () => {
    const booking = {
      step: 'availability', serviceId: 'service-1', city: 'جدة', branchId: 'branch-1',
      doctorId: null, preferredStart: null, paymentMethodId: null,
      insuranceCompanyId: null, insuranceClassId: null,
    };
    const engine = new ShadenEngine({ clock: { now: () => new Date('2026-07-31T09:00:00.000Z') } });
    const result = engine.handle({ message: { text: 'اليوم الساعة 6' }, currentState: state(booking), clinicData: data() });
    assert.equal(result.reply, [
      r('🌸 *لم أتمكن من تحديد الوقت*'), '',
      r('اكتبي الوقت مع توضيح صباحًا أو مساءً، مثل:'),
      `\`${i('11')} ص\` أو \`${i('6')} م\``,
    ].join('\n'));
    assert.equal(result.nextState.booking.step, 'availability');
    assert.equal(result.nextState.booking.serviceId, 'service-1');
    assert.equal(result.nextState.booking.branchId, 'branch-1');
    assert.doesNotMatch(result.reply, /الخدمات|الفروع|طرق الدفع/u);
  });
});

