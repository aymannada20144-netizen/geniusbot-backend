'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const PriceStateMachine = require('../../src/services/shaden/PriceStateMachine');
const PriceDecisionExecutor = require('../../src/services/shaden/PriceDecisionExecutor');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const { adapt } = require('../../src/services/shaden/LegacyPriceStateAdapter');
const PriceState = require('../../src/services/shaden/PriceState');
const { catalogFixture } = require('./priceFixture');

function harness() {
  const fixture = catalogFixture();
  const policy = new ShadenPolicy();
  const machine = new PriceStateMachine({ policy });
  const executor = new PriceDecisionExecutor({ policy, priceService: fixture.priceService });
  return { ...fixture, machine, async decide(persisted, currentSlots = {}) {
    const decision = await machine.prepare({ message: 'input', currentSlots,
      persistedPriceState: persisted, catalog: fixture.catalog }, fixture.priceService);
    const completed = machine.complete(decision, await executor.execute(decision));
    assert.equal(completed.nextPriceState?.schemaVersion, 2);
    return completed;
  } };
}

function legacy({ service, payment, company, insuranceClass, quote } = {}) {
  return { intent: 'price_inquiry', state: quote ? 'awaiting_price_booking_confirmation' : 'awaiting_price_insurance_class',
    selected_service_id: service?.id || null, selected_service_name: service?.name || null,
    selected_payment_method: payment?.code || null,
    selected_insurance_company_id: company?.id || null, selected_insurance_company_name: company?.name || null,
    selected_insurance_class_id: insuranceClass?.id || null, selected_insurance_class_name: insuranceClass?.name || null,
    resolved_insurance_price: quote?.rawAmount || null, currency: quote?.currency || null,
    quoteCompleted: Boolean(quote), amount: quote?.amount ?? null };
}

test('legacy cash plus CURRENT insurer reduces to current insurance scope', async () => {
  const h = harness();
  const [service] = h.catalog.services;
  const [cash, insurance] = h.catalog.paymentMethods;
  const [company] = h.catalog.insuranceCompanies;
  const result = await h.decide(legacy({ service, payment: cash }), { insuranceCompanyId: company.id });
  assert.equal(result.nextPriceState.paymentMethod.id, insurance.id);
  assert.equal(result.nextPriceState.insuranceCompany.id, company.id);
  assert.equal(result.nextPriceState.insuranceClass, null);
  assert.equal(result.nextPriceState.quote, null);
});

test('CURRENT insurer overrides legacy insurer and invalidates dependent class', async () => {
  const h = harness();
  const [service] = h.catalog.services;
  const insurance = h.catalog.paymentMethods.find(x => x.code === 'insurance');
  const [first, second] = h.catalog.insuranceCompanies;
  const previous = h.catalog.insuranceClasses.find(x => x.insuranceCompanyId === first.id);
  const result = await h.decide(legacy({ service, payment: insurance, company: first, insuranceClass: previous }), { insuranceCompanyId: second.id });
  assert.equal(result.nextPriceState.insuranceCompany.id, second.id);
  assert.equal(result.nextPriceState.insuranceClass, null);
  assert.equal(result.nextPriceState.quote, null);
});

test('legacy class is discarded when its parent company changes', () => {
  const h = harness();
  const [service] = h.catalog.services;
  const insurance = h.catalog.paymentMethods.find(x => x.code === 'insurance');
  const [first, second] = h.catalog.insuranceCompanies;
  const oldClass = h.catalog.insuranceClasses.find(x => x.insuranceCompanyId === first.id);
  const v2 = adapt(legacy({ service, payment: insurance, company: second, insuranceClass: oldClass }), h.catalog);
  assert.equal(v2.insuranceCompany.id, second.id);
  assert.equal(v2.insuranceClass, null);
});

test('corrupt legacy state retains only catalog-provable entities', () => {
  const h = harness();
  const state = adapt({ intent: 'price_inquiry', state: 'anything', selected_service_id: 'missing',
    selected_payment_method: 'cash', selected_insurance_company_id: 'missing', selected_insurance_class_id: 'missing',
    resolved_cash_price: '123', currency: 'SAR', quoteCompleted: true }, h.catalog);
  assert.equal(state.service, null);
  assert.equal(state.paymentMethod.code, 'cash');
  assert.equal(state.insuranceCompany, null);
  assert.equal(state.insuranceClass, null);
  assert.equal(state.quote, null);
});

test('new and serialized V2 conversations are deterministic', async () => {
  const h = harness();
  const [service] = h.catalog.services;
  const direct = await h.decide(null, { serviceId: service.id });
  const serialized = JSON.parse(JSON.stringify(direct.nextPriceState));
  const repeated = await h.decide(serialized);
  assert.equal(direct.action, repeated.action);
  assert.deepEqual(direct.nextPriceState, repeated.nextPriceState);
  assert.deepEqual(Object.keys(serialized).sort(), [...PriceState.FIELDS].sort());
});

test('price adaptation does not alter an active booking state', () => {
  const h = harness();
  const booking = { step: 'branch', serviceId: h.catalog.services[0].id, branchId: 'active-branch' };
  const envelope = { booking: structuredClone(booking), priceInquiry: legacy({ service: h.catalog.services[0] }) };
  envelope.priceInquiry = adapt(envelope.priceInquiry, h.catalog);
  assert.deepEqual(envelope.booking, booking);
});

test('equal grounded current slots produce equal decisions independently of text surface', async () => {
  const h = harness();
  const [service] = h.catalog.services;
  const slots = { serviceId: service.id };
  const a = await h.decide(null, slots);
  const b = await h.decide(null, slots);
  assert.deepEqual({ action: a.action, state: a.nextPriceState }, { action: b.action, state: b.nextPriceState });
});
