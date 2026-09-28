'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Machine = require('../../src/services/shaden/PriceStateMachine');
const Executor = require('../../src/services/shaden/PriceDecisionExecutor');
const Policy = require('../../src/services/shaden/ShadenPolicy');
const { catalogFixture } = require('./priceFixture');
const policy = new Policy();

test('executor rejects absent, null and foreign decisions before lookup', async () => {
  const f = catalogFixture();
  const executor = new Executor({ policy, priceService: f.priceService });
  for (const d of [null, {}, { action: null }, { action: 'QUOTE_CASH_PRICE', owner: 'ShadenEngine' }]) {
    await assert.rejects(executor.execute(d), /decision/);
  }
  assert.equal(f.calls.length, 0);
});

for (const action of ['ASK_PAYMENT_METHOD', 'ASK_INSURANCE_COMPANY', 'ASK_INSURANCE_CLASS', 'INVALID_INSURANCE_COMPANY',
  'INVALID_INSURANCE_CLASS', 'PRICE_NOT_FOUND', 'OFFER_BOOKING', 'HANDOFF_TO_BOOKING']) {
  test(`${action} must never call lookup or interpret input`, async () => {
    const executor = new Executor({ policy, priceService: { resolvePrice() { throw new Error('Forbidden lookup'); } } });
    const decision = { owner: 'PriceStateMachine', action };
    Object.defineProperty(decision, 'message', { get() { throw new Error('Forbidden text interpretation'); } });
    const result = await executor.execute(Object.freeze(decision));
    assert.equal(result.type, 'NO_LOOKUP');
  });
}

test('cash requires consistent current evidence; executor cannot merge or change state', async () => {
  const f = catalogFixture();
  const m = new Machine({ policy });
  const e = new Executor({ policy, priceService: f.priceService });
  const d = m.decide({ message: `سعر ${f.catalog.services[0].name} كاش`, catalog: f.catalog });
  for (const bad of [{ evidence: 'PERSISTED' }, { currentSlots: {} }, { provenance: {} },
    { currentSlots: { cash: true, company: f.catalog.insuranceCompanies[0] } }]) {
    await assert.rejects(e.execute({ ...d, ...bad }), /CURRENT/);
  }
  const before = structuredClone(d);
  const outcome = await e.execute(d);
  assert.equal(outcome.type, 'QUOTE_SUCCEEDED');
  assert.equal(typeof outcome.amount, 'number');
  assert.deepEqual(d, before);
  assert.equal(f.calls.length, 1);
});

test('insurance lookup failure has no second lookup or cash fallback', async () => {
  const f = catalogFixture();
  const m = new Machine({ policy });
  const e = new Executor({ policy, priceService: f.priceService });
  const d = m.decide({ message: `سعر ${f.catalog.services[0].name} ${f.catalog.insuranceCompanies[0].name} K1`, catalog: f.catalog });
  f.prices.splice(0, f.prices.length);
  const result = m.complete(d, await e.execute(d));
  assert.equal(result.action, 'PRICE_NOT_FOUND');
  assert.equal(result.nextPriceState.quoteCompleted, false);
  assert.equal(result.nextPriceState.amount, null);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].paymentMethodId, f.catalog.paymentMethods[1].id);
  assert.doesNotMatch(e.render(result, f.catalog), /كاش/);
});
