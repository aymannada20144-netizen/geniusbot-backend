'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

test('real booking continuation is validated and lifecycle metadata stays internal', async () => {
  const harness = createHarness({ state: idleState() });
  const result = await harness.send('حجز');

  assert.equal(result.state.data.shaden.booking.step, 'specialty');
  assert.equal('lifecycleOutcome' in result, false);
  assert.equal('undeclaredLifecycleReason' in result, false);
  assert.equal(JSON.stringify(harness.persisted()).includes('lifecycle'), false);
});

test('real booking terminal result releases ownership before delivery', async () => {
  const state = idleState();
  state.data.shaden.booking = {
    step: 'confirmation', specialtyId: null, serviceId: 'service-1', city: null,
    branchId: 'branch-1', doctorId: null, roomId: null, date: null,
    datePeriod: null, timePeriod: null, preferredStart: '2026-08-25T10:00:00.000Z',
    paymentMethodId: 'payment-1', insuranceCompanyId: null,
    insuranceClassId: null,
  };
  const harness = createHarness({ state });
  const result = await harness.send('لا');

  assert.equal(result.state.data.shaden.booking, undefined);
  assert.equal('lifecycleOutcome' in result, false);
  assert.equal(JSON.stringify(harness.persisted()).includes('lifecycle'), false);
});

test('real non-flow producer uses explicit bounded legacy compatibility', async () => {
  const harness = createHarness({ state: idleState() });
  const result = await harness.send('السلام عليكم');
  assert.equal(typeof result.replyText, 'string');
  assert.equal('undeclaredLifecycleReason' in result, false);
});

test('production boundary rejects illegal and unannotated handler results', async () => {
  const illegal = createHarness({
    engine: {
      async handle() {
        return {
          reply: 'illegal',
          nextState: { booking: { step: 'branch' } },
          lifecycleOutcome: {
            lifecycleVersion: 1, type: 'continue', owner: 'booking',
            nextStep: 'service', reason: null,
          },
        };
      },
    },
  });
  await assert.rejects(() => illegal.send('anything'), lifecycleInvariant);

  const unannotated = createHarness({
    engine: {
      async handle() {
        return { reply: 'missing marker', nextState: { version: 1 } };
      },
    },
  });
  await assert.rejects(() => unannotated.send('anything'), lifecycleInvariant);
});

test('production boundary rejects persisted turn-scoped semantic evidence', async () => {
  for (const key of [
    'pendingInteractionEvent', 'interactionEvent',
    'semanticEvidence', 'semanticCoreResult',
  ]) {
    const harness = createHarness({
      engine: {
        async handle() {
          return {
            reply: 'legacy',
            nextState: { version: 1, [key]: {} },
            undeclaredLifecycleReason: 'legacy_undeclared',
          };
        },
      },
    });
    await assert.rejects(() => harness.send(`case-${key}`), lifecycleInvariant);
  }
});

function lifecycleInvariant(error) {
  return error?.name === 'LifecycleInvariantError' &&
    error?.code === 'SHADEN_LIFECYCLE_INVARIANT';
}

function idleState() {
  return {
    current: 'shaden',
    data: {
      shaden: {
        version: 1, mode: 'idle', step: null,
        customer: { name: 'نورة' }, context: null, options: [],
      },
    },
  };
}

function createHarness({ state = idleState(), engine = null } = {}) {
  let stored = structuredClone(state);
  let number = 0;
  const runtime = createShadenEngine({
    clinicService: {
      async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; },
    },
    conversationService: {
      async findOrCreateForChannel() {
        return { id: 'conversation-1', patientId: null, botEnabled: true };
      },
      async loadState() { return structuredClone(stored); },
      async updateState(_id, value) { stored = structuredClone(value); },
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() {},
      async saveOutgoingMessage() {},
    },
    catalogService: { async list() { return []; } },
    clinicConfigurationSource: { async get() { return {}; } },
    conversationalIntelligenceOrchestrator: {
      async analyze() { return null; },
    },
    shadenEngine: engine,
    async sendMessage() { return { messageId: `out-${number}` }; },
  });
  return {
    persisted: () => structuredClone(stored),
    send(text) {
      number += 1;
      return runtime.processMessage({
        channel: 'whatsapp', waMessageId: `in-${number}`,
        senderPhone: '+966500000001', receiverPhone: '+966500000002',
        messageType: 'text', text, rawPayload: {},
      });
    },
  };
}
