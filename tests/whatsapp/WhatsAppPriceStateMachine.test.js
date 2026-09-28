'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Controller = require('../../src/channels/whatsapp/WhatsAppController');
const createRuntime = require('../../src/services/shaden/createShadenEngine');
const { catalogFixture } = require('../prices/priceFixture');
const ConversationRepository = require('../../src/repositories/ConversationRepository');
const ConversationService = require('../../src/services/ConversationService');
const Machine = require('../../src/services/shaden/PriceStateMachine');
const { createRequire } = require('node:module');
const Policy = require('../../src/services/shaden/ShadenPolicy');
const { adapt } = require('../../src/services/shaden/LegacyPriceStateAdapter');

test('typed branch question yields after quote and confirmation resumes the same persisted quote', async () => {
  const meaning = { status: 'UNKNOWN', goal: null, subjects: [], constraints: [] };
  const h = harness({ conversationEnabled: true, semanticResult: meaning });
  const service = h.catalog.services[0], company = h.catalog.insuranceCompanies[0];
  const cls = h.catalog.insuranceClasses.find(x => x.insuranceCompanyId === company.id);
  await h.send(`سعر ${service.name} ${company.name} ${cls.name}`);
  const before = structuredClone(h.writes.at(-1).data.shaden.priceInquiry);
  meaning.status = 'UNDERSTOOD'; meaning.goal = 'ASK';
  meaning.subjects = [{ kind: 'BRANCH', surface: h.catalog.branches[0].name, source: 'CURRENT' }];
  const question = await h.send(h.catalog.branches[0].name);
  assert.equal(question.replyText, new Policy().branches(h.catalog.branches, h.catalog.clinic));
  assert.doesNotMatch(question.replyText, /هل ترغبين في حجز/);
  assert.deepEqual(h.writes.at(-1).data.shaden.priceInquiry, before);
  assert.equal(h.logs.filter(x => x.event === 'SHADEN_PRICE_STATE_TRANSITION').at(-1).action, 'YIELD');
  assert.equal(h.calls.length, 1);
  const confirmation = 'أرغب بتثبيت الموعد';
  meaning.status = 'UNDERSTOOD'; meaning.goal = 'ACT';
  meaning.subjects = [{ kind: 'APPOINTMENT', surface: confirmation, source: 'CURRENT' }];
  const resumed = await h.send(confirmation);
  const persistedHandoff = h.writes.at(-1).data.shaden;
  assert.equal(persistedHandoff.priceInquiry, undefined);
  assert.equal(persistedHandoff.booking.serviceId, before.serviceId);
  assert.equal(h.writes.filter(x => x.data.shaden.booking && x.data.shaden.priceInquiry).length, 0);
  assert.equal(resumed.state.data.shaden.priceInquiry, undefined);
  assert.equal(resumed.state.data.shaden.booking.serviceId, before.serviceId);
  assert.equal(resumed.state.data.shaden.booking.insuranceCompanyId, before.insuranceCompanyId);
  assert.equal(resumed.state.data.shaden.booking.insuranceClassId, before.insuranceClassId);
  assert.equal(resumed.state.data.shaden.booking.quotedPrice, before.quote.rawAmount);
  assert.equal(resumed.state.data.shaden.booking.paymentMethodId, before.paymentMethodId);
  assert.equal(resumed.state.data.shaden.booking.paymentMethodCode, before.paymentMethod);
  assert.equal(resumed.state.data.shaden.booking.currency, before.quote.currency);
  assert.equal(resumed.state.data.shaden.booking.step, 'branch');
  assert.doesNotMatch(resumed.replyText, /اختاري.*(?:تخصص|خدمة)|التخصصات|الخدمات/);
  assert.equal(h.logs.filter(x => x.event === 'SHADEN_PRICE_STATE_TRANSITION').at(-1).action, 'HANDOFF_TO_BOOKING');
  assert.equal(h.calls.length, 1);
  const handoffIndex = h.logs.findIndex(x => x.event === 'SHADEN_PRICE_STATE_TRANSITION' && x.action === 'HANDOFF_TO_BOOKING');
  assert.ok(handoffIndex >= 0);
  assert.ok(h.logs.findIndex((x, i) => i > handoffIndex && x.event === 'TEST_SEND') > handoffIndex);
  const decisions = h.logs.filter(x => x.event === 'SHADEN_PRICE_STATE_TRANSITION').length;
  meaning.status = 'UNKNOWN'; meaning.goal = null; meaning.subjects = [];
  await h.send(h.catalog.branches[0].name);
  await h.send('شكرًا');
  assert.equal(h.logs.filter(x => x.event === 'SHADEN_PRICE_STATE_TRANSITION').length, decisions);
  assert.equal(h.logs.filter(x => x.action === 'HANDOFF_TO_BOOKING').length, 1);
  assert.equal(h.writes.at(-1).data.shaden.priceInquiry, undefined);
  assert.equal(h.writes.at(-1).data.shaden.booking.serviceId, before.serviceId);
  assert.equal(h.writes.at(-1).data.shaden.booking.quotedPrice, before.quote.rawAmount);
});

test('runtime resolves the single local reducer and canonical IDs survive every stage without a payment catalog row', () => {
  const runtimeRequire = createRequire(require.resolve('../../src/services/shaden/createShadenEngine'));
  const enginePath = runtimeRequire.resolve('./ShadenEngine');
  const machinePath = createRequire(enginePath).resolve('./PriceStateMachine');
  const reducerPath = createRequire(machinePath).resolve('./PriceStateReducer');
  assert.equal(reducerPath, require.resolve('../../src/services/shaden/PriceStateReducer'));
  assert.ok(require.cache[machinePath].children.some(child => child.filename === reducerPath));
  const { catalog } = catalogFixture();
  catalog.paymentMethods = catalog.paymentMethods.filter(x => x.code !== 'insurance');
  const currentGroundedSlots = { serviceId: catalog.services[0].id, insuranceCompanyId: catalog.insuranceCompanies[0].id };
  const machine = new Machine({ policy: new Policy() });
  const result = machine.decide({ message: '', currentSlots: currentGroundedSlots, catalog });
  for (const state of [result.transitionStages.reduced, result.transitionStages.normalized,
    result.nextPriceState, adapt(JSON.parse(JSON.stringify(result.nextPriceState)), catalog)]) {
    assert.equal(state.paymentMethod, 'insurance');
    assert.equal(state.paymentMethodId, null);
    assert.equal(state.insuranceCompanyId, currentGroundedSlots.insuranceCompanyId);
    assert.equal(state.status, 'awaiting_insuranceClass');
    assert.equal(state.pendingSlot, 'insuranceClass');
  }
  assert.equal(result.transitionStages.grounded.insuranceCompanyId, currentGroundedSlots.insuranceCompanyId);
  assert.equal(result.action, 'ASK_INSURANCE_CLASS');
});

test('repository preserves insurer when payment method catalog is incomplete; class never falls back to cash', async () => {
  const h = harness({ missingInsuranceMethod: true });
  const service = h.catalog.services[0], company = h.catalog.insuranceCompanies[0];
  await h.send(`سعر ${service.name} ${company.name}`);
  const first = h.writes.at(-1).data.shaden.priceInquiry;
  assert.equal(first.paymentMethod, 'insurance');
  assert.equal(first.status, 'awaiting_insuranceClass');
  assert.equal(first.pendingSlot, 'insuranceClass');
  const cls = h.catalog.insuranceClasses.find(x => x.insuranceCompanyId === company.id);
  const result = await h.send(cls.name);
  const stored = h.writes.at(-1).data.shaden.priceInquiry;
  assert.equal(stored.insuranceCompanyId, company.id);
  assert.equal(stored.insuranceClassId, cls.id);
  assert.equal(stored.paymentMethod, 'insurance');
  assert.equal(h.calls.length, 0);
  assert.equal(h.logs.filter(x => x.event === 'SHADEN_PRICE_STATE_TRANSITION').at(-1).action, 'PRICE_NOT_FOUND');
  assert.doesNotMatch(result.replyText, /كاش|هل الدفع/);
});

function harness({ conversationEnabled = false, missingInsuranceMethod = false, semanticResult = null } = {}) {
  const f = catalogFixture();
  const states = new Map();
  const sent = [];
  const writes = [];
  const reads = [];
  const repository = new ConversationRepository({ async query(sql, params) {
    if (sql.includes('UPDATE')) {
      const value = { current: params[1], data: JSON.parse(params[2]) };
      writes.push(structuredClone(value));
      states.set(params[0], value);
    } else reads.push(structuredClone(states.get(params[0]) || null));
    const value = states.get(params[0]);
    // pg decodes a JSONB column into an object before the repository sees it.
    return { rows: value ? [{ current_state: value.current, state_payload: structuredClone(value.data) }] : [] };
  } });
  const conversations = new ConversationService(repository);
  const resources = {
    services: f.catalog.services, branches: f.catalog.branches, specialties: [],
    'payment-methods': f.catalog.paymentMethods.filter(x => !missingInsuranceMethod || x.code !== 'insurance')
      .map(x => ({ ...x, code: x.code[0].toUpperCase() + x.code.slice(1) })),
    'insurance-companies': f.catalog.insuranceCompanies,
    'insurance-classes': f.catalog.insuranceClasses.map(x => ({ ...x, class_name: x.name, insurance_company_id: x.insuranceCompanyId, is_accepted: true })),
    'branch-working-hours': [],
  };
  const logs = [];
  const logger = { info(entry) { logs.push(entry); }, warn() {}, error() {} };
  const runtime = createRuntime({
    semanticMode: conversationEnabled ? 'ACTIVE' : 'SHADOW',
    clinicService: { async resolveWhatsAppClinic() { return f.catalog.clinic; } },
    conversationService: {
      async findOrCreateForChannel({ channelIdentity }) { return { id: channelIdentity, botEnabled: true }; },
      loadState: conversations.loadState.bind(conversations),
      updateState: conversations.updateState.bind(conversations),
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
    async sendMessage(message) { logs.push({ event: 'TEST_SEND' }); sent.push(message); return { messageId: `out-${sent.length}` }; },
    logger,
    conversationEnabled,
    conversationProvider: { async complete() { throw new Error('Price flow must not enter conversational owner'); } },
    semanticProvider: { async completeJson() { return { result: semanticResult || { status: 'UNKNOWN' } }; } },
  });
  let completion;
  const controller = new Controller({ processMessage(raw) {
    completion = runtime.processMessage(raw);
    return completion;
  } }, { logger });
  let number = 0;
  return { ...f, states, sent, logs, writes, reads, async send(text, sender = '966500000011') {
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
    assert.equal(next.state.data.shaden.priceInquiry.status, 'awaiting_insuranceClass');
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

test('real controller replaces legacy cash quote with current catalog insurer before lookup', async () => {
  const h = harness();
  const [service] = h.catalog.services;
  const company = h.catalog.insuranceCompanies[1];
  const cash = h.catalog.paymentMethods.find((item) => item.code === 'cash');
  const sender = '966500000077';
  h.states.set(`+${sender}`, { data: { shaden: { priceInquiry: {
    intent: 'price_inquiry', state: 'awaiting_price_booking_confirmation',
    selected_service_id: service.id, selected_service_name: service.name,
    selected_payment_method: cash.code, selected_payment_method_id: cash.id,
    resolved_cash_price: '500', amount: 500, currency: 'SAR', quoteCompleted: true,
  } } } });

  const result = await h.send(`سعر ${service.name} ${company.name}`, sender);
  const state = result.state.data.shaden.priceInquiry;
  assert.equal(state.selected_payment_method, 'insurance');
  assert.equal(state.selected_insurance_company_id, company.id);
  assert.equal(state.resolved_cash_price, null);
  assert.equal(state.quoteCompleted, false);
  assert.equal(h.calls.length, 0, 'class must be selected before any price lookup');
  assert.doesNotMatch(result.replyText, /كاش|500/);
  const transition = h.logs.find((entry) => entry.event === 'SHADEN_PRICE_STATE_TRANSITION');
  assert.equal(transition.action, 'ASK_INSURANCE_CLASS');
  assert.equal(transition.currentGroundedSlots.insuranceCompanyId, company.id);
  assert.equal(transition.afterState.slots.insuranceCompanyId, company.id);
});

test('controller persists insurer scope then quotes its dynamically selected class', async () => {
  const h = harness();
  const service = h.catalog.services[0];
  const company = h.catalog.insuranceCompanies[1];
  const insurance = h.catalog.paymentMethods.find((item) => item.code === 'insurance');
  const insuranceClass = h.catalog.insuranceClasses.find((item) => item.insuranceCompanyId === company.id);
  const first = await h.send(`سعر ${service.name} ${company.name}`);
  const pending = first.state.data.shaden.priceInquiry;
  const stored = h.writes.at(-1).data.shaden.priceInquiry;
  assert.equal(stored.paymentMethod, 'insurance');
  assert.equal(stored.status, 'awaiting_insuranceClass');
  assert.equal(stored.pendingSlot, 'insuranceClass');
  assert.equal(stored.insuranceCompanyId, company.id);
  assert.equal(stored.serviceId, service.id);
  assert.equal(Object.hasOwn(stored, 'insuranceCompany'), false);
  assert.equal(pending.selected_payment_method, insurance.code);
  assert.equal(pending.selected_insurance_company_id, company.id);
  assert.equal(pending.state, 'awaiting_price_insurance_class');
  assert.equal(pending.pendingSlot, 'insuranceClass');
  const second = await h.send(insuranceClass.name);
  const quoted = second.state.data.shaden.priceInquiry;
  assert.deepEqual(h.reads.at(-1).data.shaden.priceInquiry, stored);
  assert.equal(h.writes.at(-1).data.shaden.priceInquiry.insuranceClassId, insuranceClass.id);
  assert.equal(quoted.selected_service_id, service.id);
  assert.equal(quoted.selected_insurance_company_id, company.id);
  assert.equal(quoted.selected_insurance_class_id, insuranceClass.id);
  assert.equal(h.calls.at(-1).insuranceClassId, insuranceClass.id);
  const transition = h.logs.filter((entry) => entry.event === 'SHADEN_PRICE_STATE_TRANSITION').at(-1);
  assert.equal(transition.action, 'QUOTE_INSURANCE_PRICE');
  assert.doesNotMatch(second.replyText, /كاش|هل الدفع/);
});
