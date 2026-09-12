'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');
const {
  explicitServiceOutOfCatalog,
} = require('../../src/services/shaden/OperationalServiceConstraint');
const { validateSemanticResult } = require('../../src/services/shaden/semanticV1/SemanticResultValidator');

const message = 'أقدر أحجز خدمة محددة؟';
const identity = { kind: 'SERVICE_OR_NEED', surface: 'خدمة محددة', source: 'CURRENT', referenceType: 'IDENTITY' };
const need = { ...identity, referenceType: 'NEED' };
const valid = { contractValid: true, result: { status: 'UNDERSTOOD' } };
const outOfCatalog = { decision: 'NOT_FOUND' };

test('derives only the narrow explicit out-of-catalog authority', () => {
  assert.deepEqual(explicitServiceOutOfCatalog({ semanticResult: valid, subject: identity, resolution: outOfCatalog }), {
    kind: 'EXPLICIT_SERVICE_OUT_OF_CATALOG', surface: 'خدمة محددة',
  });
  for (const value of [
    { subject: identity, resolution: { decision: 'RESOLVED' } },
    { subject: identity, resolution: { decision: 'AMBIGUOUS' } },
    { subject: need, resolution: outOfCatalog },
    { subject: { ...identity, referenceType: undefined }, resolution: outOfCatalog },
    { semanticResult: { contractValid: false, result: { status: 'UNDERSTOOD' } }, subject: identity, resolution: outOfCatalog },
    { semanticResult: valid, subject: identity, resolution: null },
  ]) {
    assert.equal(explicitServiceOutOfCatalog({ semanticResult: valid, ...value }), null);
  }
});

test('service reference classification is optional and malformed values are removed', () => {
  const absent = validateSemanticResult({
    status: 'UNDERSTOOD', goal: 'ASK', subjects: [{ kind: 'SERVICE_OR_NEED', surface: 'خدمة محددة', source: 'CURRENT' }], constraints: [],
  }, { currentMessage: message });
  assert.deepEqual(absent.subjects[0], {
    kind: 'SERVICE_OR_NEED', surface: 'خدمة محددة', source: 'CURRENT',
  });

  const malformed = validateSemanticResult({
    status: 'UNDERSTOOD', goal: 'ASK', subjects: [{ ...identity, referenceType: 'UNKNOWN' }], constraints: [],
  }, { currentMessage: message });
  assert.deepEqual(malformed.subjects[0], absent.subjects[0]);

  const classified = validateSemanticResult({
    status: 'UNDERSTOOD', goal: 'ASK', subjects: [identity], constraints: [],
  }, { currentMessage: message });
  assert.equal(classified.subjects[0].referenceType, 'IDENTITY');

  assert.throws(() => validateSemanticResult({
    status: 'UNDERSTOOD', goal: 'ASK', subjects: [{ ...identity, unexpected: true }], constraints: [],
  }, { currentMessage: message }));
});

test('idle and active booking preserve generic and negative authority boundaries', async () => {
  let bookingActions = 0;
  const engine = new ShadenEngine({
    bookingEngine: { async execute() { bookingActions += 1; } },
  });
  const idle = engine.handle({ message: { text: 'أبغى أحجز' }, currentState: state(), clinicData: data() });
  assert.ok(idle.nextState.booking);

  const rejected = engine.handle({
    message: { text: message }, currentState: state(), clinicData: data(),
    operationalServiceConstraint: { kind: 'EXPLICIT_SERVICE_OUT_OF_CATALOG', surface: 'خدمة محددة' },
  });
  assert.equal(rejected.nextState.booking, undefined);
  assert.equal(bookingActions, 0);

  const active = state();
  active.booking = ShadenEngine.createBookingState();
  active.booking.step = 'service';
  active.booking.specialtyId = 'specialty-1';
  const before = structuredClone(active.booking);
  const activeResult = engine.handle({
    message: { text: message }, currentState: active, clinicData: data(),
    operationalServiceConstraint: { kind: 'EXPLICIT_SERVICE_OUT_OF_CATALOG', surface: 'خدمة محددة' },
  });
  assert.deepEqual(activeResult.nextState.booking, before);
  assert.equal(activeResult.operationalDisposition, 'OPERATIONAL_ONLY');
  assert.equal(activeResult.interaction.purpose, 'select_service');
  assert.equal(bookingActions, 0);

  const broadNeed = engine.handle({
    message: { text: 'أبغى أحجز' }, currentState: state(), clinicData: data(),
    operationalServiceConstraint: explicitServiceOutOfCatalog({ semanticResult: valid, subject: need, resolution: outOfCatalog }),
  });
  assert.ok(broadNeed.nextState.booking);
});

test('runtime grounding grants booking-block authority only to IDENTITY plus NOT_FOUND', async () => {
  for (const referenceType of ['IDENTITY', undefined, 'MALFORMED']) {
    const harness = runtimeConstraintHarness(referenceType);
    await harness.send();
    assert.equal(harness.semanticCalls, 1);
    assert.equal(harness.groundingCalls, 1);
    assert.equal(harness.resolutionCalls, 1);
    assert.equal(harness.bookingActions, 0);

    if (referenceType === 'IDENTITY') {
      assert.deepEqual(harness.engineInput.operationalServiceConstraint, {
        kind: 'EXPLICIT_SERVICE_OUT_OF_CATALOG', surface: 'الخدمة غير المتاحة',
      });
      assert.equal(harness.persistedData.shaden.booking, undefined);
    } else {
      assert.equal(harness.engineInput.operationalServiceConstraint, null);
      assert.equal(
        Object.hasOwn(harness.engineInput.semanticMeaning.subjects[0], 'referenceType'),
        false
      );
      assert.ok(harness.persistedData.shaden.booking);
    }
  }

  const groundingFailure = runtimeConstraintHarness('IDENTITY', {
    groundingFailure: true,
  });
  await groundingFailure.send();
  assert.equal(groundingFailure.semanticCalls, 1);
  assert.equal(groundingFailure.groundingCalls, 1);
  assert.equal(groundingFailure.resolutionCalls, 0);
  assert.equal(groundingFailure.engineInput.operationalServiceConstraint, null);
  assert.ok(groundingFailure.persistedData.shaden.booking);
});

test('runtime guard does not depend on semantic ACT goal', async () => {
  const harness = runtimeConstraintHarness('IDENTITY', { semanticGoal: 'ASK' });
  await harness.send();
  assert.equal(harness.semanticCalls, 1);
  assert.deepEqual(harness.engineInput.operationalServiceConstraint, {
    kind: 'EXPLICIT_SERVICE_OUT_OF_CATALOG', surface: 'الخدمة غير المتاحة',
  });
  assert.equal(harness.persistedData.shaden.booking, undefined);
  assert.equal(harness.bookingActions, 0);
});

function runtimeConstraintHarness(referenceType, options = {}) {
  const harness = {
    persistedData: { shaden: state() }, semanticCalls: 0, groundingCalls: 0,
    resolutionCalls: 0, bookingActions: 0, engineInput: null,
  };
  const realEngine = new ShadenEngine({
    bookingEngine: { async execute() { harness.bookingActions += 1; } },
  });
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() { return { id: 'conversation-1', patientId: null, botEnabled: true }; },
      async loadState() { return { data: structuredClone(harness.persistedData) }; },
      async updateState(_id, value) { harness.persistedData = value.data; },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() { return { id: 'incoming-1' }; },
      async getRecentMessages() { return []; },
      async saveOutgoingMessage() {},
    },
    catalogService: { async list(kind) {
      const catalog = {
        branches: [], specialties: [{ id: 'specialty-1', display_name_ar: 'تخصص', is_active: true }],
        services: [{ id: 'service-1', display_name_ar: 'خدمة مدعومة', specialty_id: 'specialty-1', is_active: true }],
        'payment-methods': [], 'insurance-companies': [], 'insurance-classes': [], 'branch-working-hours': [],
      };
      return catalog[kind] || [];
    } },
    clinicConfigurationSource: { async get() { return {}; } },
    knowledgeBaseRepository: { async findDiscoveryRows() { return []; } },
    conversationEnabled: true,
    conversationProvider: { async complete() { throw new Error('conversation must not run'); } },
    semanticProvider: { async completeJson() {
      harness.semanticCalls += 1;
      const subject = { kind: 'SERVICE_OR_NEED', surface: 'الخدمة غير المتاحة', source: 'CURRENT' };
      if (referenceType !== undefined) subject.referenceType = referenceType;
      return { result: { status: 'UNDERSTOOD', goal: options.semanticGoal || 'ACT', subjects: [subject], constraints: [] }, model: 'semantic-test', usage: {}, rawContent: '{}' };
    } },
    candidateGrounder: { async ground() {
      harness.groundingCalls += 1;
      if (options.groundingFailure) throw new Error('grounding failed');
      return { method: 'SEMANTIC', semanticMeaning: 'nonexistent service', candidates: [], normalization: null };
    } },
    semanticCandidateResolver: { async resolve() {
      harness.resolutionCalls += 1;
      return { decision: 'NOT_FOUND', candidateIndex: null };
    } },
    shadenEngine: { async handle(input) {
      harness.engineInput = input;
      return realEngine.handle(input);
    } },
    logger: { info() {}, warn() {} },
    async sendMessage() { return { messageId: 'out-1' }; },
  });
  harness.send = () => runtime.processMessage({
    channel: 'whatsapp', waMessageId: `constraint-${referenceType || 'missing'}`,
    senderPhone: '+966500000001', receiverPhone: '+966500000002',
    messageType: 'text', text: 'أبغى أحجز الخدمة غير المتاحة', rawPayload: {},
  });
  return harness;
}

function state() { return { version: 1, mode: 'idle', step: null, customer: { name: 'نورة' }, context: null, options: [] }; }
function data() { return { clinic: { id: 'clinic-1', name: 'Clinic' }, specialties: [{ id: 'specialty-1', name: 'Skin' }], services: [{ id: 'service-1', name: 'خدمة مدعومة', specialtyId: 'specialty-1' }], branches: [], paymentMethods: [], insuranceCompanies: [], insuranceClasses: [], workingHours: [], serviceBranchAssignments: [], serviceBranchCompatibilityAvailable: false }; }
