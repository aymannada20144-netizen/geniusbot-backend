'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

const ASK = Object.freeze({
  status: 'UNDERSTOOD', goal: 'ASK',
  subjects: [{ kind: 'SERVICE_OR_NEED', surface: 'الخدمة', source: 'CURRENT' }],
  constraints: [],
});

test('semantic ASK service mentions do not select either unrelated service', async () => {
  for (const service of clinicData().services) {
    const state = bookingState('service');
    const before = structuredClone(state.booking);
    const semanticMeaning = {
      ...ASK,
      subjects: [{ kind: 'SERVICE_OR_NEED', surface: service.name, source: 'CURRENT' }],
    };
    const result = await Promise.resolve(new ShadenEngine().handle({
      message: { text: `معلومة عن ${service.name}` },
      currentState: state,
      clinicData: clinicData(),
      semanticMeaning,
    }));
    assert.equal(result.operationalDisposition, 'UNCONSUMED');
    assert.deepEqual(result.nextState.booking, before);
    assert.equal(result.nextState.booking.serviceId, null);
    assert.equal(result.interaction.purpose, 'select_service');
  }
});

test('MEDICAL_CONTEXT does not turn a service mention into a selection', async () => {
  const state = bookingState('service');
  const before = structuredClone(state.booking);
  const result = await Promise.resolve(new ShadenEngine().handle({
    message: { text: 'سياق شخصي مع عناية ألف' },
    currentState: state,
    clinicData: clinicData(),
    semanticMeaning: {
      ...ASK,
      subjects: [{ kind: 'SERVICE_OR_NEED', surface: 'عناية ألف', source: 'CURRENT' }],
      constraints: [{ kind: 'MEDICAL_CONTEXT', surface: 'سياق شخصي', source: 'CURRENT' }],
    },
  }));
  assert.equal(result.operationalDisposition, 'UNCONSUMED');
  assert.deepEqual(result.nextState.booking, before);
});

test('trusted interactive and legitimate free-text service selections still advance', async () => {
  const engine = new ShadenEngine();
  const interactive = await Promise.resolve(engine.handle({
    message: {
      text: 'ignored', rawPayload: { value: 'service:service-a' },
      inputProvenance: { trusted: true },
    },
    currentState: bookingState('service'), clinicData: clinicData(), semanticMeaning: ASK,
  }));
  assert.equal(interactive.nextState.booking.serviceId, 'service-a');
  assert.equal(interactive.operationalDisposition, 'CONSUMED');

  const freeText = await Promise.resolve(engine.handle({
    message: { text: 'استشارة باء' },
    currentState: bookingState('service'), clinicData: clinicData(),
    semanticMeaning: { status: 'UNDERSTOOD', goal: 'ACT', subjects: [], constraints: [] },
  }));
  assert.equal(freeText.nextState.booking.serviceId, 'service-b');
  assert.equal(freeText.operationalDisposition, 'CONSUMED');
});

test('deterministic knowledge interruption answers and preserves service list', async () => {
  const state = bookingState('service');
  const before = structuredClone(state.booking);
  const result = await Promise.resolve(new ShadenEngine().handle({
    message: { text: 'ما الخدمات' }, currentState: state, clinicData: clinicData(),
  }));
  assert.equal(result.operationalDisposition, 'KNOWLEDGE_INTERRUPTION');
  assert.deepEqual(result.nextState.booking, before);
  assert.match(result.reply, /ما الخدمة/);
  assert.equal(result.interaction.purpose, 'select_service');
});

test('one-pass side answer preserves state and sends answer before the same interaction', async () => {
  const harness = runtimeHarness();
  const semanticAsk = runtimeAsk();
  const result = await harness.send(semanticAsk);
  assert.equal(harness.engineCalls, 1);
  assert.deepEqual(harness.receivedSemanticMeaning, semanticAsk);
  assert.equal(harness.stateWrites, 0);
  assert.deepEqual(result.state.data, harness.persistedData);
  assert.equal(harness.sends.length, 2);
  assert.equal(harness.sends[0].body, 'إجابة موثوقة');
  assert.deepEqual(harness.sends[1].interaction, harness.waitingInteraction);
  assert.equal(harness.outgoing.length, 2);
  assert.equal(harness.actionCalls, 0);
});

test('provider failure, empty output, and SAFE_FALLBACK fail closed', async () => {
  for (const mode of ['throw', 'empty', 'safe']) {
    const harness = runtimeHarness({ conversationMode: mode });
    await harness.send(runtimeAsk());
    assert.equal(harness.engineCalls, 1, mode);
    assert.equal(harness.stateWrites, 0, mode);
    assert.equal(harness.sends.length, 1, mode);
    assert.deepEqual(harness.sends[0].interaction, harness.waitingInteraction, mode);
    assert.equal(harness.actionCalls, 0, mode);
  }
});

test('failed real booking execution remains operational-only with an unchanged draft', async () => {
  let directActionCalls = 0;
  const directState = confirmationState();
  const directBefore = structuredClone(directState.booking);
  const directData = confirmationClinicData();
  const directResult = await new ShadenEngine({
    bookingEngine: { async execute() { directActionCalls += 1; return { status: 'failed' }; } },
  }).handle({
    message: { text: 'نعم' }, currentState: directState, clinicData: directData,
    semanticMeaning: runtimeAsk(), bookingContext: { clinicId: 'clinic-1' },
  });
  assert.equal(directActionCalls, 1);
  assert.equal(directResult.operationalDisposition, 'OPERATIONAL_ONLY');
  assert.deepEqual(directResult.nextState.booking, directBefore);

  const harness = failedExecutionRuntimeHarness();
  const before = structuredClone(harness.persistedData.shaden.booking);
  await harness.send();
  assert.equal(harness.actionCalls, 1);
  assert.equal(harness.conversationCalls, 0);
  assert.equal(harness.engineResultDisposition, 'OPERATIONAL_ONLY');
  assert.deepEqual(harness.persistedData.shaden.booking, before);
  assert.equal(harness.sends.length, 1);
  assert.equal(harness.stateWrites, 1);
});

test('missing and invalid dispositions fail closed to operational-only routing', async () => {
  for (const operationalDisposition of [undefined, 'NOT_A_DISPOSITION']) {
    const harness = runtimeHarness({ operationalDisposition });
    await harness.send(runtimeAsk());
    assert.equal(harness.engineCalls, 1);
    assert.equal(harness.conversationCalls, 0);
    assert.equal(harness.sends.length, 1);
    assert.equal(harness.stateWrites, 1);
  }
});

test('UNKNOWN, AMBIGUOUS, and invalid semantic contracts only reprompt', async () => {
  for (const semanticResult of [
    { status: 'UNKNOWN', goal: null, subjects: [], constraints: [] },
    { status: 'AMBIGUOUS', goal: 'ASK', subjects: [], constraints: [] },
    { status: 'UNKNOWN', goal: 'ASK', subjects: [], constraints: [] },
  ]) {
    const harness = runtimeHarness();
    await harness.send(semanticResult);
    assert.equal(harness.conversationCalls, 0);
    assert.equal(harness.sends.length, 1);
    assert.equal(harness.stateWrites, 1);
  }
});

function runtimeHarness(options = {}) {
  const conversationMode = options.conversationMode || 'answer';
  const operationalDisposition = Object.prototype.hasOwnProperty.call(
    options,
    'operationalDisposition'
  )
    ? options.operationalDisposition
    : 'UNCONSUMED';
  const persistedData = { shaden: bookingState('service') };
  const waitingInteraction = {
    version: 1, mode: 'list', purpose: 'select_service',
    displayText: 'اختاري الخدمة', listPrompt: 'الخدمات',
    options: [{ id: 'service:service-a', label: 'عناية ألف' }],
  };
  const harness = {
    persistedData, waitingInteraction, sends: [], outgoing: [],
    engineCalls: 0, conversationCalls: 0, stateWrites: 0, actionCalls: 0,
  };
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() {
        return { id: 'conversation-1', patientId: null, botEnabled: true };
      },
      async loadState() { return { data: structuredClone(persistedData) }; },
      async updateState() { harness.stateWrites += 1; },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() { return { id: 'incoming-1' }; },
      async getRecentMessages() { return []; },
      async saveOutgoingMessage(value) { harness.outgoing.push(value); },
    },
    catalogService: { async list() { return []; } },
    clinicConfigurationSource: { async get() { return {}; } },
    conversationEnabled: true,
    semanticProvider: {
      async completeJson() {
        return { result: harness.semanticResult, model: 'semantic-test', usage: {}, rawContent: '{}' };
      },
    },
    conversationProvider: {
      async complete() {
        harness.conversationCalls += 1;
        if (conversationMode === 'throw') throw new Error('provider failed');
        if (conversationMode === 'empty') return {
          content: null, toolCalls: [],
          assistantMessage: { role: 'assistant', content: null },
          model: 'conversation-test',
        };
        if (conversationMode === 'safe') return {
          content: null,
          toolCalls: [{ id: 'unsafe', function: { name: 'write_database', arguments: '{}' } }],
          assistantMessage: { role: 'assistant', content: null, tool_calls: [] },
          model: 'conversation-test',
        };
        return {
          content: 'إجابة موثوقة', toolCalls: [],
          assistantMessage: { role: 'assistant', content: 'إجابة موثوقة' },
          model: 'conversation-test',
        };
      },
    },
    shadenEngine: {
      async handle(input) {
        harness.engineCalls += 1;
        harness.receivedSemanticMeaning = input.semanticMeaning;
        return {
          reply: 'اختاري الخدمة', interaction: waitingInteraction,
          nextState: structuredClone(persistedData.shaden),
          ...(operationalDisposition === undefined
            ? {}
            : { operationalDisposition }),
          undeclaredLifecycleReason: 'legacy_undeclared',
        };
      },
    },
    bookingEngine: { async createBooking() { harness.actionCalls += 1; } },
    appointmentService: { async cancelAppointment() { harness.actionCalls += 1; } },
    logger: { info() {}, warn() {} },
    async sendMessage(value) {
      harness.sends.push(structuredClone(value));
      return { messageId: `out-${harness.sends.length}` };
    },
  });
  harness.send = async (semanticResult) => {
    harness.semanticResult = semanticResult;
    return runtime.processMessage({
      channel: 'whatsapp', waMessageId: `in-${Date.now()}-${Math.random()}`,
      senderPhone: '+966500000001', receiverPhone: '+966500000002',
      messageType: 'text', text: 'side query', rawPayload: {},
    });
  };
  return harness;
}

function failedExecutionRuntimeHarness() {
  const state = confirmationState();
  const harness = {
    persistedData: { shaden: state }, actionCalls: 0, conversationCalls: 0,
    stateWrites: 0, sends: [], engineResultDisposition: null,
  };
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() { return { id: 'conversation-1', patientId: null, botEnabled: true }; },
      async loadState() { return { data: structuredClone(harness.persistedData) }; },
      async updateState(_id, value) { harness.stateWrites += 1; harness.persistedData = value.data; },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() { return { id: 'incoming-1' }; },
      async getRecentMessages() { return []; },
      async saveOutgoingMessage() {},
    },
    catalogService: { async list(kind) {
      const values = {
        branches: [{ id: 'branch-1', name: 'المركز', city: 'الرياض', is_active: true }],
        specialties: [{ id: 'specialty-1', display_name_ar: 'تخصص', is_active: true }],
        services: [{ id: 'service-a', display_name_ar: 'عناية ألف', specialty_id: 'specialty-1', is_active: true }],
        'payment-methods': [{ id: 'cash-1', display_name_ar: 'كاش', code: 'cash', is_active: true }],
        'insurance-companies': [], 'insurance-classes': [], 'branch-working-hours': [],
      };
      return values[kind] || [];
    } },
    clinicConfigurationSource: { async get() { return {}; } },
    conversationEnabled: true,
    semanticProvider: { async completeJson() {
      return {
        result: { status: 'UNDERSTOOD', goal: 'ASK', subjects: [{ kind: 'SERVICE_OR_NEED', surface: 'نعم', source: 'CURRENT' }], constraints: [] },
        model: 'semantic-test', usage: {}, rawContent: '{}',
      };
    } },
    conversationProvider: { async complete() {
      harness.conversationCalls += 1;
      return { content: 'should not run', toolCalls: [], assistantMessage: {}, model: 'conversation-test' };
    } },
    bookingEngine: { async execute() { harness.actionCalls += 1; return { status: 'failed' }; } },
    logger: { info(entry) {
      if (entry.event === 'SHADEN_CONVERSATION_ROUTE') {
        harness.engineResultDisposition = entry.owner === 'BOOKING_SIDE_QUERY'
          ? 'UNCONSUMED' : 'OPERATIONAL_ONLY';
      }
    }, warn() {} },
    async sendMessage(value) { harness.sends.push(value); return { messageId: 'out-1' }; },
  });
  harness.send = () => runtime.processMessage({
    channel: 'whatsapp', waMessageId: 'failed-execution',
    senderPhone: '+966500000001', receiverPhone: '+966500000002',
    messageType: 'text', text: 'نعم', rawPayload: {},
  });
  return harness;
}

function confirmationState() {
  const state = bookingState('confirmation');
  Object.assign(state.booking, {
    serviceId: 'service-a', city: 'الرياض', branchId: 'branch-1',
    preferredStart: '2026-10-10T10:00:00.000Z', paymentMethodId: 'cash-1',
  });
  return state;
}

function confirmationClinicData() {
  return {
    ...clinicData(),
    paymentMethods: [{ id: 'cash-1', name: 'كاش', code: 'cash' }],
  };
}

function runtimeAsk() {
  return {
    status: 'UNDERSTOOD', goal: 'ASK',
    subjects: [{ kind: 'SERVICE_OR_NEED', surface: 'side query', source: 'CURRENT' }],
    constraints: [],
  };
}

function bookingState(step) {
  const booking = ShadenEngine.createBookingState();
  booking.step = step;
  booking.specialtyId = 'specialty-1';
  return {
    version: 1, mode: 'idle', step: null, customer: { name: 'نورة' },
    context: null, options: [], booking,
  };
}

function clinicData() {
  return {
    clinic: { id: 'clinic-1', name: 'Clinic' },
    specialties: [{ id: 'specialty-1', name: 'تخصص' }],
    services: [
      { id: 'service-a', name: 'عناية ألف', specialtyId: 'specialty-1' },
      { id: 'service-b', name: 'استشارة باء', specialtyId: 'specialty-1' },
    ],
    branches: [{ id: 'branch-1', name: 'المركز', city: 'الرياض' }],
    paymentMethods: [], insuranceCompanies: [], insuranceClasses: [],
    serviceBranchAssignments: [], serviceBranchCompatibilityAvailable: false,
    workingHours: [], holidays: [],
  };
}
