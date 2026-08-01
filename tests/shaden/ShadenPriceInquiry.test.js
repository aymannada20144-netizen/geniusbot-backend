'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const IDS = Object.freeze({
  clinic: '00000000-0000-0000-0000-000000000001',
  filler: '00000000-0000-0000-0000-000000000002',
  botox: '00000000-0000-0000-0000-000000000003',
  cash: '00000000-0000-0000-0000-000000000004',
  insurance: '00000000-0000-0000-0000-000000000005',
  company: '00000000-0000-0000-0000-000000000006',
  accepted: '00000000-0000-0000-0000-000000000007',
  rejected: '00000000-0000-0000-0000-000000000008',
  tawuniya: '00000000-0000-0000-0000-000000000009',
  tawuniyaClass: '00000000-0000-0000-0000-000000000010',
  unpricedClass: '00000000-0000-0000-0000-000000000011',
  unpricedCompany: '00000000-0000-0000-0000-000000000012',
  bupaA: '00000000-0000-0000-0000-000000000013',
  patient: '00000000-0000-0000-0000-000000000014',
});

describe('Shaden persisted price inquiry flow', () => {
  test('lists services then accepts a short service reply', async () => {
    const session = harness();
    let result = await session.send('ما أسعار الخدمات');
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_service');
    result = await session.send('فيلر', result.nextState);
    assert.match(result.reply, /500/);
  });

  test('resolves a direct service price question', async () => {
    const result = await harness().send('كم سعر الفيلر؟');
    assert.match(result.reply, /سعر فيلر كاش 500 ريال/);
  });

  test('returns the cash price first', async () => {
    const session = harness();
    const result = await session.send('سعر البوتوكس');
    assert.equal(session.calls[0].paymentMethodId, IDS.cash);
    assert.equal(result.nextState.priceInquiry.resolved_cash_price, '500.00');
  });

  test('does not list insurance prices before insurance details', async () => {
    const result = await harness().send('سعر الفيلر');
    assert.doesNotMatch(result.reply, /VIP|210|بوبا/);
  });

  test('cash selection preserves service and advances to booking confirmation', async () => {
    const session = harness();
    let result = await session.send('سعر الفيلر');
    result = await session.send('كاش', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.filler);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_booking_confirmation');
  });

  test('insurance selection asks for company', async () => {
    const session = harness();
    let result = await session.send('سعر الفيلر');
    result = await session.send('تأمين', result.nextState);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_insurance_company');
    assert.match(result.reply, /شركة التأمين/);
    assert.match(result.reply, /🛡️/);
    assert.match(result.reply, /────────────/);
  });

  test('company selection asks only for its classes', async () => {
    const session = harness();
    let result = await toInsuranceCompany(session);
    result = await session.send('بوبا', result.nextState);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_insurance_class');
    assert.equal(result.nextState.priceInquiry.selected_insurance_company_id, IDS.company);
  });

  test('accepted class selection is persisted', async () => {
    const session = harness();
    let result = await toInsuranceClass(session);
    result = await session.send('VIP', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, IDS.accepted);
  });

  test('resolves exactly scoped insurance price', async () => {
    const session = harness();
    let result = await toInsuranceClass(session);
    result = await session.send('VIP', result.nextState);
    assert.deepEqual(session.calls[1], {
      clinicId: IDS.clinic, serviceId: IDS.filler,
      paymentMethodId: IDS.insurance,
      insuranceCompanyId: IDS.company,
      insuranceClassId: IDS.accepted,
      bookingDate: new Date('2026-08-01T09:00:00.000Z'),
    });
    assert.match(result.reply, /210 ريال/);
  });

  test('rejected class offers conversion and agreement uses cached cash price', async () => {
    const session = harness();
    let result = await toInsuranceClass(session);
    result = await session.send('C', result.nextState);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_cash_confirmation');
    assert.match(result.reply, /500/);
    result = await session.send('نعم', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_payment_method, 'cash');
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_booking_confirmation');
    assert.equal(result.nextState.priceInquiry.selected_insurance_company_id, null);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, null);
    assert.equal(session.calls.length, 1);
    result = await session.send('نعم', result.nextState);
    assert.equal(result.nextState.priceInquiry, undefined);
    assert.equal(result.nextState.booking.serviceId, IDS.filler);
    assert.equal(result.nextState.booking.paymentMethodCode, 'cash');
    assert.equal(result.nextState.booking.insuranceCompanyId, null);
    assert.equal(result.nextState.booking.insuranceClassId, null);
    assert.equal(result.nextState.booking.quotedPrice, '500.00');
    assert.equal(result.nextState.booking.currency, 'SAR');
    assert.doesNotMatch(result.reply, /يمكنكِ اختيار كاش/);
  });

  test('handles a missing cash price without invention', async () => {
    const result = await harness({ failCash: true }).send('سعر الفيلر');
    assert.match(result.reply, /غير متاح حاليًا/);
    assert.doesNotMatch(result.reply, /500|210/);
  });

  test('handles a missing exact insurance price without alternatives', async () => {
    const session = harness({ failInsurance: true });
    let result = await toInsuranceClass(session);
    result = await session.send('VIP', result.nextState);
    assert.match(result.reply, /لا يوجد سعر تأمين مسجل/);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, IDS.accepted);
  });

  test('ambiguous service shows only matching options', async () => {
    const result = await harness({
      services: [service(IDS.filler, 'فيلر الشفاه'), service(IDS.botox, 'فيلر الخدود')],
    }).send('سعر الفيلر');
    assert.match(result.reply, /فيلر الشفاه/);
    assert.match(result.reply, /فيلر الخدود/);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_service');
  });

  test('unknown service remains awaiting selection', async () => {
    const result = await harness().send('سعر المساج');
    assert.match(result.reply, /لم أتعرف على الخدمة/);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_service');
  });

  test('price state survives serialization between messages', async () => {
    const first = await harness().send('ما أسعار الخدمات');
    const persisted = JSON.parse(JSON.stringify(first.nextState));
    const second = await harness().send('فيلر', persisted);
    assert.match(second.reply, /500/);
    assert.equal(second.nextState.priceInquiry.selected_service_name, 'فيلر');
  });

  test('valid short replies never use the generic fallback', async () => {
    const session = harness();
    let result = await session.send('سعر الفيلر');
    result = await session.send('تأمين', result.nextState);
    assert.doesNotMatch(result.reply, /لم أفهم طلبك/);
    result = await session.send('بوبا', result.nextState);
    assert.doesNotMatch(result.reply, /لم أفهم طلبك/);
    result = await session.send('VIP', result.nextState);
    assert.doesNotMatch(result.reply, /لم أفهم طلبك/);
  });

  test('company options include only companies backed by a current price', async () => {
    const session = harness();
    const result = await toInsuranceCompany(session);
    assert.match(result.reply, /بوبا/);
    assert.doesNotMatch(result.reply, /التعاونية/);
  });

  test('an active company without a service price is excluded', async () => {
    const session = harness();
    let result = await toInsuranceCompany(session);
    result = await session.send('ميدغلف', result.nextState);
    assert.match(result.reply, /لا يوجد سعر مسجل/);
    assert.match(result.reply, /بوبا/);
  });

  test('class options include only classes backed by the selected company price', async () => {
    const session = harness({ pricedClassIds: [IDS.accepted] });
    const result = await toInsuranceClass(session);
    assert.match(result.reply, /VIP/);
    assert.doesNotMatch(result.reply, /▪️ B/);
  });

  test('an accepted but unpriced class is excluded', async () => {
    const session = harness({ pricedClassIds: [IDS.accepted] });
    let result = await toInsuranceClass(session);
    result = await session.send('B', result.nextState);
    assert.match(result.reply, /لا يوجد سعر مسجل/);
    assert.match(result.reply, /VIP/);
  });

  test('VIP follow-up after quoting Bupa A changes only the class', async () => {
    const session = harness({
      pricedClassIds: [IDS.accepted, IDS.unpricedClass],
    });
    let result = await quotedInsurance(session, 'B');
    result = await session.send('ما سعر VIP', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.filler);
    assert.equal(result.nextState.priceInquiry.selected_insurance_company_id, IDS.company);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, IDS.accepted);
    assert.match(result.reply, /210 ريال/);
  });

  test('changing company preserves service and clears the old class', async () => {
    const session = harness({
      pricedCompanyIds: [IDS.company, IDS.tawuniya],
      pricedClassIds: [IDS.accepted, IDS.tawuniyaClass],
    });
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('طب التعاونية', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.filler);
    assert.equal(result.nextState.priceInquiry.selected_insurance_company_id, IDS.tawuniya);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, null);
    assert.match(result.reply, /A/);
  });

  test('cash follow-up returns the cached cash price without restarting', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ولو كاش', result.nextState);
    assert.match(result.reply, /500/);
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.filler);
    assert.equal(session.calls.filter((call) => call.paymentMethodId === IDS.cash).length, 1);
  });

  test('post-quote context remains ready for another price question', async () => {
    const result = await quotedInsurance(harness(), 'VIP');
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_booking_confirmation');
    assert.equal(result.nextState.priceInquiry.resolved_insurance_price, '210.00');
  });

  test('contextual price follow-ups do not reach generic fallback', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ولو كاش', result.nextState);
    assert.doesNotMatch(result.reply, /لم أفهم طلبك/);
  });

  test('starting booking carries the final price selections', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('حجز', result.nextState);
    assert.equal(result.nextState.booking.serviceId, IDS.filler);
    assert.equal(result.nextState.booking.paymentMethodId, IDS.insurance);
    assert.equal(result.nextState.booking.insuranceCompanyId, IDS.company);
    assert.equal(result.nextState.booking.insuranceClassId, IDS.accepted);
  });

  test('a new general price inquiry overrides ready context', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ما أسعار الخدمات', result.nextState);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_service');
    assert.equal(result.nextState.priceInquiry.selected_service_id, null);
  });

  test('a restarted price inquiry never returns the closing reply', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('أسعاركم', result.nextState);
    assert.doesNotMatch(result.reply, /أنا معك إذا احتجتِ/);
    assert.match(result.reply, /اختاري خدمة واحدة/);
  });

  test('a direct new-service question replaces filler with Botox', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ما سعر البوتوكس', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.botox);
    assert.equal(result.nextState.priceInquiry.selected_service_name, 'بوتوكس');
  });

  test('new service clears old company, class, and insurance price', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ما سعر البوتكس', result.nextState);
    const flow = result.nextState.priceInquiry;
    assert.equal(flow.selected_insurance_company_id, null);
    assert.equal(flow.selected_insurance_class_id, null);
    assert.equal(flow.resolved_insurance_price, null);
    assert.equal(flow.state, 'awaiting_price_payment_method');
  });

  test('minor Botox spelling variants resolve deterministically', async () => {
    for (const message of ['سعر بوتكس', 'سعر البوتكس', 'سعر البوتوكس']) {
      const result = await harness().send(message);
      assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.botox);
    }
  });

  test('compound insurance company and class resolve in one turn', async () => {
    const session = harness({
      pricedClassIds: [IDS.accepted, IDS.bupaA],
    });
    let result = await session.send('سعر الفيلر');
    result = await session.send('تأمين بوبا A', result.nextState);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_booking_confirmation');
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, IDS.bupaA);
    assert.match(result.reply, /210 ريال/);
  });

  test('company and class compound completes missing insurance scope', async () => {
    const session = harness();
    let result = await session.send('سعر الفيلر');
    result = await session.send('بوبا VIP', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_payment_method, 'insurance');
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, IDS.accepted);
  });

  test('compound input requests only a genuinely missing class', async () => {
    const session = harness();
    let result = await session.send('سعر الفيلر');
    result = await session.send('تأمين بوبا', result.nextState);
    assert.match(result.reply, /ما فئة التأمين/);
    assert.doesNotMatch(result.reply, /ما شركة التأمين/);
  });

  test('explicit new service outranks short class handling', async () => {
    const session = harness();
    let result = await toInsuranceClass(session);
    result = await session.send('ما سعر البوتكس', result.nextState);
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.botox);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, null);
  });

  test('clear wrong-keyboard price question resolves safely', async () => {
    const result = await harness().send('lh suv hgf,j;s');
    assert.equal(result.nextState.priceInquiry.selected_service_id, IDS.botox);
    assert.match(result.reply, /500/);
  });

  test('unclear Latin input keeps the safe generic fallback', async () => {
    const result = await harness().send('hello xyz');
    assert.match(result.reply, /لم أفهم طلبك/);
    assert.equal(result.nextState.priceInquiry, undefined);
  });

  test('booking handoff uses newly selected service and compound scope', async () => {
    const session = harness({ pricedClassIds: [IDS.accepted, IDS.bupaA] });
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ما سعر البوتكس', result.nextState);
    result = await session.send('تأمين بوبا A', result.nextState);
    result = await session.send('حجز', result.nextState);
    assert.equal(result.nextState.booking.serviceId, IDS.botox);
    assert.equal(result.nextState.booking.paymentMethodId, IDS.insurance);
    assert.equal(result.nextState.booking.insuranceCompanyId, IDS.company);
    assert.equal(result.nextState.booking.insuranceClassId, IDS.bupaA);
  });

  for (const message of [
    'ما أسعار خدماتكم',
    'ما اسعار الخدمات',
    'أسعاركم',
  ]) {
    test(`explicit general price inquiry overrides ready context: ${message}`, async () => {
      const session = harness();
      let result = await quotedInsurance(session, 'VIP');
      result = await session.send(message, result.nextState);
      const flow = result.nextState.priceInquiry;
      assert.equal(flow.state, 'awaiting_price_service');
      assert.equal(flow.selected_service_id, null);
      assert.equal(flow.selected_payment_method, null);
      assert.equal(flow.selected_insurance_company_id, null);
      assert.equal(flow.selected_insurance_class_id, null);
      assert.equal(flow.resolved_cash_price, null);
      assert.equal(flow.resolved_insurance_price, null);
      assert.match(result.reply, /فيلر/);
      assert.match(result.reply, /بوتوكس/);
      assert.match(result.reply, /اختاري خدمة واحدة لمعرفة سعرها/);
      assert.doesNotMatch(result.reply, /يمكنكِ اختيار كاش/);
    });
  }

  test('general services inquiry remains outside the price flow', async () => {
    const result = await harness().send('ما هي الخدمات');
    assert.equal(result.nextState.priceInquiry, undefined);
    assert.match(result.reply, /فيلر/);
    assert.doesNotMatch(result.reply, /اختاري خدمة واحدة لمعرفة سعرها/);
  });

  test('missing service short-circuits compound insurance input safely', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('ما أسعار خدماتكم', result.nextState);
    const lookupsBefore = session.optionCalls.length;

    result = await session.send('تأمين بوبا VIP', result.nextState);

    assert.equal(session.optionCalls.length, lookupsBefore);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_service');
    assert.equal(result.nextState.priceInquiry.selected_service_id, null);
    assert.equal(result.nextState.priceInquiry.selected_payment_method, null);
    assert.equal(result.nextState.priceInquiry.selected_insurance_company_id, null);
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, null);
    assert.match(result.reply, /فيلر/);
    assert.match(result.reply, /اختاري خدمة واحدة لمعرفة سعرها/);
  });

  test('compound insurance input still resolves after service selection', async () => {
    const session = harness({ pricedClassIds: [IDS.accepted, IDS.bupaA] });
    let result = await session.send('ما أسعار خدماتكم');
    result = await session.send('فيلر', result.nextState);
    result = await session.send('تأمين بوبا A', result.nextState);
    assert.equal(result.nextState.priceInquiry.state, 'awaiting_price_booking_confirmation');
    assert.equal(result.nextState.priceInquiry.selected_insurance_class_id, IDS.bupaA);
  });

  test('direct cash quote confirmation starts booking immediately', async () => {
    const session = harness();
    let result = await session.send('سعر الفيلر');
    result = await session.send('كاش', result.nextState);
    result = await session.send('أيوه', result.nextState);
    assert.equal(result.nextState.priceInquiry, undefined);
    assert.equal(result.nextState.booking.serviceId, IDS.filler);
    assert.equal(result.nextState.booking.paymentMethodId, IDS.cash);
    assert.equal(result.nextState.booking.quotedPrice, '500.00');
    assert.equal(result.nextState.booking.currency, 'SAR');
    assert.equal(result.nextState.booking.clinicId, IDS.clinic);
    assert.equal(result.nextState.booking.patientId, IDS.patient);
  });

  test('valid insurance quote confirmation preserves exact scope', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('نعم', result.nextState);
    assert.equal(result.nextState.booking.serviceId, IDS.filler);
    assert.equal(result.nextState.booking.paymentMethodId, IDS.insurance);
    assert.equal(result.nextState.booking.paymentMethodCode, 'insurance');
    assert.equal(result.nextState.booking.insuranceCompanyId, IDS.company);
    assert.equal(result.nextState.booking.insuranceClassId, IDS.accepted);
    assert.equal(result.nextState.booking.quotedPrice, '210.00');
    assert.equal(result.nextState.booking.currency, 'SAR');
  });

  test('negative booking reply does not create a booking draft', async () => {
    const session = harness();
    let result = await quotedInsurance(session, 'VIP');
    result = await session.send('لا شكرًا', result.nextState);
    assert.equal(result.nextState.booking, undefined);
    assert.equal(result.nextState.priceInquiry, undefined);
    assert.match(result.reply, /أنا معك/);
  });
});

function harness({
  failCash = false,
  failInsurance = false,
  services,
  pricedCompanyIds = [IDS.company],
  pricedClassIds = [IDS.accepted],
} = {}) {
  const calls = [];
  const optionCalls = [];
  const engine = new ShadenEngine({
    clock: { now: () => new Date('2026-08-01T09:00:00.000Z') },
    priceService: {
      async resolvePrice(input) {
        calls.push(input);
        if ((input.paymentMethodId === IDS.cash && failCash) ||
            (input.paymentMethodId === IDS.insurance && failInsurance)) {
          throw new Error('No active price');
        }
        return input.paymentMethodId === IDS.cash
          ? { price: '500.00', currency: 'SAR' }
          : { price: '210.00', currency: 'SAR' };
      },
      async listApplicableInsuranceOptions(input) {
        optionCalls.push(input);
        const source = data(services);
        const companies = source.insuranceCompanies.filter((item) =>
          pricedCompanyIds.includes(item.id)
        );
        const allClasses = source.insuranceClasses.filter((item) =>
          pricedClassIds.includes(item.id) &&
          pricedCompanyIds.includes(item.insuranceCompanyId) &&
          (!input.insuranceCompanyId ||
            item.insuranceCompanyId === input.insuranceCompanyId)
        );
        return {
          companies,
          classes: allClasses,
        };
      },
    },
  });
  return {
    calls,
    optionCalls,
    send(text, currentState = null) {
      return engine.handle({
        message: { text }, currentState,
        clinicData: data(services),
        bookingContext: {
          clinicId: IDS.clinic,
          patientId: IDS.patient,
        },
      });
    },
  };
}

async function toInsuranceCompany(session) {
  let result = await session.send('سعر الفيلر');
  return session.send('تأمين', result.nextState);
}

async function toInsuranceClass(session) {
  let result = await toInsuranceCompany(session);
  return session.send('بوبا', result.nextState);
}

async function quotedInsurance(session, className) {
  let result = await toInsuranceClass(session);
  return session.send(className, result.nextState);
}

function data(services) {
  return {
    clinic: { id: IDS.clinic, name: 'العيادة' },
    services: services || [service(IDS.filler, 'فيلر'), service(IDS.botox, 'بوتوكس')],
    paymentMethods: [
      { id: IDS.cash, name: 'كاش', code: 'cash' },
      { id: IDS.insurance, name: 'تأمين', code: 'insurance' },
    ],
    insuranceCompanies: [
      { id: IDS.company, name: 'بوبا' },
      { id: IDS.tawuniya, name: 'التعاونية' },
      { id: IDS.unpricedCompany, name: 'ميدغلف' },
    ],
    insuranceClasses: [
      { id: IDS.accepted, insuranceCompanyId: IDS.company, name: 'VIP', isAccepted: true },
      { id: IDS.rejected, insuranceCompanyId: IDS.company, name: 'C', isAccepted: false },
      { id: IDS.unpricedClass, insuranceCompanyId: IDS.company, name: 'B', isAccepted: true },
      { id: IDS.tawuniyaClass, insuranceCompanyId: IDS.tawuniya, name: 'A', isAccepted: true },
      { id: IDS.bupaA, insuranceCompanyId: IDS.company, name: 'A', isAccepted: true },
    ],
  };
}

function service(id, name) {
  return { id, name, requiresDoctor: false, requiresRoom: false };
}
