'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Machine = require('../../src/services/shaden/PriceStateMachine');
const Executor = require('../../src/services/shaden/PriceDecisionExecutor');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const Policy = require('../../src/services/shaden/ShadenPolicy');
const { catalogFixture } = require('./priceFixture');

function session() {
  const fixture = catalogFixture();
  const policy = new Policy();
  const machine = new Machine({ policy });
  const executor = new Executor({ policy, priceService: fixture.priceService });
  return { ...fixture, machine, async turn(message, state = null, currentSlots = {}) {
    const decision = await machine.prepare({ message, persistedPriceState: state, currentSlots, catalog: fixture.catalog }, fixture.priceService);
    for (const key of ['kind', 'owner', 'action', 'currentSlots', 'persistedSlots', 'resolvedSlots', 'missingSlots', 'invalidatedSlots', 'provenance', 'evidence', 'nextPriceState']) assert.ok(key in decision, key);
    assert.ok(decision.action);
    return machine.complete(decision, await executor.execute(decision));
  } };
}

test('contextual replacement resolver emits only one non-current catalog entity', () => {
  const resolve = Machine.resolveContextualReplacement;
  assert.equal(resolve(['K1', 'K2'], 'K1'), 'K2');
  assert.equal(resolve(['K1'], 'K1'), null);
  assert.equal(resolve(['K1', 'K2', 'K3'], 'K1'), null);
  assert.equal(resolve(['K2'], null), 'K2');
  assert.equal(resolve(['K1', 'K2'], null), null);
  assert.equal(resolve(['C1', 'C2'], 'C1'), 'C2');
  assert.equal(resolve(['C1'], 'C1'), null);
  assert.equal(resolve(['C1', 'C2', 'C3'], 'C1'), null);
  assert.equal(resolve(['C2'], null), 'C2');
  assert.equal(resolve(['C1', 'C2'], null), null);
});

test('quoted contextual text replacements reach the reducer as canonical slot deltas', async () => {
  const s = session();
  const service = s.catalog.services[0];
  const [firstCompany, secondCompany] = s.catalog.insuranceCompanies;
  const firstClasses = s.catalog.insuranceClasses.filter((item) => item.insuranceCompanyId === firstCompany.id);
  const quoted = await s.turn(`سعر ${service.name} ${firstCompany.name} ${firstClasses[0].name}`);

  const classText = `${firstClasses[0].name} ${firstClasses[1].name}`;
  assert.equal(Machine.owns(classText, { priceInquiry: quoted.nextPriceState }, s.catalog), true);
  const classReplacement = await s.turn(classText, quoted.nextPriceState);
  assert.equal(classReplacement.currentSlots.insuranceClassId, firstClasses[1].id);
  assert.equal(classReplacement.nextPriceState.serviceId, service.id);
  assert.equal(classReplacement.nextPriceState.insuranceCompanyId, firstCompany.id);
  assert.equal(classReplacement.nextPriceState.insuranceClassId, firstClasses[1].id);
  assert.equal(classReplacement.invalidatedSlots.includes('quote'), true);
  assert.equal(classReplacement.action, 'QUOTE_INSURANCE_PRICE');

  const companyText = `${firstCompany.name} ${secondCompany.name}`;
  assert.equal(Machine.owns(companyText, { priceInquiry: quoted.nextPriceState }, s.catalog), true);
  const companyReplacement = await s.turn(companyText, quoted.nextPriceState);
  assert.equal(companyReplacement.currentSlots.insuranceCompanyId, secondCompany.id);
  assert.equal(companyReplacement.nextPriceState.serviceId, service.id);
  assert.equal(companyReplacement.nextPriceState.paymentMethod, 'insurance');
  assert.equal(companyReplacement.nextPriceState.insuranceCompanyId, secondCompany.id);
  assert.equal(companyReplacement.nextPriceState.insuranceClassId, null);
  assert.equal(companyReplacement.nextPriceState.quote, null);
  assert.equal(companyReplacement.action, 'ASK_INSURANCE_CLASS');

  const unrelated = await s.machine.prepare({ message: 'طلب غير متعلق', persistedPriceState: quoted.nextPriceState,
    catalog: s.catalog, currentInquiry: { type: 'unknown' } }, s.priceService);
  assert.equal(unrelated.action, 'YIELD');
  assert.deepEqual(unrelated.nextPriceState, quoted.nextPriceState);
});

test('a price subflow suspends and retargets one existing booking draft only on canonical handoff', async () => {
  const f = catalogFixture();
  const engine = new ShadenEngine({ priceService: f.priceService });
  const cash = f.catalog.paymentMethods.find((item) => item.code === 'cash');
  const original = ShadenEngine.createBookingState();
  Object.assign(original, {
    step: 'date_period', specialtyId: 'preserved-specialty', serviceId: f.catalog.services[0].id,
    city: 'old-city', branchId: 'old-branch', doctorId: 'old-doctor', roomId: 'old-room',
    date: '2026-08-20', datePeriod: 'this_week', timePeriod: 'morning',
    preferredStart: '2026-08-20T08:00:00.000Z', paymentMethodId: 'old-payment',
    insuranceCompanyId: 'old-company', insuranceClassId: 'old-class',
  });
  const state = { version: 1, mode: 'idle', step: null, customer: { name: 'Patient' },
    context: null, options: [], booking: original };
  const started = await engine.handle({ message: { text: `سعر ${f.catalog.services[1].name}` },
    currentState: state, clinicData: f.catalog });
  assert.equal(started.nextState.activeOperationalOwner, 'price');
  assert.equal(started.nextState.bookingSuspendedByPrice, true);
  assert.equal(started.nextState.booking.serviceId, f.catalog.services[0].id);
  assert.equal(started.nextState.priceInquiry.serviceId, f.catalog.services[1].id);

  const quoted = await engine.handle({ message: { text: 'opaque', rawPayload: { value: cash.id },
    inputProvenance: { trusted: true } }, currentState: started.nextState, clinicData: f.catalog });
  assert.equal(quoted.nextState.activeOperationalOwner, 'price');
  assert.equal(quoted.nextState.booking.serviceId, f.catalog.services[0].id);
  assert.equal(quoted.nextState.priceInquiry.quoteCompleted, true);

  const choice = await engine.handle({ message: { text: 'opaque', rawPayload: { value: 'price-booking:yes' },
    inputProvenance: { trusted: true } }, currentState: quoted.nextState, clinicData: f.catalog });
  assert.equal(choice.interaction.purpose, 'select_booking_service_scope');
  assert.deepEqual(choice.nextState.pendingBookingServiceChoice, {
    existingBookingServiceId: f.catalog.services[0].id,
    currentPriceServiceId: f.catalog.services[1].id,
  });
  assert.equal(choice.nextState.booking.serviceId, f.catalog.services[0].id);

  const retargeted = await engine.handle({ message: { text: 'opaque', rawPayload: {
    value: `booking-service-choice:${f.catalog.services[1].id}` }, inputProvenance: { trusted: true } },
  currentState: choice.nextState, clinicData: f.catalog });
  const booking = retargeted.nextState.booking;
  assert.equal(retargeted.nextState.activeOperationalOwner, 'booking');
  assert.equal(retargeted.nextState.priceInquiry, undefined);
  assert.equal(booking.serviceId, f.catalog.services[1].id);
  assert.equal(booking.specialtyId, 'preserved-specialty');
  for (const field of ['branchId', 'doctorId', 'roomId', 'date', 'datePeriod', 'timePeriod',
    'preferredStart', 'insuranceCompanyId', 'insuranceClassId']) assert.equal(booking[field], null, field);
  assert.equal(booking.paymentMethodId, cash.id);
  assert.equal(booking.step, 'branch');
});

test('booking-service scope choice resumes the preserved draft or rejects a stale choice without mutation', async () => {
  const f = catalogFixture();
  const availableDate = new Date().toISOString().slice(0, 10);
  const engine = new ShadenEngine({ priceService: f.priceService,
    bookingEngine: { getAvailableDates: async () => ({ dates: [availableDate] }) } });
  const original = ShadenEngine.createBookingState();
  Object.assign(original, { step: 'date_period', serviceId: f.catalog.services[0].id,
    city: f.catalog.branches[0].city, branchId: f.catalog.branches[0].id,
    date: null, datePeriod: null });
  const state = { version: 1, mode: 'idle', step: null, customer: { name: 'Patient' },
    context: null, options: [], booking: original };
  const started = await engine.handle({ message: { text: `سعر ${f.catalog.services[1].name}` },
    currentState: state, clinicData: f.catalog });
  const cash = f.catalog.paymentMethods.find((item) => item.code === 'cash');
  const quoted = await engine.handle({ message: { text: 'opaque', rawPayload: { value: cash.id },
    inputProvenance: { trusted: true } }, currentState: started.nextState, clinicData: f.catalog });
  const choice = await engine.handle({ message: { text: 'opaque', rawPayload: { value: 'price-booking:yes' },
    inputProvenance: { trusted: true } }, currentState: quoted.nextState, clinicData: f.catalog });

  const stale = await engine.handle({ message: { text: 'opaque', rawPayload: { value: 'booking-service-choice:unknown' },
    inputProvenance: { trusted: true } }, currentState: choice.nextState, clinicData: f.catalog });
  assert.equal(stale.interaction.purpose, 'select_booking_service_scope');
  assert.deepEqual(stale.nextState.booking, choice.nextState.booking);
  assert.deepEqual(stale.nextState.pendingBookingServiceChoice, choice.nextState.pendingBookingServiceChoice);

  const resumed = await engine.handle({ message: { text: 'opaque', rawPayload: {
    value: `booking-service-choice:${f.catalog.services[0].id}` }, inputProvenance: { trusted: true } },
  currentState: choice.nextState, clinicData: f.catalog });
  assert.equal(resumed.nextState.activeOperationalOwner, 'booking');
  assert.equal(resumed.nextState.booking.serviceId, f.catalog.services[0].id);
  assert.equal(resumed.nextState.booking.step, 'date_period');
  assert.equal(resumed.nextState.pendingBookingServiceChoice, undefined);
  assert.equal(resumed.interaction.purpose, 'select_date_period');
  assert.ok(resumed.reply);
});

test('old-service choice preserves synchronous booking-step replies', async () => {
  const f = catalogFixture();
  const engine = new ShadenEngine({ priceService: f.priceService });
  const original = ShadenEngine.createBookingState();
  Object.assign(original, { step: 'branch', serviceId: f.catalog.services[0].id,
    city: f.catalog.branches[0].city });
  const state = { version: 1, mode: 'idle', step: null, customer: { name: 'Patient' },
    context: null, options: [], booking: original };
  const started = await engine.handle({ message: { text: `سعر ${f.catalog.services[1].name}` },
    currentState: state, clinicData: f.catalog });
  const cash = f.catalog.paymentMethods.find((item) => item.code === 'cash');
  const quoted = await engine.handle({ message: { text: 'opaque', rawPayload: { value: cash.id },
    inputProvenance: { trusted: true } }, currentState: started.nextState, clinicData: f.catalog });
  const choice = await engine.handle({ message: { text: 'opaque', rawPayload: { value: 'price-booking:yes' },
    inputProvenance: { trusted: true } }, currentState: quoted.nextState, clinicData: f.catalog });
  const resumed = await engine.handle({ message: { text: 'opaque', rawPayload: {
    value: `booking-service-choice:${f.catalog.services[0].id}` }, inputProvenance: { trusted: true } },
  currentState: choice.nextState, clinicData: f.catalog });
  assert.equal(resumed.nextState.booking.step, 'branch');
  assert.equal(resumed.nextState.booking.serviceId, f.catalog.services[0].id);
  assert.equal(resumed.interaction.purpose, 'select_branch');
  assert.ok(resumed.reply);
});

test('same-service and no-prior-booking confirmations keep the normal handoff path', async () => {
  const f = catalogFixture();
  const cash = f.catalog.paymentMethods.find((item) => item.code === 'cash');
  const engine = new ShadenEngine({ priceService: f.priceService });
  const sameService = f.catalog.services[0];
  const original = ShadenEngine.createBookingState();
  Object.assign(original, { step: 'branch', serviceId: sameService.id, city: 'old-city' });
  const withBooking = { version: 1, mode: 'idle', step: null, customer: { name: 'Patient' },
    context: null, options: [], booking: original };
  const started = await engine.handle({ message: { text: `سعر ${sameService.name}` }, currentState: withBooking, clinicData: f.catalog });
  const quoted = await engine.handle({ message: { text: 'opaque', rawPayload: { value: cash.id },
    inputProvenance: { trusted: true } }, currentState: started.nextState, clinicData: f.catalog });
  const sameResult = await engine.handle({ message: { text: 'opaque', rawPayload: { value: 'price-booking:yes' },
    inputProvenance: { trusted: true } }, currentState: quoted.nextState, clinicData: f.catalog });
  assert.equal(sameResult.nextState.pendingBookingServiceChoice, undefined);
  assert.equal(sameResult.nextState.activeOperationalOwner, 'booking');

  const noBookingEngine = new ShadenEngine({ priceService: f.priceService });
  const noBookingStarted = await noBookingEngine.handle({ message: { text: `سعر ${f.catalog.services[1].name}` }, clinicData: f.catalog });
  const noBookingQuoted = await noBookingEngine.handle({ message: { text: 'opaque', rawPayload: { value: cash.id },
    inputProvenance: { trusted: true } }, currentState: noBookingStarted.nextState, clinicData: f.catalog });
  const noBookingResult = await noBookingEngine.handle({ message: { text: 'opaque', rawPayload: { value: 'price-booking:yes' },
    inputProvenance: { trusted: true } }, currentState: noBookingQuoted.nextState, clinicData: f.catalog });
  assert.equal(noBookingResult.nextState.pendingBookingServiceChoice, undefined);
  assert.equal(noBookingResult.nextState.booking.serviceId, f.catalog.services[1].id);
  assert.equal(noBookingResult.nextState.activeOperationalOwner, 'booking');
});

test('quoted state yields typed other intents and unknown input without any catalog or price lookup', async () => {
  const s = session();
  const quoted = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name} K1`);
  const stored = JSON.parse(JSON.stringify(quoted.nextPriceState));
  let optionLookups = 0;
  s.priceService.listApplicableInsuranceOptions = async () => { optionLookups++; throw new Error('Yield cannot fetch options'); };
  for (const type of ['branches', 'services', 'specialties', 'availability_request', 'unknown']) {
    const d = await s.machine.prepare({ message: 'طلب آخر', persistedPriceState: stored,
      catalog: s.catalog, currentInquiry: { type } }, s.priceService);
    assert.equal(d.action, 'YIELD');
    assert.equal(d.preserveState, true);
    assert.equal(d.nextPriceState, stored);
    assert.deepEqual(d.nextPriceState.quote, quoted.nextPriceState.quote);
    assert.equal(Machine.owns('طلب آخر', { priceInquiry: stored }, s.catalog, { type }), false);
  }
  assert.equal(optionLookups, 0);
  assert.equal(s.calls.length, 1);
});

test('structured booking confirmation owns a quote but an active booking always blocks late handoff', async () => {
  const s = session();
  const quoted = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name} K1`);
  const priceInquiry = quoted.nextPriceState;
  const currentInquiry = { type: 'booking' };
  const message = 'طلب موعد';
  const accepted = await s.machine.prepare({ message, currentInquiry, persistedPriceState: priceInquiry,
    catalog: s.catalog }, s.priceService);
  assert.equal(accepted.action, 'HANDOFF_TO_BOOKING');
  assert.equal(Machine.owns(message, { priceInquiry }, s.catalog, currentInquiry), true);
  const activeBooking = { serviceId: priceInquiry.serviceId, step: 'branch' };
  for (const text of [message, 'نعم', s.catalog.branches[0].name, 'شكرا', s.catalog.insuranceClasses[0].name]) {
    assert.equal(Machine.owns(text, { priceInquiry, booking: activeBooking }, s.catalog, currentInquiry), false);
    const decision = await s.machine.prepare({ message: text, currentInquiry, activeBooking,
      persistedPriceState: priceInquiry, catalog: s.catalog }, s.priceService);
    assert.equal(decision.action, 'YIELD');
  }
  assert.equal(Machine.owns(`سعر ${s.catalog.services[0].name}`, { priceInquiry, booking: activeBooking }, s.catalog), true);
  assert.equal(s.calls.length, 1);
});

test('neutral service survives JSON without any price lookup', async () => {
  const s = session();
  const d = await s.turn(`سعر ${s.catalog.services[0].name}`);
  assert.equal(d.action, 'ASK_PAYMENT_METHOD');
  const next = await s.turn('UNKNOWN', JSON.parse(JSON.stringify(d.nextPriceState)));
  assert.equal(next.action, 'YIELD');
  assert.equal(next.nextPriceState.paymentMethod, null);
  assert.equal(s.calls.length, 0);
});

test('final reduced price state centrally determines the next action', async () => {
  const s = session();
  const service = s.catalog.services[0];
  const company = s.catalog.insuranceCompanies[0];
  const insuranceClass = s.catalog.insuranceClasses.find((item) => item.insuranceCompanyId === company.id);

  const missingService = await s.turn('سعر خدمة غير معروفة');
  assert.equal(missingService.nextPriceState.pendingSlot, 'service');
  assert.equal(missingService.action, 'ASK_SERVICE');

  const missingPayment = await s.turn(`سعر ${service.name}`);
  assert.equal(missingPayment.nextPriceState.pendingSlot, 'paymentMethod');
  assert.equal(missingPayment.action, 'ASK_PAYMENT_METHOD');

  const missingCompany = await s.turn(`سعر ${service.name} تأمين`);
  assert.equal(missingCompany.nextPriceState.pendingSlot, 'insuranceCompany');
  assert.equal(missingCompany.action, 'ASK_INSURANCE_COMPANY');

  const missingClass = await s.turn(`سعر ${service.name} ${company.name}`);
  assert.equal(missingClass.nextPriceState.pendingSlot, 'insuranceClass');
  assert.equal(missingClass.action, 'ASK_INSURANCE_CLASS');

  const cashQuote = await s.turn(`سعر ${service.name} كاش`);
  assert.equal(cashQuote.action, 'QUOTE_CASH_PRICE');
  assert.equal(cashQuote.nextPriceState.quoteCompleted, true);

  const insuranceQuote = await s.turn(`سعر ${service.name} ${company.name} ${insuranceClass.name}`);
  assert.equal(insuranceQuote.action, 'QUOTE_INSURANCE_PRICE');
  assert.equal(insuranceQuote.nextPriceState.quoteCompleted, true);
});

for (const company of catalogFixture().catalog.insuranceCompanies) {
  test(`company without class asks only class: ${company.id}`, async () => {
    const s = session();
    const d = await s.turn(`سعر ${s.catalog.services[0].name} ${company.name}`);
    assert.equal(d.action, 'ASK_INSURANCE_CLASS');
    assert.equal(d.nextPriceState.selected_payment_method, 'insurance');
    assert.equal(s.calls.length, 0);
  });
  for (const item of catalogFixture().catalog.insuranceClasses.filter(x => x.insuranceCompanyId === company.id)) {
    test(`exact catalog quote ${item.id}`, async () => {
      const s = session();
      const d = await s.turn(`سعر ${s.catalog.services[0].name} ${company.name} ${item.name}`);
      assert.equal(d.action, 'QUOTE_INSURANCE_PRICE');
      const row = s.prices.find(x => x.serviceId === s.catalog.services[0].id && x.insuranceClassId === item.id);
      assert.equal(d.nextPriceState.amount, row.price);
      assert.equal(d.nextPriceState.selected_insurance_class_id, item.id);
      assert.equal(s.calls.length, 1);
    });
  }
}

test('company overrides cash in same current message', async () => {
  const s = session();
  const d = await s.turn(`سعر ${s.catalog.services[0].name} كاش ${s.catalog.insuranceCompanies[0].name}`);
  assert.equal(d.action, 'ASK_INSURANCE_CLASS');
  assert.equal(d.nextPriceState.selected_payment_method, 'insurance');
  assert.equal(s.calls.length, 0);
});

test('company changes invalidate class; service changes invalidate quote scope', async () => {
  const s = session();
  const first = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name} K1`);
  const second = await s.turn(s.catalog.insuranceCompanies[1].name, first.nextPriceState);
  assert.equal(second.action, 'ASK_INSURANCE_CLASS');
  assert.equal(second.nextPriceState.selected_insurance_class_id, null);
  const third = await s.turn(`سعر ${s.catalog.services[1].name}`, first.nextPriceState);
  assert.equal(third.action, 'ASK_PAYMENT_METHOD');
  for (const key of ['selected_payment_method', 'selected_insurance_company_id', 'selected_insurance_class_id', 'amount']) assert.equal(third.nextPriceState[key], null);
});

for (const status of ['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND']) {
  test(`${status} without price evidence yields and preserves pending class`, async () => {
    const s = session();
    const first = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name}`);
    const next = await s.turn({ text: 'غير واضح', status }, first.nextPriceState);
    assert.equal(next.action, 'YIELD');
    assert.deepEqual(next.nextPriceState, first.nextPriceState);
    assert.equal(s.calls.length, 0);
  });
}

test('invalid class and foreign-company class never produce cash', async () => {
  const s = session();
  const first = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name}`);
  for (const input of [{ insuranceClass: s.catalog.insuranceClasses[2] }, { insuranceClass: { id: 'invalid', name: 'Z9' } }]) {
    const d = await s.turn('فئة Z9', first.nextPriceState, input);
    assert.equal(d.action, 'INVALID_INSURANCE_CLASS');
    assert.ok(d.options.classes.every(x => x.insuranceCompanyId === first.nextPriceState.selected_insurance_company_id));
    assert.equal(s.calls.length, 0);
  }
});

test('explicit cash succeeds; missing price becomes PRICE_NOT_FOUND with no handoff', async () => {
  const s = session();
  const d = await s.turn(`سعر ${s.catalog.services[0].name} كاش`);
  assert.equal(d.action, 'QUOTE_CASH_PRICE');
  assert.equal(d.evidence, 'CURRENT');
  s.prices.splice(0, s.prices.length);
  const missing = await s.turn(`سعر ${s.catalog.services[1].name} كاش`);
  assert.equal(missing.action, 'PRICE_NOT_FOUND');
  const agree = await s.turn('نعم', missing.nextPriceState);
  assert.notEqual(agree.action, 'HANDOFF_TO_BOOKING');
});

test('insurance without company asks company; quote approval hands off exact scope', async () => {
  const s = session();
  const first = await s.turn(`سعر ${s.catalog.services[0].name} تأمين`);
  assert.equal(first.action, 'ASK_INSURANCE_COMPANY');
  const priced = await s.turn(`${s.catalog.insuranceCompanies[0].name} K1`, first.nextPriceState);
  const accepted = await s.turn('نعم', JSON.parse(JSON.stringify(priced.nextPriceState)));
  assert.equal(accepted.action, 'HANDOFF_TO_BOOKING');
  assert.deepEqual(accepted.nextPriceState, priced.nextPriceState);
  assert.equal(s.calls.length, 1);
});

test('CURRENT cash flag alone is not textual evidence', async () => {
  const s = session();
  const d = await s.turn(`سعر ${s.catalog.services[0].name}`, null, { cash: true });
  assert.equal(d.action, 'ASK_PAYMENT_METHOD');
  assert.equal(s.calls.length, 0);
});

test('current ID slots override persisted selections and stale names are catalog grounded', async () => {
  const s = session();
  const first = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name} K1`);
  const next = await s.turn('اختيار', first.nextPriceState, { insuranceCompanyId: s.catalog.insuranceCompanies[1].id });
  assert.equal(next.action, 'ASK_INSURANCE_CLASS');
  assert.equal(next.nextPriceState.selected_insurance_company_name, s.catalog.insuranceCompanies[1].name);
  assert.equal(next.nextPriceState.selected_insurance_class_id, null);
  const changed = await s.turn('اختيار', first.nextPriceState, { serviceId: s.catalog.services[1].id });
  assert.equal(changed.action, 'ASK_PAYMENT_METHOD');
  assert.equal(changed.nextPriceState.selected_service_id, s.catalog.services[1].id);
});

test('failed insurance lookup cannot be confirmed or retried by an unknown reply', async () => {
  const s = session();
  s.priceService.resolvePrice = async input => { s.calls.push(input); throw new Error('Missing quote'); };
  const failed = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name} K1`);
  assert.equal(failed.action, 'PRICE_NOT_FOUND');
  const next = await s.turn('نعم', failed.nextPriceState);
  assert.equal(next.action, 'YIELD');
  assert.equal(s.calls.length, 1);
});

test('exact catalog class outranks unknown semantic status while waiting', async () => {
  const s = session();
  const first = await s.turn(`سعر ${s.catalog.services[0].name} ${s.catalog.insuranceCompanies[0].name}`);
  for (const status of ['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND']) {
    const next = await s.turn({ text: 'K1', status }, first.nextPriceState);
    assert.equal(next.action, 'QUOTE_INSURANCE_PRICE');
    assert.equal(next.nextPriceState.insuranceCompanyId, first.nextPriceState.insuranceCompanyId);
    assert.equal(next.nextPriceState.insuranceClassId, s.catalog.insuranceClasses[0].id);
  }
});

test('ShadenEngine has no residual price decision path', async () => {
  const fs = require('node:fs');
  const Engine = require('../../src/services/shaden/ShadenEngine');
  const source = fs.readFileSync(require.resolve('../../src/services/shaden/ShadenEngine'), 'utf8');
  assert.doesNotMatch(source, /handlePriceInquiry|handleCompoundPriceInput|resolveCashPrice|resolveInsurancePrice|continueReadyPriceInquiry|rejectedInsuranceClassReply|normalizePriceInquiryState|normalizePriceKeyboardInput|\.resolvePrice\(/);
  const f = catalogFixture();
  const engine = new Engine({ priceService: f.priceService });
  engine.priceStateMachine.prepare = async () => { throw new Error('Required price decision missing'); };
  await assert.rejects(engine.handle({ message: { text: `سعر ${f.catalog.services[0].name}` }, clinicData: f.catalog }), /Required price decision missing/);
  assert.equal(f.calls.length, 0);
});
