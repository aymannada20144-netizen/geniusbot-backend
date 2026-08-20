'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

const ID = Object.freeze({
  clinic: 'clinic-1', conversation: 'conversation-1',
  laser: 'service-laser', botox: 'service-botox',
  hamdaniya: 'branch-hamdaniya', salihiya: 'branch-salihiya',
  rawdah: 'branch-rawdah',
});
const SERVICES = Object.freeze([
  { id: ID.laser, name: 'إزالة الشعر بالليزر', aliases: ['خدمات الليزر الطبية والتجميلية'], is_active: true, is_booking_enabled: true },
  { id: ID.botox, name: 'حقن البوتوكس', aliases: ['البوتوكس'], is_active: true, is_booking_enabled: true },
]);
const BRANCHES = Object.freeze([
  { id: ID.hamdaniya, name: 'فرع الحمدانية', city: 'جدة', is_active: true },
  { id: ID.salihiya, name: 'فرع الصالحية', city: 'جدة', is_active: true },
  { id: ID.rawdah, name: 'فرع الروضة', city: 'جدة', is_active: true },
]);

test('migrated factual ownership routes complete canonical constraints', async (t) => {
  for (const gate of [
    gateCase('ما خدمات إزالة الشعر بالليزر', 'إزالة الشعر بالليزر', null, ID.laser, null),
    gateCase('ما خدمات إزالة الشعر بالليزر فى فرع الحمدانية', 'إزالة الشعر بالليزر', 'فرع الحمدانية', ID.laser, ID.hamdaniya),
    gateCase('ما خدمات إزالة الشعر بالليزر فى فرع الصالحية', 'إزالة الشعر بالليزر', 'فرع الصالحية', ID.laser, ID.salihiya),
    gateCase('ما خدمات البوتوكس فى فرع الروضة', 'حقن البوتوكس', 'فرع الروضة', ID.botox, ID.rawdah),
  ]) {
    await t.test(gate.text, async () => {
      const harness = createHarness({ gate });
      const result = await harness.send(gate.text);
      assert.equal(result.factualProvenance.owner, 'authoritative_domain');
      assert.equal(result.factualProvenance.source, 'ClinicDomainQuery');
      assert.equal(result.factualProvenance.policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
      assert.equal(result.factualProvenance.outcome, 'MATCHES');
      assert.equal(result.factualProvenance.constraints.serviceId, gate.serviceId);
      assert.equal(result.factualProvenance.constraints.branchId, gate.branchId);
      assert.equal(result.factualProvenance.resolution.service.status, 'RESOLVED');
      if (gate.branchId) assert.equal(result.factualProvenance.resolution.branch.status, 'RESOLVED');
      assert.equal(harness.queryCalls() > 0, true);
      assert.doesNotMatch(result.replyText, /LEGACY_SENTINEL/u);
    });
  }
});

test('unresolved relevant branch clarifies without query, broadening, or legacy fallback', async () => {
  const gate = gateCase('ما خدمات إزالة الشعر بالليزر فى فرع غير موجود', 'إزالة الشعر بالليزر', 'فرع غير موجود', ID.laser, null);
  const harness = createHarness({ gate });
  const result = await harness.send(gate.text);
  assert.equal(result.factualProvenance.owner, 'authoritative_domain');
  assert.equal(result.factualProvenance.source, 'FactualQueryPolicy');
  assert.equal(result.factualProvenance.policyDecision, 'CLARIFY');
  assert.equal(result.factualProvenance.outcome, 'CLARIFY');
  assert.deepEqual(result.factualProvenance.relevantConstraints, ['service', 'branch']);
  assert.equal(result.factualProvenance.resolution.branch.status, 'UNRESOLVED');
  assert.equal(harness.queryCalls(), 0);
  assert.doesNotMatch(result.replyText, /LEGACY_SENTINEL|إزالة الشعر بالليزر/u);
});

test('zero relationship remains an authoritative domain outcome', async () => {
  const gate = gateCase('ما خدمات إزالة الشعر بالليزر فى فرع الحمدانية', 'إزالة الشعر بالليزر', 'فرع الحمدانية', ID.laser, ID.hamdaniya);
  const harness = createHarness({ gate, assignments: [] });
  const result = await harness.send(gate.text);
  assert.equal(result.factualProvenance.owner, 'authoritative_domain');
  assert.equal(result.factualProvenance.source, 'ClinicDomainQuery');
  assert.equal(result.factualProvenance.outcome, 'ZERO_MATCHES');
  assert.equal(result.factualProvenance.policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(harness.queryCalls() > 0, true);
  assert.match(result.replyText, /الخدمة المختارة غير متاحة/u);
  assert.doesNotMatch(result.replyText, /LEGACY_SENTINEL|موعد/u);
});

test('query errors remain authoritative and safe', async () => {
  const gate = gateCase('ما خدمات إزالة الشعر بالليزر فى فرع الحمدانية', 'إزالة الشعر بالليزر', 'فرع الحمدانية', ID.laser, ID.hamdaniya);
  const harness = createHarness({ gate, queryError: new Error('PRIVATE DATABASE FAILURE') });
  const result = await harness.send(gate.text);
  assert.equal(result.factualProvenance.owner, 'authoritative_domain');
  assert.equal(result.factualProvenance.source, 'ClinicDomainQuery');
  assert.equal(result.factualProvenance.outcome, 'ERROR');
  assert.equal(result.factualProvenance.policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(harness.queryCalls() > 0, true);
  assert.doesNotMatch(result.replyText, /PRIVATE DATABASE FAILURE|LEGACY_SENTINEL/u);
});

test('an explicitly unmigrated factual capability retains legacy ownership', async () => {
  const harness = createHarness({
    gate: { text: 'ما طرق الدفع', target: 'payment_methods', proposals: {} },
  });
  const result = await harness.send('ما طرق الدفع');
  assert.equal(result.factualProvenance, null);
  assert.equal(harness.queryCalls(), 0);
  assert.match(result.replyText, /LEGACY_PAYMENT/u);
});

function gateCase(text, serviceText, branchText, serviceId, branchId) {
  return {
    text, target: 'services', serviceId, branchId,
    proposals: {
      specialtyText: branchText ? `stale malformed ${branchText}` : 'stale laser specialty',
      serviceText,
      ...(branchText ? { branchText } : {}),
    },
  };
}

function createHarness({ gate, assignments = null, queryError = null }) {
  let repositoryCalls = 0;
  const domainAssignments = assignments ?? [
    { service_id: ID.laser, branch_id: ID.hamdaniya },
    { service_id: ID.laser, branch_id: ID.salihiya },
    { service_id: ID.botox, branch_id: ID.rawdah },
  ];
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: ID.clinic, name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() { return { id: ID.conversation, patientId: null, botEnabled: true }; },
      async loadState() { return null; }, async updateState() {},
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; }, async saveIncomingMessage() {}, async saveOutgoingMessage() {},
    },
    catalogService: {
      async list(resource) {
        if (resource === 'services') return [...SERVICES, { id: 'legacy', name: 'LEGACY_SENTINEL', is_active: true }];
        if (resource === 'branches') return [...BRANCHES];
        if (resource === 'payment-methods') return [{ id: 'legacy-payment', name: 'LEGACY_PAYMENT', is_active: true }];
        return [];
      },
    },
    clinicConfigurationSource: { async get() { return {}; } },
    serviceRepository: {
      async findBookableByClinicId() {
        repositoryCalls += 1;
        if (queryError) throw queryError;
        return [...SERVICES];
      },
    },
    branchRepository: {
      async findActiveByClinicId() { repositoryCalls += 1; return [...BRANCHES]; },
    },
    serviceAssignmentRepository: {
      async listActiveDomainAssignments() { repositoryCalls += 1; return domainAssignments; },
      async listActiveServiceBranchPairs() { return domainAssignments; },
    },
    conversationalIntelligenceOrchestrator: {
      async analyze() {
        return {
          understanding: {
            primaryIntent: gate.target, conversationAct: 'question',
            entities: { ...gate.proposals },
          },
          decision: {
            targetIntent: gate.target,
            proposedDomainConstraints: { ...gate.proposals },
          },
        };
      },
    },
    async sendMessage() { return { messageId: 'out-1' }; },
  });
  return {
    queryCalls: () => repositoryCalls,
    send: (text) => runtime.processMessage({
      channel: 'whatsapp', waMessageId: `in-${text}`, senderPhone: '+966501234567',
      receiverPhone: '+966500000002', metaPhoneNumberId: '123',
      messageType: 'text', text, rawPayload: {},
    }),
  };
}
