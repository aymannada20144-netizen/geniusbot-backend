'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');
const GroqSemanticModelClient = require(
  '../../src/services/shaden/GroqSemanticModelClient'
);
const SemanticUnderstandingProvider = require(
  '../../src/services/shaden/SemanticUnderstandingProvider'
);

const ID = Object.freeze({
  clinic: 'clinic-1',
  conversation: 'conversation-1',
  laserSpecialty: 'specialty-laser',
  dermatologySpecialty: 'specialty-dermatology',
  cosmeticSpecialty: 'specialty-cosmetic',
  hairRemoval: 'service-hair-removal',
  pigmentationLaser: 'service-pigmentation-laser',
  skinCleaning: 'service-skin-cleaning',
  consultation: 'service-consultation',
  acneTreatment: 'service-acne-treatment',
  filler: 'service-filler',
  hamdaniya: 'branch-hamdaniya',
  salihiya: 'branch-salihiya',
});

const PRIMARY_MESSAGE = 'ما خدمات الليزر فى فرع الحمدانية';
const GATE_SCENARIOS = Object.freeze([
  PRIMARY_MESSAGE,
  'ما خدمات الليزر',
  'ما خدمات الليزر فى فرع الصالحية',
  'ما الخدمات المتوفرة في الصالحية',
  'ما فروعكم',
  'ما خدمات الجلدية',
  'ما خدمات الجلدية فى الحمدانية',
  'ما خدمات الجلدية فى الصالحية',
  'خدمات الفيلر',
  'هل تقدمون تنظيف البشرة',
  'هل تقدمون استشارة جلدية',
  'ما خدمات العلاج الكريستالي',
]);

test('repairs the production compound factual path from raw WhatsApp text', async () => {
  const harness = createHarness();
  const result = await harness.send(PRIMARY_MESSAGE);

  assert.equal(harness.modelCalls(), 1);
  assert.equal(harness.modelRequests()[0].response_format.type, 'json_schema');
  assert.equal(harness.modelRequests()[0].response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(harness.modelRequests()[0].messages[1].content), {
    text: PRIMARY_MESSAGE,
  });

  assert.equal(harness.catalogCalls('specialties') > 0, true);
  assert.equal(harness.catalogCalls('services') > 0, true);
  assert.equal(harness.catalogCalls('branches') > 0, true);
  assert.equal(result.factualProvenance.owner, 'authoritative_domain');
  assert.equal(result.factualProvenance.source, 'ClinicDomainQuery');
  assert.equal(result.factualProvenance.policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(result.factualProvenance.outcome, 'MATCHES');
  assert.equal(result.factualProvenance.resolution.specialty.status, 'RESOLVED');
  assert.equal(result.factualProvenance.resolution.branch.status, 'RESOLVED');
  assert.equal(result.factualProvenance.constraints.specialtyId, ID.laserSpecialty);
  assert.equal(result.factualProvenance.constraints.serviceId, null);
  assert.equal(result.factualProvenance.constraints.branchId, ID.hamdaniya);
  assert.equal(result.factualProvenance.resultCount.services, 1);
  assert.equal(harness.domainQueryCalls() > 0, true);
  assert.match(result.replyText, /إزالة الشعر بالليزر/u);
  assert.doesNotMatch(result.replyText, /لم أفهم طلبك بالكامل/u);
});

test('records current outcomes for the future CF-01 production gates', async (t) => {
  const observed = [];
  for (const message of GATE_SCENARIOS) {
    await t.test(message, async () => {
      const harness = createHarness();
      const result = await harness.send(message);
      observed.push({
        message,
        policyDecision: result.factualProvenance?.policyDecision || null,
        outcome: result.factualProvenance?.outcome || null,
        domainQueryCalls: harness.domainQueryCalls(),
        replyText: result.replyText,
      });
      assert.equal(harness.modelCalls(), 1);
    });
  }

  const byMessage = new Map(observed.map((item) => [item.message, item]));
  assert.equal(byMessage.get(PRIMARY_MESSAGE).policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(byMessage.get('ما خدمات الليزر').policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(
    byMessage.get('ما خدمات الليزر فى فرع الصالحية').policyDecision,
    'ROUTE_TO_DOMAIN_QUERY'
  );
  assert.equal(
    byMessage.get('ما الخدمات المتوفرة في الصالحية').policyDecision,
    'ROUTE_TO_DOMAIN_QUERY'
  );
  assert.equal(byMessage.get('ما فروعكم').policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(byMessage.get('ما خدمات الجلدية').policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(
    byMessage.get('ما خدمات الجلدية فى الحمدانية').policyDecision,
    'ROUTE_TO_DOMAIN_QUERY'
  );
  assert.equal(
    byMessage.get('ما خدمات الجلدية فى الصالحية').policyDecision,
    'ROUTE_TO_DOMAIN_QUERY'
  );
  assert.equal(byMessage.get('خدمات الفيلر').policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(byMessage.get('هل تقدمون تنظيف البشرة').policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(byMessage.get('هل تقدمون استشارة جلدية').policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(byMessage.get('ما خدمات العلاج الكريستالي').policyDecision, 'CLARIFY');
  assert.match(byMessage.get('ما خدمات الليزر').replyText, /إزالة الشعر بالليزر/u);
  assert.match(byMessage.get('ما خدمات الليزر').replyText, /ليزر التصبغات/u);
  assert.match(
    byMessage.get('ما خدمات الليزر فى فرع الصالحية').replyText,
    /إزالة الشعر بالليزر/u
  );
  assert.match(
    byMessage.get('ما خدمات الليزر فى فرع الصالحية').replyText,
    /ليزر التصبغات/u
  );
  assert.match(
    byMessage.get('ما الخدمات المتوفرة في الصالحية').replyText,
    /ليزر التصبغات/u
  );
  assert.match(byMessage.get('هل تقدمون تنظيف البشرة').replyText, /تنظيف البشرة/u);
  assert.equal(byMessage.get('ما خدمات الجلدية فى الحمدانية').outcome, 'ZERO_MATCHES');
  assert.equal(byMessage.get('ما خدمات الجلدية فى الصالحية').outcome, 'MATCHES');
  assert.match(
    byMessage.get('ما خدمات الجلدية فى الصالحية').replyText,
    /استشارة جلدية/u
  );
  assert.match(byMessage.get('خدمات الفيلر').replyText, /فيلر/u);
  assert.match(byMessage.get('هل تقدمون استشارة جلدية').replyText, /استشارة جلدية/u);
});

test('dermatology branch queries keep specialty scope without child alias promotion', async (t) => {
  for (const [message, branchId, outcome] of [
    ['ما خدمات الجلدية فى الحمدانية', ID.hamdaniya, 'ZERO_MATCHES'],
    ['ما خدمات الجلدية فى الصالحية', ID.salihiya, 'MATCHES'],
  ]) {
    await t.test(message, async () => {
      const harness = createHarness();
      const result = await harness.send(message);
      assert.equal(result.factualProvenance.policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
      assert.equal(result.factualProvenance.outcome, outcome);
      assert.equal(
        result.factualProvenance.constraints.specialtyId,
        ID.dermatologySpecialty
      );
      assert.equal(result.factualProvenance.constraints.serviceId, null);
      assert.equal(result.factualProvenance.constraints.branchId, branchId);
    });
  }
});

test('catalog grounding survives semantic transport failure', async () => {
  const harness = createHarness({ semanticFailure: true });
  const result = await harness.send(PRIMARY_MESSAGE);
  assert.equal(harness.modelCalls(), 1);
  assert.equal(result.factualProvenance.policyDecision, 'ROUTE_TO_DOMAIN_QUERY');
  assert.equal(result.factualProvenance.outcome, 'MATCHES');
  assert.equal(result.factualProvenance.constraints.specialtyId, ID.laserSpecialty);
  assert.equal(result.factualProvenance.constraints.branchId, ID.hamdaniya);
  assert.equal(result.factualProvenance.constraints.serviceId, null);
  assert.match(result.replyText, /إزالة الشعر بالليزر/u);
});

function createHarness({ semanticFailure = false } = {}) {
  const resources = canonicalResources();
  const modelRequests = [];
  const catalogCallCounts = new Map();
  let domainQueryCalls = 0;
  let messageNumber = 0;
  let storedState = { current: null, data: {} };

  const groqTransport = {
    chat: {
      completions: {
        async create(request) {
          modelRequests.push(clone(request));
          if (semanticFailure) throw new Error('SIMULATED_SEMANTIC_TRANSPORT_FAILURE');
          const text = JSON.parse(request.messages[1].content).text;
          return {
            choices: [{ message: { content: JSON.stringify(semanticFixture(text)) } }],
          };
        },
      },
    },
  };
  const semanticUnderstandingProvider = new SemanticUnderstandingProvider({
    modelClient: new GroqSemanticModelClient({
      client: groqTransport,
      model: 'openai/gpt-oss-20b',
    }),
  });
  const runtime = createShadenEngine({
    clinicService: {
      async resolveWhatsAppClinic() {
        return { id: ID.clinic, name: 'Oryan Clinic', display_name_ar: 'عيادات أوريان' };
      },
    },
    conversationService: {
      async findOrCreateForChannel() {
        return { id: ID.conversation, patientId: null, botEnabled: true };
      },
      async loadState() { return clone(storedState); },
      async updateState(_id, state) { storedState = clone(state); },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() {},
      async saveOutgoingMessage() {},
    },
    catalogService: {
      async list(resource) {
        catalogCallCounts.set(resource, (catalogCallCounts.get(resource) || 0) + 1);
        return clone(resources[resource] || []);
      },
    },
    serviceRepository: {
      async findBookableByClinicId() {
        domainQueryCalls += 1;
        return clone(resources.services);
      },
    },
    branchRepository: {
      async findActiveByClinicId() {
        domainQueryCalls += 1;
        return clone(resources.branches);
      },
    },
    serviceAssignmentRepository: {
      async listActiveDomainAssignments() {
        domainQueryCalls += 1;
        return clone(resources.assignments);
      },
      async listActiveServiceBranchPairs() { return clone(resources.assignments); },
    },
    clinicConfigurationSource: { async get() { return {}; } },
    semanticUnderstandingProvider,
    async sendMessage() { return { messageId: `out-${messageNumber}` }; },
  });

  return {
    modelCalls: () => modelRequests.length,
    modelRequests: () => clone(modelRequests),
    catalogCalls: (resource) => catalogCallCounts.get(resource) || 0,
    domainQueryCalls: () => domainQueryCalls,
    async send(text) {
      return runtime.processMessage({
        channel: 'whatsapp',
        waMessageId: `in-${++messageNumber}`,
        senderPhone: '+966500000001',
        receiverPhone: '+966500000002',
        messageType: 'text',
        text,
        rawPayload: {},
      });
    },
  };
}

function semanticFixture(text) {
  const primaryIntent = text === 'ما فروعكم' ? 'branches' : 'services';
  const branch = text.includes('الحمدانية')
    ? { text: 'الحمدانية', concept: 'فرع الحمدانية' }
    : text.includes('الصالحية') && text !== 'ما الخدمات المتوفرة في الصالحية'
      ? { text: 'الصالحية', concept: 'فرع الصالحية' }
      : null;
  return {
    version: 1,
    conversationAct: 'question',
    primaryIntent,
    secondaryIntents: [],
    knowledgeTopic: null,
    entities: {
      serviceMentions: [],
      branchMentions: branch
        ? [{ ...branch, role: 'requested', confidence: 0.95 }]
        : [],
      providerMentions: [],
      dateTimeMentions: [],
      bookingReference: null,
      appointmentManagementTarget: 'unspecified',
      corrections: [],
    },
    signals: Object.fromEntries([
      'confirmation', 'rejection', 'correction', 'interruption', 'conditional',
      'hesitation', 'objection', 'complaint', 'medicalQuestion', 'medicalRisk',
      'humanHandover', 'legalEscalation', 'botFrustration', 'abuseOrThreat',
    ].map((name) => [name, false])),
    sentiment: 'neutral',
    confidence: text === PRIMARY_MESSAGE ? 0.9 : 0.95,
    ambiguity: {
      requiresClarification: false,
      reason: 'none',
      candidateIntents: [],
      ambiguousEntityTypes: [],
    },
  };
}

function canonicalResources() {
  const active = (id, name, extra = {}) => ({ id, name, is_active: true, ...extra });
  return {
    specialties: [
      active(ID.laserSpecialty, 'ليزر'),
      active(ID.dermatologySpecialty, 'الجلدية'),
      active(ID.cosmeticSpecialty, 'تجميل'),
    ],
    services: [
      active(ID.hairRemoval, 'إزالة الشعر بالليزر', {
        aliases: ['خدمات الليزر الطبية والتجميلية'],
        specialty_id: ID.laserSpecialty,
        is_booking_enabled: true,
      }),
      active(ID.pigmentationLaser, 'ليزر التصبغات', {
        aliases: ['خدمات الليزر الطبية والتجميلية'],
        specialty_id: ID.laserSpecialty,
        is_booking_enabled: true,
      }),
      active(ID.skinCleaning, 'تنظيف البشرة', {
        aliases: [], specialty_id: null,
        is_booking_enabled: true,
      }),
      active(ID.consultation, 'استشارة جلدية', {
        aliases: ['كشف', 'استشارة', 'جلدية'],
        specialty_id: ID.dermatologySpecialty,
        is_booking_enabled: true,
      }),
      active(ID.acneTreatment, 'علاج حب الشباب', {
        aliases: [], specialty_id: ID.dermatologySpecialty,
        is_booking_enabled: true,
      }),
      active(ID.filler, 'فيلر', {
        aliases: ['الإجراءات التجميلية غير الجراحية'],
        specialty_id: ID.cosmeticSpecialty,
        is_booking_enabled: true,
      }),
    ],
    branches: [
      active(ID.hamdaniya, 'فرع الحمدانية', { city: 'جدة' }),
      active(ID.salihiya, 'فرع الصالحية', { city: 'جدة' }),
    ],
    assignments: [
      { service_id: ID.hairRemoval, branch_id: ID.hamdaniya },
      { service_id: ID.hairRemoval, branch_id: ID.salihiya },
      { service_id: ID.pigmentationLaser, branch_id: ID.salihiya },
      { service_id: ID.skinCleaning, branch_id: ID.hamdaniya },
      { service_id: ID.consultation, branch_id: ID.salihiya },
      { service_id: ID.acneTreatment, branch_id: ID.salihiya },
      { service_id: ID.filler, branch_id: ID.hamdaniya },
    ],
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
