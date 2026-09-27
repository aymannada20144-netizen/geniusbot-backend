'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Controller = require('../../src/channels/whatsapp/WhatsAppController');
const createRuntime = require('../../src/services/shaden/createShadenEngine');
const { catalogFixture } = require('../prices/priceFixture');

function harness({ conversationEnabled = false } = {}) {
  const f = catalogFixture();
  const states = new Map();
  const sent = [];
  const resources = {
    services: f.catalog.services, branches: f.catalog.branches, specialties: [],
    'payment-methods': f.catalog.paymentMethods, 'insurance-companies': f.catalog.insuranceCompanies,
    'insurance-classes': f.catalog.insuranceClasses.map(x => ({ ...x, class_name: x.name, insurance_company_id: x.insuranceCompanyId, is_accepted: true })),
    'branch-working-hours': [],
  };
  const logger = { info() {}, warn() {}, error() {} };
  const runtime = createRuntime({
    clinicService: { async resolveWhatsAppClinic() { return f.catalog.clinic; } },
    conversationService: {
      async findOrCreateForChannel({ channelIdentity }) { return { id: channelIdentity, botEnabled: true }; },
      async loadState(id) { return structuredClone(states.get(id) || { data: {} }); },
      async updateState(id, state) { states.set(id, JSON.parse(JSON.stringify(state))); },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() { return { id: 'incoming' }; },
      async saveOutgoingMessage() {},
    },
    catalogService: { async list(resource) { return resources[resource] || []; } },
    clinicConfigurationSource: { async get() { return { assistantName: 'شادن', assistantGender: 'female' }; } },
    priceService: f.priceService,
    async sendMessage(message) { sent.push(message); return { messageId: `out-${sent.length}` }; },
    logger,
    conversationEnabled,
    conversationProvider: { async complete() { throw new Error('Price flow must not enter conversational owner'); } },
    semanticProvider: { async completeJson() { return { result: { status: 'UNKNOWN' } }; } },
  });
  let completion;
  const controller = new Controller({ processMessage(raw) {
    completion = runtime.processMessage(raw);
    return completion;
  } }, { logger });
  let number = 0;
  return { ...f, states, sent, async send(text, sender = '966500000011') {
    await controller.receiveWebhook({ body: { object: 'whatsapp_business_account', entry: [{ changes: [{
      field: 'messages', value: { metadata: { phone_number_id: 'test', display_phone_number: '966500000099' },
        messages: [{ from: sender, id: `in-${++number}`, type: 'text', text: { body: text } }] },
    }] }] } }, { code(status) { assert.equal(status, 200); return this; }, send() {} });
    assert.ok(completion, 'real controller must dispatch parsed webhook');
    return completion;
  } };
}

test('real controller/runtime persists neutral service and scopes two conversations independently', async () => {
  const h = harness();
  let a = await h.send(`سعر ${h.catalog.services[0].name}`);
  assert.equal(a.state.data.shaden.priceInquiry.selected_payment_method, null);
  assert.equal(h.calls.length, 0);
  const b = await h.send(`سعر ${h.catalog.services[1].name} كاش`, '966500000022');
  assert.equal(b.state.data.shaden.priceInquiry.selected_service_id, h.catalog.services[1].id);
  a = await h.send(h.catalog.insuranceCompanies[0].name);
  assert.equal(a.state.data.shaden.priceInquiry.state, 'awaiting_price_insurance_class');
  a = await h.send('K1');
  assert.equal(a.state.data.shaden.priceInquiry.selected_service_id, h.catalog.services[0].id);
  assert.equal(a.state.data.shaden.priceInquiry.amount, h.prices.find(x => x.insuranceClassId === h.catalog.insuranceClasses[0].id).price);
  a = await h.send('نعم');
  assert.equal(a.state.data.shaden.priceInquiry, undefined);
  assert.equal(a.state.data.shaden.booking.insuranceClassId, h.catalog.insuranceClasses[0].id);
  assert.equal(h.calls.length, 2);
});

for (const company of catalogFixture().catalog.insuranceCompanies) {
  for (const item of catalogFixture().catalog.insuranceClasses.filter(x => x.insuranceCompanyId === company.id)) {
    test(`controller resolves exact catalog company/class ${item.id}`, async () => {
      const h = harness();
      const result = await h.send(`سعر ${h.catalog.services[0].name} ${company.name} ${item.name}`);
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].insuranceClassId, item.id);
      assert.equal(result.state.data.shaden.priceInquiry.selected_payment_method, 'insurance');
      assert.doesNotMatch(result.replyText, /كاش/);
    });
  }
}

test('controller keeps price context across side question and unknown class replies', async () => {
  const h = harness();
  const first = await h.send(`سعر ${h.catalog.services[0].name} ${h.catalog.insuranceCompanies[0].name}`);
  const side = await h.send('وين موقعكم');
  assert.match(side.replyText, new RegExp(h.catalog.branches[0].name));
  assert.deepEqual(side.state.data.shaden.priceInquiry, first.state.data.shaden.priceInquiry);
  for (const word of ['UNKNOWN', 'AMBIGUOUS', 'NOT_FOUND']) {
    const next = await h.send(word);
    assert.equal(next.state.data.shaden.priceInquiry.state, 'awaiting_price_insurance_class');
    assert.equal(h.calls.length, 0);
  }
  const result = await h.send('K2');
  assert.equal(result.state.data.shaden.priceInquiry.selected_insurance_class_id, h.catalog.insuranceClasses[1].id);
  assert.equal(h.calls.length, 1);
});

test('controller rejects foreign class and missing insurance prices without cash', async () => {
  const h = harness();
  h.catalog.insuranceClasses[2].name = 'FOREIGN';
  await h.send(`سعر ${h.catalog.services[0].name} ${h.catalog.insuranceCompanies[0].name}`);
  const bad = await h.send('فئة Z9');
  assert.equal(bad.state.data.shaden.priceInquiry.selected_insurance_class_id, null);
  assert.equal(h.calls.length, 0);
  assert.doesNotMatch(bad.replyText, /كاش/);
  h.priceService.resolvePrice = async input => { h.calls.push(input); throw new Error('No active price'); };
  const failed = await h.send('K1');
  assert.equal(failed.state.data.shaden.priceInquiry.quoteCompleted, false);
  assert.equal(h.calls.length, 1);
  assert.doesNotMatch(failed.replyText, /كاش/);
});

test('conversation-enabled runtime routes first price and ACTIVE_FLOW_REPLY through the machine', async () => {
  const h = harness({ conversationEnabled: true });
  const first = await h.send(`سعر ${h.catalog.services[0].name} ${h.catalog.insuranceCompanies[0].name}`);
  assert.equal(first.state.data.shaden.priceInquiry.state, 'awaiting_price_insurance_class');
  const next = await h.send('K1');
  assert.equal(next.state.data.shaden.priceInquiry.quoteCompleted, true);
  assert.equal(h.calls.length, 1);
});

test('controller invalidates old class and quote on company/service changes', async () => {
  const h = harness();
  await h.send(`سعر ${h.catalog.services[0].name} ${h.catalog.insuranceCompanies[0].name} K1`);
  const company = await h.send(h.catalog.insuranceCompanies[1].name);
  assert.equal(company.state.data.shaden.priceInquiry.selected_insurance_class_id, null);
  assert.equal(company.state.data.shaden.priceInquiry.quoteCompleted, false);
  assert.equal(h.calls.length, 1);
  await h.send('K2');
  assert.equal(h.calls.at(-1).insuranceClassId, h.catalog.insuranceClasses[3].id);
  const service = await h.send(`سعر ${h.catalog.services[1].name}`);
  assert.equal(service.state.data.shaden.priceInquiry.selected_insurance_company_id, null);
  assert.equal(service.state.data.shaden.priceInquiry.selected_payment_method, null);
  assert.equal(h.calls.length, 2);
});
