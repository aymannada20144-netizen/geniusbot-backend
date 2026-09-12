'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');
const {
  abandonActiveBookingDraft,
} = require('../../src/services/shaden/OperationalBookingConstraint');

const liveText = 'خلاص ما أبي أحجز، ألغي العملية';

function semanticResult({
  status = 'UNDERSTOOD',
  goal = 'ACT',
  subjects = [{ kind: 'APPOINTMENT', surface: 'العملية', source: 'CURRENT' }],
  constraints = [
    { kind: 'NEGATIVE', surface: 'ما أبي أحجز', source: 'CURRENT' },
    { kind: 'NEGATIVE', surface: 'ألغي', source: 'CURRENT' },
  ],
  contractValid = true,
} = {}) {
  return { contractValid, result: { status, goal, subjects, constraints } };
}

function activeBookingState(step = 'specialty') {
  const state = {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'نورة' },
    context: { inquiry: 'booking_context' },
    options: ['stale-option'],
  };
  state.booking = ShadenEngine.createBookingState();
  state.booking.step = step;
  return state;
}

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'Clinic' },
    specialties: [{ id: 'specialty-1', name: 'العناية بالبشرة' }],
    services: [{ id: 'service-1', name: 'تنظيف بشرة', specialtyId: 'specialty-1' }],
    branches: [], paymentMethods: [], insuranceCompanies: [], insuranceClasses: [],
    workingHours: [], serviceBranchAssignments: [],
  };
}

test('derives abandonment authority only from a pure CURRENT negative appointment ACT', () => {
  assert.deepEqual(abandonActiveBookingDraft({ semanticResult: semanticResult() }), {
    kind: 'ABANDON_ACTIVE_BOOKING_DRAFT',
  });

  const disallowed = [
    semanticResult({ goal: 'ASK' }),
    semanticResult({ status: 'AMBIGUOUS' }),
    semanticResult({ contractValid: false }),
    semanticResult({ subjects: [{ kind: 'APPOINTMENT', surface: 'العملية', source: 'CONTEXT' }] }),
    semanticResult({ constraints: [{ kind: 'NEGATIVE', surface: 'ما أبي أحجز', source: 'CONTEXT' }] }),
    semanticResult({ subjects: [
      { kind: 'APPOINTMENT', surface: 'العملية', source: 'CURRENT' },
      { kind: 'SERVICE_OR_NEED', surface: 'بوتوكس', source: 'CURRENT' },
    ] }),
    semanticResult({ subjects: [
      { kind: 'APPOINTMENT', surface: 'العملية', source: 'CURRENT' },
      { kind: 'PROVIDER', surface: 'الدكتورة', source: 'CURRENT' },
    ] }),
    semanticResult({ constraints: [
      { kind: 'NEGATIVE', surface: 'ما أبي أحجز', source: 'CURRENT' },
      { kind: 'DATE', surface: 'اليوم', source: 'CURRENT' },
    ] }),
    semanticResult({ constraints: [
      { kind: 'NEGATIVE', surface: 'ما أبي أحجز', source: 'CURRENT' },
      { kind: 'PREFERENCE', surface: 'مع الدكتورة', source: 'CURRENT' },
    ] }),
  ];

  for (const value of disallowed) {
    assert.equal(abandonActiveBookingDraft({ semanticResult: value }), null);
  }
});

test('active booking abandonment clears only the draft and performs no booking or appointment action', async () => {
  let bookingActions = 0;
  let cancelActions = 0;
  const engine = new ShadenEngine({
    bookingEngine: { async execute() { bookingActions += 1; } },
    appointmentService: { async cancelAppointment() { cancelActions += 1; } },
  });
  const currentState = activeBookingState();

  const result = await engine.handle({
    message: { text: liveText },
    currentState,
    clinicData: clinicData(),
    semanticMeaning: semanticResult().result,
    operationalBookingConstraint: { kind: 'ABANDON_ACTIVE_BOOKING_DRAFT' },
  });

  assert.equal(result.nextState.booking, undefined);
  assert.equal(result.nextState.step, null);
  assert.deepEqual(result.nextState.options, []);
  assert.equal(result.nextState.context, null);
  assert.equal(result.operationalDisposition, 'CONSUMED');
  assert.equal(result.lifecycleOutcome.type, 'terminal');
  assert.equal(result.lifecycleOutcome.owner, 'booking');
  assert.equal(result.lifecycleOutcome.reason, 'aborted');
  assert.match(result.reply, /إيقاف عملية الحجز/u);
  assert.equal(result.nextState.cancellation, undefined);
  assert.equal(bookingActions, 0);
  assert.equal(cancelActions, 0);
});

test('qualified negative appointment requests do not clear an active booking draft', async () => {
  const cases = [
    semanticResult({ subjects: [
      { kind: 'APPOINTMENT', surface: 'أحجز', source: 'CURRENT' },
      { kind: 'SERVICE_OR_NEED', surface: 'بوتوكس', source: 'CURRENT' },
    ], constraints: [{ kind: 'NEGATIVE', surface: 'ما أبي', source: 'CURRENT' }] }),
    semanticResult({ constraints: [
      { kind: 'NEGATIVE', surface: 'ما أبي أحجز', source: 'CURRENT' },
      { kind: 'DATE', surface: 'اليوم', source: 'CURRENT' },
    ] }),
  ];

  for (const semantic of cases) {
    assert.equal(abandonActiveBookingDraft({ semanticResult: semantic }), null);
  }
});

test('idle negated booking request does not accidentally start a new booking', async () => {
  const engine = new ShadenEngine();
  const state = {
    version: 1, mode: 'idle', step: null,
    customer: { name: 'نورة' }, context: null, options: [],
  };
  const result = await engine.handle({
    message: { text: liveText },
    currentState: state,
    clinicData: clinicData(),
    semanticMeaning: semanticResult().result,
    operationalBookingConstraint: { kind: 'ABANDON_ACTIVE_BOOKING_DRAFT' },
  });
  assert.equal(result.nextState.booking, undefined);
  assert.equal(result.nextState.cancellation, undefined);
  assert.match(result.reply, /إيقاف عملية الحجز/u);
});

test('idle explicit cancellation of an existing appointment keeps the appointment-cancellation flow unchanged', async () => {
  let cancelCalls = 0;
  const appointmentId = '33333333-3333-4333-8333-333333333333';
  const appointmentService = {
    async getFutureManagementCandidates() {
      return [{
        id: appointmentId,
        clinic_id: 'clinic-1', patient_id: 'patient-1',
        booking_reference: '25DD4527', service_name: 'جلدية', branch_name: 'الفرع',
        appointment_start: '2026-09-20T10:00:00.000Z', status: 'confirmed',
        updated_at: '2026-09-01T10:00:00.000Z',
      }];
    },
    async cancelAppointment() { cancelCalls += 1; },
  };
  const engine = new ShadenEngine({ appointmentService });
  const result = await engine.handle({
    message: { text: 'إلغاء موعدي' },
    currentState: null,
    clinicData: {},
    patientIdentity: { patient: { id: 'patient-1' }, customerName: 'نورة' },
    bookingContext: { clinicId: 'clinic-1', conversationId: 'conversation-1' },
    operationalBookingConstraint: { kind: 'ABANDON_ACTIVE_BOOKING_DRAFT' },
  });

  assert.equal(result.nextState.booking, undefined);
  assert.equal(result.nextState.cancellation.step, 'awaiting_confirmation');
  assert.match(result.reply, /تأكيد إلغاء هذا الموعد/u);
  assert.equal(cancelCalls, 0);
});

test('real runtime derives abandonment authority, persists cleared state, and does not invoke actions', async () => {
  const harness = runtimeHarness();
  await harness.send(liveText);

  assert.equal(harness.semanticCalls, 1);
  assert.equal(harness.engineCalls, 1);
  assert.equal(harness.conversationCalls, 0);
  assert.deepEqual(harness.engineInput.operationalBookingConstraint, {
    kind: 'ABANDON_ACTIVE_BOOKING_DRAFT',
  });
  assert.equal(harness.persistedData.shaden.booking, undefined);
  assert.equal(harness.bookingActions, 0);
  assert.equal(harness.cancelActions, 0);
  assert.equal(harness.sends.length, 1);
  assert.match(harness.sends[0].body, /إيقاف عملية الحجز/u);
  assert.doesNotMatch(harness.sends[0].body, /اختاري التخصص/u);

  await harness.send('مرحبا');
  assert.equal(harness.persistedData.shaden.booking, undefined);
  assert.equal(harness.conversationCalls, 1);
  assert.equal(harness.sends.length, 2);
  assert.equal(harness.sends[1].body, 'أهلًا بك');
});

function runtimeHarness() {
  const harness = {
    persistedData: { shaden: activeBookingState() },
    semanticCalls: 0, engineCalls: 0, conversationCalls: 0,
    bookingActions: 0, cancelActions: 0, sends: [], engineInput: null,
  };
  const realEngine = new ShadenEngine({
    bookingEngine: { async execute() { harness.bookingActions += 1; } },
    appointmentService: { async cancelAppointment() { harness.cancelActions += 1; } },
  });
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() { return { id: 'conversation-1', patientId: null, botEnabled: true }; },
      async loadState() { return { data: structuredClone(harness.persistedData) }; },
      async updateState(_id, value) { harness.persistedData = structuredClone(value.data); },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() { return { id: `incoming-${Date.now()}-${Math.random()}` }; },
      async getRecentMessages() { return []; },
      async saveOutgoingMessage() {},
    },
    catalogService: { async list(kind) {
      const values = {
        branches: [],
        specialties: [{ id: 'specialty-1', display_name_ar: 'العناية بالبشرة', is_active: true }],
        services: [{ id: 'service-1', display_name_ar: 'تنظيف بشرة', specialty_id: 'specialty-1', is_active: true }],
        'payment-methods': [], 'insurance-companies': [], 'insurance-classes': [],
        'branch-working-hours': [],
      };
      return values[kind] || [];
    } },
    clinicConfigurationSource: { async get() { return {}; } },
    conversationEnabled: true,
    semanticProvider: { async completeJson(messages) {
      harness.semanticCalls += 1;
      const current = messages[messages.length - 1].content;
      if (current.includes(liveText)) {
        return {
          result: semanticResult().result,
          model: 'semantic-test', usage: {}, rawContent: '{}',
        };
      }
      return {
        result: { status: 'UNDERSTOOD', goal: 'SOCIAL', subjects: [], constraints: [] },
        model: 'semantic-test', usage: {}, rawContent: '{}',
      };
    } },
    conversationProvider: { async complete() {
      harness.conversationCalls += 1;
      return {
        content: 'أهلًا بك', toolCalls: [],
        assistantMessage: { role: 'assistant', content: 'أهلًا بك' },
        model: 'conversation-test',
      };
    } },
    shadenEngine: { async handle(input) {
      harness.engineCalls += 1;
      harness.engineInput = input;
      return realEngine.handle(input);
    } },
    bookingEngine: { async execute() { harness.bookingActions += 1; } },
    appointmentService: { async cancelAppointment() { harness.cancelActions += 1; } },
    logger: { info() {}, warn() {} },
    async sendMessage(value) { harness.sends.push(structuredClone(value)); return { messageId: `out-${harness.sends.length}` }; },
  });

  harness.send = (text) => runtime.processMessage({
    channel: 'whatsapp', waMessageId: `abandon-${Date.now()}-${Math.random()}`,
    senderPhone: '+966500000001', receiverPhone: '+966500000002',
    messageType: 'text', text, rawPayload: {},
  });
  return harness;
}
