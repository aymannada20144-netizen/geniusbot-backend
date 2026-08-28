'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SemanticCatalogSlice = require('../../src/services/shaden/semanticCatalog/SemanticCatalogSlice');
const SemanticCatalogProvider = require('../../src/services/shaden/semanticCatalog/SemanticCatalogProvider');
const { groundReference } = require('../../src/services/shaden/semanticCatalog/AuthoritativeCatalogGrounder');
const { validateSemanticCatalogMeaning } = require('../../src/services/shaden/semanticCatalog/SemanticCatalogContract');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

const service = { id: 'service-1', name: 'خدمة ألف', aliases: ['الخدمة الرسمية'], description: 'عناية موثقة', specialtyId: 'specialty-1' };
const specialty = { id: 'specialty-1', name: 'تخصص ألف', description: 'عناية موثقة' };
const branch = { id: 'branch-1', name: 'فرع ألف', city: 'مدينة ألف', address: 'عنوان ألف' };
const catalog = {
  services: [service], specialties: [specialty], branches: [branch],
  serviceBranchAssignments: [{ serviceId: service.id, branchId: branch.id }],
};

test('production contract is exact, minimal, and non-authoritative', () => {
  assert.deepEqual(validateSemanticCatalogMeaning({
    answerNeeded: true,
    references: [reference('CATALOG_REFERENCE', 'شيء')],
  }), { valid: true, errors: [] });
  assert.equal(validateSemanticCatalogMeaning({ answerNeeded: true, references: [], intent: 'inquiry' }).valid, false);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true,
    references: [{ ...reference('CATALOG_REFERENCE', 'شيء'), authoritative: true }],
  }).valid, false);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true,
    references: [needReference('ACNE_SCARRING', 'آثار حب الشباب')],
  }).valid, true);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true,
    references: [{ ...needReference('ACNE_SCARRING', 'آثار حب الشباب'), interpretedMeaning: 'acne scars' }],
  }).valid, false);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true,
    references: [needReference('UNBOUNDED', 'شيء')],
  }).valid, false);
});

test('location indexes must exist, target LOCATION_REFERENCE, and remain null on locations', () => {
  const valid = { answerNeeded: true, references: [
    reference('CATALOG_REFERENCE', 'خدمة', 1), reference('LOCATION_REFERENCE', 'موقع'),
  ] };
  assert.equal(validateSemanticCatalogMeaning(valid).valid, true);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true, references: [reference('CATALOG_REFERENCE', 'خدمة', 3)],
  }).valid, false);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true, references: [
      reference('CATALOG_REFERENCE', 'خدمة', 1), reference('CATALOG_REFERENCE', 'موقع'),
    ],
  }).valid, false);
  assert.equal(validateSemanticCatalogMeaning({
    answerNeeded: true, references: [reference('LOCATION_REFERENCE', 'موقع', 0)],
  }).valid, false);
});

test('provider makes one structured call with pinned model and no retries or repair', async () => {
  const requests = [];
  const provider = new SemanticCatalogProvider({ client: {
    chat: { completions: { async create(request) {
      requests.push(request);
      return {
        choices: [{ message: { content: JSON.stringify({ answerNeeded: false, references: [] }) }, finish_reason: 'stop' }],
        usage: { total_tokens: 10 },
      };
    } } },
  } });
  const result = await provider.understand('رسالة اختبار محلية');
  assert.equal(result.status, 'OK');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'openai/gpt-oss-20b');
  assert.equal(requests[0].response_format.type, 'json_schema');
});

test('groundable service with answerNeeded=false is not owned', async () => {
  const slice = sliceReturning({ answerNeeded: false, references: [reference('CATALOG_REFERENCE', service.name)] });
  const result = await slice.evaluate(input(catalog));
  assert.equal(result.ownership, 'NOT_OWNED');
  assert.deepEqual(result.grounding, []);
});

test('groundable branch with answerNeeded=false is not owned', async () => {
  const slice = sliceReturning({ answerNeeded: false, references: [reference('LOCATION_REFERENCE', branch.name)] });
  const result = await slice.evaluate(input(catalog));
  assert.equal(result.ownership, 'NOT_OWNED');
  assert.deepEqual(result.grounding, []);
});

test('ambiguous grounding never selects an arbitrary service identity', () => {
  const result = groundReference(reference('CATALOG_REFERENCE', 'عناية موثقة'), {
    ...catalog,
    services: [service, { ...service, id: 'service-2', name: 'خدمة باء' }],
  });
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.resolution, null);
  assert.equal(result.candidates.length >= 2, true);
});

test('exact specialty identity is not polluted by member-service classification metadata', () => {
  const result = groundReference(reference('CATALOG_REFERENCE', specialty.name), {
    ...catalog,
    services: [
      { ...service, specialtyName: specialty.name, specialtyDescription: specialty.description },
      { ...service, id: 'service-2', name: 'خدمة باء', specialtyName: specialty.name },
    ],
  });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.resolution.entityType, 'SPECIALTY');
  assert.equal(result.resolution.authoritativeEntityId, specialty.id);
  assert.equal(result.candidates.length, 1);
});

test('legitimate direct service identity remains resolved', () => {
  const result = groundReference(reference('CATALOG_REFERENCE', service.name), catalog);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.resolution.entityType, 'SERVICE');
  assert.equal(result.resolution.evidenceStrength, 'DIRECT_IDENTITY');
});

test('general Arabic definite-article normalization preserves class-level identity', () => {
  const classSpecialty = { id: 'specialty-class', name: 'عناية', description: null };
  const classCatalog = {
    services: [
      { ...service, aliases: ['خدمات العناية المتقدمة'], specialtyId: classSpecialty.id },
      { ...service, id: 'service-2', name: 'خدمة باء', aliases: ['خدمات العناية المتخصصة'], specialtyId: classSpecialty.id },
    ],
    specialties: [classSpecialty], branches: [], serviceBranchAssignments: [],
  };
  const result = groundReference({
    ...reference('CATALOG_REFERENCE', 'خدمات العناية'),
    interpretedMeaning: 'care services',
  }, classCatalog);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.resolution.entityType, 'SPECIALTY');
  assert.equal(result.resolution.normalizationMethod, 'ARABIC_DEFINITE_ARTICLE_EQUIVALENCE');
  assert.equal(result.selection.discardedWeakerCandidateCount, 2);
});

test('surface and interpreted meaning contribute independently by evidence strength', () => {
  const surfaceWins = groundReference({
    ...reference('CATALOG_REFERENCE', service.name),
    interpretedMeaning: 'unmatched translation',
  }, catalog);
  assert.equal(surfaceWins.status, 'RESOLVED');
  assert.equal(surfaceWins.resolution.inputSource, 'surface');

  const interpretationWorks = groundReference({
    ...reference('CATALOG_REFERENCE', 'unmatched surface'),
    interpretedMeaning: service.name,
  }, catalog);
  assert.equal(interpretationWorks.status, 'RESOLVED');
  assert.equal(interpretationWorks.resolution.inputSource, 'interpretedMeaning');
});

test('equal-strength contradictory direct identities remain genuinely ambiguous', () => {
  const result = groundReference({
    ...reference('CATALOG_REFERENCE', service.name),
    interpretedMeaning: specialty.name,
  }, catalog);
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.resolution, null);
  assert.deepEqual(result.candidates.map((item) => item.entityType).sort(), ['SERVICE', 'SPECIALTY']);
});

test('not-found inquiry produces bounded clarification without catalog invention', async () => {
  const result = await sliceReturning({ answerNeeded: true, references: [reference('CATALOG_REFERENCE', 'مفهوم غير مسجل إطلاقًا')] })
    .evaluate(input(catalog));
  assert.equal(result.ownership, 'CLARIFICATION');
  assert.equal(result.authoritativeDomainResult.supported, false);
  assert.equal(result.finalResponseClassification, 'CATALOG_NOT_FOUND_CLARIFICATION');
});

test('provider failure is not owned and cannot authorize an operation', async () => {
  const slice = new SemanticCatalogSlice({ provider: { async understand() {
    return { status: 'FAILED', meaning: null, telemetry: { callCount: 1 } };
  } } });
  const result = await slice.evaluate(input(catalog));
  assert.equal(result.ownership, 'NOT_OWNED');
  assert.equal(result.finalResponseClassification, 'PROVIDER_FAILURE_BASELINE_FALLBACK');
});

test('active operational state and trusted input prevent provider invocation', async () => {
  let calls = 0;
  const slice = new SemanticCatalogSlice({ provider: { async understand() { calls += 1; } } });
  const active = await slice.evaluate(input(catalog, { currentState: { version: 1, booking: { step: 'service' } } }));
  const trusted = await slice.evaluate(input(catalog, { message: {
    text: 'اختيار', inputProvenance: { trusted: true, source: 'meta_whatsapp' },
  } }));
  assert.equal(active.reason, 'ACTIVE_DETERMINISTIC_STATE');
  assert.equal(trusted.reason, 'TRUSTED_INTERACTIVE');
  assert.equal(calls, 0);
});

test('service and branch truth comes only from active assignment pairs', async () => {
  const meaning = { answerNeeded: true, references: [
    reference('CATALOG_REFERENCE', service.name, 1),
    reference('LOCATION_REFERENCE', branch.name),
  ] };
  const present = await sliceReturning(meaning).evaluate(input(catalog));
  const absent = await sliceReturning(meaning).evaluate(input({ ...catalog, serviceBranchAssignments: [] }));
  assert.equal(present.finalResponseClassification, 'AUTHORITATIVE_RELATIONSHIP_PRESENT');
  assert.equal(absent.finalResponseClassification, 'AUTHORITATIVE_RELATIONSHIP_ABSENT');
  assert.equal(present.authoritativeDomainResult.qualifications[0].matchCardinality, 'ONE');
  assert.equal(absent.authoritativeDomainResult.qualifications[0].matchCardinality, 'ZERO');
  assert.equal(absent.authoritativeDomainResult.supported, false);
});

test('kind-specific dispatch prevents cross-domain identity grounding', () => {
  const collisionCatalog = {
    services: [{ ...service, name: 'اسم مشترك' }], specialties: [],
    branches: [{ ...branch, name: 'اسم مشترك' }], serviceBranchAssignments: [],
  };
  const catalogResult = groundReference(reference('CATALOG_REFERENCE', 'اسم مشترك'), collisionCatalog);
  const locationResult = groundReference(reference('LOCATION_REFERENCE', 'اسم مشترك'), collisionCatalog);
  assert.equal(catalogResult.status, 'RESOLVED');
  assert.equal(catalogResult.resolution.entityType, 'SERVICE');
  assert.equal(locationResult.status, 'RESOLVED');
  assert.equal(locationResult.resolution.entityType, 'BRANCH');
});

test('unsupported described need remains non-authoritative and bounded', async () => {
  const result = await sliceReturning({
    answerNeeded: true,
    references: [needReference('UNKNOWN', 'احتياج غير موثق')],
  }).evaluate(input(catalog));
  assert.equal(result.ownership, 'CLARIFICATION');
  assert.equal(result.finalResponseClassification, 'DESCRIBED_NEED_UNSUPPORTED');
  assert.equal(result.authoritativeDomainResult.supported, false);
});

test('described need uses Knowledge then validates its linked active service', async () => {
  const result = await new SemanticCatalogSlice({
    provider: providerReturning({
      answerNeeded: true,
      references: [needReference('ACNE_SCARRING', 'آثار حب الشباب')],
    }),
    knowledgeService: knowledgeReturning([
      { id: 'knowledge-1', serviceId: service.id },
    ]),
  }).evaluate(input(catalog, { clinicId: 'clinic-1' }));
  assert.equal(result.ownership, 'OWNED');
  assert.equal(result.grounding[0].status, 'RESOLVED');
  assert.equal(result.grounding[0].resolution.authoritativeEntityId, service.id);
  assert.equal(result.grounding[0].knowledge.candidateCount, 1);
});

test('Knowledge linked to an inactive or missing service remains unsupported', async () => {
  const result = await new SemanticCatalogSlice({
    provider: providerReturning({
      answerNeeded: true,
      references: [needReference('ACNE_SCARRING', 'آثار حب الشباب')],
    }),
    knowledgeService: knowledgeReturning([
      { id: 'knowledge-1', serviceId: 'inactive-service' },
    ]),
  }).evaluate(input(catalog, { clinicId: 'clinic-1' }));
  assert.equal(result.ownership, 'CLARIFICATION');
  assert.equal(result.grounding[0].status, 'NOT_FOUND');
  assert.equal(
    result.grounding[0].selection.reason,
    'LINKED_SERVICE_INACTIVE_OR_MISSING'
  );
});

test('described need with branch constraint uses active assignment pairs', async () => {
  const meaning = {
    answerNeeded: true,
    references: [
      needReference('ACNE_SCARRING', 'آثار حب الشباب', [], 1),
      reference('LOCATION_REFERENCE', branch.name),
    ],
  };
  const configured = () => new SemanticCatalogSlice({
    provider: providerReturning(meaning),
    knowledgeService: knowledgeReturning([
      { id: 'knowledge-1', serviceId: service.id },
    ]),
  });
  const present = await configured().evaluate(input(catalog, { clinicId: 'clinic-1' }));
  const absent = await configured().evaluate(input({
    ...catalog, serviceBranchAssignments: [],
  }, { clinicId: 'clinic-1' }));
  assert.equal(present.finalResponseClassification, 'AUTHORITATIVE_RELATIONSHIP_PRESENT');
  assert.equal(absent.finalResponseClassification, 'AUTHORITATIVE_RELATIONSHIP_ABSENT');
});

test('specialty at branch preserves multiple assigned services without arbitrary collapse', async () => {
  const secondService = { ...service, id: 'service-2', name: 'خدمة باء' };
  const expandedCatalog = {
    ...catalog,
    services: [service, secondService],
    serviceBranchAssignments: [service, secondService].map((item) => ({ serviceId: item.id, branchId: branch.id })),
  };
  const result = await sliceReturning({ answerNeeded: true, references: [
    reference('CATALOG_REFERENCE', specialty.name, 1),
    reference('LOCATION_REFERENCE', branch.name),
  ] }).evaluate(input(expandedCatalog));
  const qualification = result.authoritativeDomainResult.qualifications[0];
  assert.equal(qualification.subject.entityType, 'SPECIALTY');
  assert.equal(qualification.matchCardinality, 'MULTIPLE');
  assert.deepEqual(qualification.matchingServices.map((item) => item.id), ['service-1', 'service-2']);
});

test('feature flag off constructs baseline composition without Groq credentials', () => {
  assert.doesNotThrow(() => createShadenEngine({
    clinicRepository: {}, conversationRepository: {}, patientRepository: {},
    clinicService: {}, conversationService: {},
    patientService: { async resolveChannelIdentity() {} },
    messageRepository: {}, catalogService: { list() {} },
    clinicConfigurationSource: { get() {} }, sendMessage() {},
    semanticCatalogEnabled: false, semanticCatalogApiKey: null,
  }));
  const envSource = fs.readFileSync(path.join(__dirname, '../../src/config/env.js'), 'utf8');
  assert.match(envSource, /SHADEN_SEMANTIC_CATALOG_SLICE_ENABLED[\s\S]*=== 'true'/);
});

test('prompt contains no production black-box controls or business routing taxonomy', () => {
  const prompt = SemanticCatalogProvider.SYSTEM_PROMPT;
  for (const forbidden of ['intent', 'handler', 'route', 'bookingId', 'serviceId', 'branchId']) {
    assert.equal(prompt.includes(forbidden), false);
  }
});

test('enabled production runtime owns only a grounded catalog answer and emits one trace', async () => {
  let providerCalls = 0;
  let engineCalls = 0;
  const logs = [];
  const runtime = runtimeWith({
    state: { version: 1 }, logs,
    provider: { async understand() {
      providerCalls += 1;
      return {
        status: 'OK', meaning: { answerNeeded: true, references: [reference('CATALOG_REFERENCE', service.name)] },
        telemetry: { model: 'openai/gpt-oss-20b', latencyMs: 1, usage: null, failureStatus: null, callCount: 1 },
      };
    } },
    engine: { async handle() { engineCalls += 1; throw new Error('deterministic fallback must not run'); } },
  });
  const result = await runtime.processMessage(rawMessage());
  assert.match(result.replyText, /المسجل لدينا/);
  assert.equal(providerCalls, 1);
  assert.equal(engineCalls, 0);
  const trace = logs.find((entry) => entry.event === 'SHADEN_SEMANTIC_CATALOG_TRACE');
  assert.equal(trace.semanticEligibility, 'YES');
  assert.equal(trace.applicationOwnership, 'OWNED');
  assert.equal(trace.inbound.messageId, 'in-semantic-1');
  assert.equal(trace.grounding[0].kind, 'CATALOG_REFERENCE');
  assert.equal(trace.grounding[0].atLocationReferenceIndex, null);
  assert.equal(trace.grounding[0].candidates[0].evidenceStrength, 'DIRECT_IDENTITY');
  assert.equal(trace.grounding[0].candidates[0].inputSource, 'interpretedMeaning');
  assert.equal(trace.grounding[0].selection.strongestEvidenceTier, 0);
});

test('enabled runtime provider failure falls through to deterministic baseline', async () => {
  let engineCalls = 0;
  const runtime = runtimeWith({
    state: { version: 1 },
    provider: { async understand() { return {
      status: 'FAILED', meaning: null,
      telemetry: { model: 'openai/gpt-oss-20b', latencyMs: 1, usage: null, failureStatus: 'FAILED', callCount: 1 },
    }; } },
    engine: { async handle() {
      engineCalls += 1;
      return { reply: 'baseline', nextState: idleRuntimeState(), undeclaredLifecycleReason: 'legacy_undeclared' };
    } },
  });
  const result = await runtime.processMessage(rawMessage());
  assert.equal(result.replyText, 'baseline');
  assert.equal(engineCalls, 1);
});

test('enabled runtime wires described need Knowledge and emits bounded trace', async () => {
  const logs = [];
  const runtime = runtimeWith({
    state: { version: 1 },
    logs,
    provider: providerReturning({
      answerNeeded: true,
      references: [needReference('ACNE_SCARRING', 'آثار حب الشباب')],
    }),
    knowledgeService: knowledgeReturning([
      { id: 'knowledge-1', serviceId: service.id },
    ]),
    engine: { async handle() {
      throw new Error('validated Knowledge answer must own the response');
    } },
  });
  const result = await runtime.processMessage(rawMessage());
  assert.match(result.replyText, new RegExp(service.name));
  const trace = logs.find((entry) =>
    entry.event === 'SHADEN_SEMANTIC_CATALOG_TRACE'
  );
  assert.equal(trace.grounding[0].knowledge.status, 'found');
  assert.equal(trace.grounding[0].knowledge.candidateCount, 1);
  assert.deepEqual(trace.grounding[0].knowledge.linkedServiceIds, [service.id]);
  assert.equal(trace.grounding[0].status, 'RESOLVED');
  assert.equal(trace.applicationOwnership, 'OWNED');
});

function reference(kind, value, atLocationReferenceIndex = null) {
  return {
    kind, surface: value, interpretedMeaning: value,
    authoritative: false, atLocationReferenceIndex,
  };
}
function needReference(
  concept,
  surface,
  qualifiers = [],
  atLocationReferenceIndex = null
) {
  return {
    kind: 'DESCRIBED_NEED', surface, concept, qualifiers,
    authoritative: false, atLocationReferenceIndex,
  };
}
function sliceReturning(meaning) {
  return new SemanticCatalogSlice({ provider: { async understand() {
    return { status: 'OK', meaning, telemetry: { model: 'openai/gpt-oss-20b', callCount: 1 } };
  } } });
}
function providerReturning(meaning) {
  return { async understand() {
    return {
      status: 'OK', meaning,
      telemetry: { model: 'openai/gpt-oss-20b', callCount: 1 },
    };
  } };
}
function knowledgeReturning(references) {
  return { async retrieveDescribedNeed() {
    return {
      status: references.length ? 'found' : 'not_found',
      facts: references.map(() => 'clinic-authored fact'),
      references,
      warnings: [],
    };
  } };
}
function input(value, overrides = {}) {
  return {
    message: { text: 'unseen free text' }, currentState: { version: 1 },
    deterministicInquiry: { type: 'unknown' }, catalog: value, ...overrides,
  };
}
function runtimeWith({
  state, provider, engine, logs = [], knowledgeService = null,
}) {
  return createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() { return { id: 'conversation-1', patientId: null, botEnabled: true }; },
      async loadState() { return { data: { shaden: state } }; }, async updateState() {},
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; }, async saveIncomingMessage() {}, async saveOutgoingMessage() {},
    },
    catalogService: { async list(resource) {
      if (resource === 'services') return [{ ...service, is_active: true, specialty_id: service.specialtyId }];
      if (resource === 'specialties') return [{ ...specialty, is_active: true }];
      if (resource === 'branches') return [{ ...branch, is_active: true }];
      return [];
    } },
    serviceAssignmentRepository: { async listActiveServiceBranchPairs() {
      return [{ service_id: service.id, branch_id: branch.id }];
    } },
    clinicConfigurationSource: { async get() { return {}; } },
    shadenEngine: engine, semanticCatalogEnabled: true,
    semanticCatalogProvider: provider, knowledgeService,
    logger: { info(entry) { logs.push(entry); } },
    async sendMessage() { return { messageId: 'out-1' }; },
  });
}
function rawMessage() {
  return {
    channel: 'whatsapp', waMessageId: 'in-semantic-1',
    senderPhone: '+966500000001', receiverPhone: '+966500000002',
    messageType: 'text', text: 'unseen free text', rawPayload: {},
  };
}
function idleRuntimeState() {
  return { version: 1, mode: 'idle', step: null, customer: { name: null }, context: null, options: [] };
}
