'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');
const OperationalIntentBridge = require('../../src/services/shaden/OperationalIntentBridge');

const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const services = [
  { id: id(4), name: 'ليزر', is_booking_enabled: true },
  { id: id(5), name: 'تقشير كيميائي', is_booking_enabled: true },
  { id: id(6), name: 'تقشير بارد', is_booking_enabled: true },
];
function harness() {
  const h = { state: { version: 1, mode: 'idle', step: null, customer: { name: 'نورة' }, context: null, options: [] },
    writes: 0, committed: false, conversationCalls: 0, bridgeCalls: 0, groundings: [], routes: [], replies: [],
    operation: 'change_service_request', goal: 'ACT', decision: 'RESOLVED', failWrite: false, needsSlot: false,
    failBridge: false, failGrounding: false, failSend: false, failStatePersist: false };
  const appointment = { id: id(3), clinic_id: id(1), patient_id: id(2), service_id: id(4),
    branch_id: id(7), booking_reference: 'ABC12345', status: 'confirmed',
    service_name: 'ليزر', branch_name: 'الروضة', updated_at: '2026-08-13T08:00:00.000Z',
    appointment_start: '2027-08-20T09:00:00.000Z', appointment_end: '2027-08-20T09:30:00.000Z' };
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return { id: id(1), name: 'Clinic' }; } },
    conversationService: {
      async findOrCreateForChannel() { return { id: id(8), patientId: id(2), botEnabled: true }; },
      async loadState() { return { data: { shaden: structuredClone(h.state) } }; },
      async updateState(_id, value) {
        if (h.failStatePersist) throw new Error('state store unavailable');
        h.state = value.data.shaden;
      },
    },
    patientService: { async resolveChannelIdentity() { return { id: id(2), full_name: 'نورة' }; } },
    messageRepository: {
      async findByExternalId() { return null; }, async saveIncomingMessage() { return { id: id(9) }; },
      async getRecentMessages() { return []; }, async saveOutgoingMessage() {},
    },
    catalogService: { async list(kind) { return ({
      services: services.map((s) => ({ ...s, display_name_ar: s.name, specialty_id: id(10), is_active: true })),
      specialties: [{ id: id(10), display_name_ar: 'بشرة', is_active: true }],
      branches: [{ id: id(7), display_name_ar: 'الروضة', is_active: true }],
    })[kind] || []; } },
    clinicConfigurationSource: { async get() { return {}; } },
    knowledgeBaseRepository: { async findDiscoveryRows() { return []; } },
    appointmentService: {
      async getFutureManagementCandidates() { return [appointment]; },
      async resolveAppointmentForManagementByBookingReference() { return { patientId: id(2) }; },
      async listEligibleServiceChanges() { return services.slice(1); },
      async listEligibleBranchChanges() { return [{ id: id(13), name: 'العليا' }]; },
      async previewServiceChange(_clinic, _appointment, target, start) {
        assert.equal(target, id(5));
        return { appointment, service: services[1], assignment: { doctor_id: id(11), room_id: id(12) },
          price: { price: '250.00', currency: 'SAR' }, appointmentStart: start || appointment.appointment_start,
          appointmentEnd: '2027-08-20T10:00:00.000Z', requiresNewSlot: h.needsSlot && !start };
      },
      async changeAppointmentService(_clinic, appointmentId, target, start, actor, reviewed) {
        h.writes++;
        assert.equal(appointmentId, id(3)); assert.equal(target, id(5));
        assert.equal(actor.patientId, id(2)); assert.equal(reviewed, appointment.updated_at);
        assert.ok(start);
        if (h.failWrite) throw new Error('transaction failed');
        h.committed = true;
        return { ...appointment, service_id: target };
      },
    },
    bookingEngine: {
      async getAvailableDates(input) { assert.equal(input.excludeAppointmentId, id(3)); return { dates: ['2027-08-20'] }; },
      async getAvailableTimes(input) { assert.equal(input.excludeAppointmentId, id(3)); return { times: ['12:00'] }; },
    },
    conversationEnabled: true,
    conversationProvider: { async complete() { h.conversationCalls++; return { content: 'معلومات الخدمات', toolCalls: [] }; } },
    semanticProvider: { async completeJson(messages) {
      let input = {};
      try { input = JSON.parse(messages.at(-1).content); } catch {}
      if (input.supportedOperations) {
        h.bridgeCalls++;
        if (h.failBridge) throw new Error('bridge offline');
        assert.deepEqual(input.supportedOperations, ['booking_request', 'booking_modification_request',
          'change_branch_request', 'change_service_request', 'cancellation_request']);
        return { result: { operation: h.operation } };
      }
      return { result: { status: 'UNDERSTOOD', goal: h.goal,
        subjects: h.goal === 'SOCIAL' ? [] : [{ kind: 'SERVICE_OR_NEED', surface: h.text, source: 'CURRENT' }],
        constraints: [] }, rawContent: '{}', usage: {} };
    } },
    candidateGrounder: { async ground(input) {
      h.groundings.push(input);
      if (h.failGrounding) throw new Error('grounding offline');
      return { method: 'SEMANTIC', semanticMeaning: 'requested treatment',
        candidates: input.services.map((s) => ({ serviceId: s.id, serviceName: s.name })) };
    } },
    semanticCandidateResolver: { async resolve() { return { decision: h.decision, candidateIndex: 0 }; } },
    logger: { info(entry) { if (entry.event === 'SHADEN_CONVERSATION_ROUTE') h.routes.push(entry); }, warn() {} },
    async sendMessage({ body, interaction }) {
      h.replies.push({ body, interaction, committed: h.committed });
      if (h.failSend) throw Object.assign(new Error('Meta unavailable'), { code: 'META_UNAVAILABLE' });
      return { messageId: 'sent' };
    },
  });
  h.send = async (text, goal = 'ACT', input = {}) => {
    h.text = text; h.goal = goal;
    return runtime.processMessage({ channel: 'whatsapp', waMessageId: String(h.replies.length),
      senderPhone: '+966500000001', receiverPhone: '+966500000002', messageType: 'text', text, rawPayload: {}, ...input });
  };
  return h;
}

for (const phrase of ['تغيير خدمة', 'ممكن أبدل الخدمة', 'أبغى أغير العلاج', 'ودي أغير الإجراء']) {
  test(`processMessage bridges natural ACT: ${phrase}`, async () => {
    const h = harness(); await h.send(phrase);
    assert.equal(h.routes.at(-1).owner, 'OPERATIONAL_CORE');
    assert.equal(h.state.changeService.step, 'awaiting_service');
    assert.equal(h.routes.at(-1).operationalRecognizedType || h.routes.at(-1).deterministicRecognizedType,
      'change_service_request');
    assert.equal(h.conversationCalls, 0); assert.equal(h.groundings.length, 0); assert.equal(h.writes, 0);
  });
}
test('pending service resolution uses eligible services, confirmation commits once before success', async () => {
  const h = harness(); await h.send('تغيير خدمة'); await h.send('تقشير', 'ASK');
  assert.deepEqual(h.groundings[0].services.map((s) => s.id), [id(5), id(6)]);
  assert.equal(h.state.changeService.step, 'awaiting_confirmation');
  assert.equal(h.state.changeService.confirmationPending, true); assert.equal(h.writes, 0);
  await h.send('نعم', 'SOCIAL');
  assert.equal(h.writes, 1); assert.equal(h.replies.at(-1).committed, true);
  assert.ok(h.replies.at(-1).body.includes('تم تغيير')); assert.equal(h.conversationCalls, 0);
  await h.send('نعم', 'SOCIAL'); assert.equal(h.writes, 1);
});
test('interactive change-service state advances only after Meta accepts its prompt', async () => {
  const h = harness();
  h.failSend = true;
  await assert.rejects(() => h.send('تغيير خدمة'), /Meta unavailable/);
  assert.equal(h.state.changeService, undefined);
  assert.equal(h.writes, 0);

  h.failSend = false;
  await h.send('تغيير خدمة');
  assert.equal(h.state.changeService.step, 'awaiting_service');
  assert.equal(h.writes, 0);
});
test('accepted prompt with failed state persistence rejects a later trusted button without mutation', async () => {
  const h = harness();
  h.failStatePersist = true;
  await assert.rejects(() => h.send('تغيير خدمة'), /state store unavailable/);
  assert.equal(h.replies.length, 1);
  assert.equal(h.state.changeService, undefined);
  h.failStatePersist = false;
  await h.send('تأكيد تغيير الخدمة', 'SOCIAL', {
    rawPayload: { value: 'change-service-confirm:yes' },
    inputProvenance: { trusted: true, source: 'meta_whatsapp', kind: 'meta_interactive_button' },
  });
  assert.equal(h.writes, 0);
});
test('ambiguous, not-found and resolver failure stay in operational selection', async () => {
  for (const decision of ['AMBIGUOUS', 'NOT_FOUND', 'FAILURE']) {
    const h = harness(); h.decision = decision; h.failGrounding = decision === 'FAILURE';
    await h.send('تغيير خدمة'); const result = await h.send('تقشير', 'ASK');
    assert.equal(h.state.changeService.step, 'awaiting_service');
    assert.equal(h.conversationCalls, 0); assert.equal(h.writes, 0);
    assert.equal(h.routes.at(-1).owner, 'OPERATIONAL_CORE');
    assert.equal(h.replies.at(-1).interaction.purpose, 'select_change_service_service');
    assert.ok(result);
  }
});
test('yes without pending confirmation cannot mutate; invalid confirmation flag also cannot mutate', async () => {
  const h = harness(); await h.send('نعم', 'SOCIAL'); assert.equal(h.writes, 0);
  await h.send('تغيير خدمة'); await h.send('تقشير', 'ASK');
  h.state.changeService.confirmationPending = false;
  await h.send('نعم', 'SOCIAL'); assert.equal(h.writes, 0);
});
test('failed write never emits success', async () => {
  const h = harness(); h.failWrite = true;
  await h.send('تغيير خدمة'); await h.send('تقشير', 'ASK'); await h.send('نعم', 'SOCIAL');
  assert.equal(h.writes, 1); assert.equal(h.committed, false);
  assert.equal(h.replies.at(-1).body.includes('تم تغيير'), false); assert.equal(h.conversationCalls, 0);
});
test('unknown operational ACT fails closed without invoking conversational provider', async () => {
  const h = harness(); h.operation = 'unknown'; await h.send('أريد إجراءً آخر');
  assert.equal(h.routes.at(-1).ownershipReason, 'UNRESOLVED_OPERATIONAL_ACT');
  assert.equal(h.conversationCalls, 0); assert.equal(h.writes, 0);
  assert.equal(h.groundings.length, 0);
});
test('bridge provider failure and malformed proposals fail closed through processMessage', async () => {
  for (const fail of [false, true]) {
    const h = harness(); h.operation = 'unsupported_write'; h.failBridge = fail;
    await h.send('أريد إجراءً آخر');
    assert.equal(h.routes.at(-1).ownershipReason, 'UNRESOLVED_OPERATIONAL_ACT');
    assert.equal(h.conversationCalls, 0); assert.equal(h.writes, 0);
  }
});
test('trusted machine service selection bypasses semantic bridge', async () => {
  const h = harness(); await h.send('تغيير خدمة'); const count = h.bridgeCalls;
  await h.send('اختيار الخدمة', 'ACT', { rawPayload: { value: `change-service-service:${id(5)}` },
    inputProvenance: { trusted: true, source: 'meta_whatsapp', kind: 'meta_interactive_list' } });
  assert.equal(h.bridgeCalls, count); assert.equal(h.groundings.length, 0);
  assert.equal(h.state.changeService.step, 'awaiting_confirmation');
  assert.equal(h.routes.at(-1).ownershipReason, 'TRUSTED_MACHINE_INPUT');
});
test('existing branch and reschedule entry retain deterministic ownership', async () => {
  for (const [text, flow] of [['أبي أغير الفرع', 'changeBranch'], ['ابغى اغير موعدي', 'reschedule']]) {
    const h = harness(); await h.send(text);
    assert.equal(h.bridgeCalls, 0); assert.equal(h.conversationCalls, 0);
    assert.ok(h.state[flow]); assert.equal(h.state.changeService, undefined);
    assert.equal(h.routes.at(-1).owner, 'OPERATIONAL_CORE');
  }
});
test('structured service-category ASK is runtime-owned without bridge or LLM', async () => {
  const h = harness(); await h.send('ما هي خدمات التقشير؟', 'ASK');
  assert.equal(h.bridgeCalls, 0); assert.equal(h.conversationCalls, 0); assert.equal(h.state.changeService, undefined);
});
test('free-form service discussion remains conversational without bridge', async () => {
  const h = harness(); await h.send('هل الليزر مؤلم؟', 'ASK');
  assert.equal(h.bridgeCalls, 0); assert.equal(h.conversationCalls, 1); assert.equal(h.state.changeService, undefined);
});
test('new booking remains booking and deterministic operations do not invoke bridge', async () => {
  const h = harness(); await h.send('أبغى أحجز تقشير');
  assert.equal(h.bridgeCalls, 0); assert.ok(h.state.booking); assert.equal(h.state.changeService, undefined);
  const proposed = harness(); proposed.operation = 'booking_request'; await proposed.send('أرغب بجلسة جديدة');
  assert.equal(proposed.bridgeCalls, 1); assert.ok(proposed.state.booking); assert.equal(proposed.state.changeService, undefined);
});
test('service change retains date/time reselection via existing handler', async () => {
  const h = harness(); h.needsSlot = true;
  await h.send('تغيير خدمة'); await h.send('تقشير', 'ASK');
  assert.equal(h.state.changeService.step, 'awaiting_date');
  await h.send('2027-08-20', 'SOCIAL'); assert.equal(h.state.changeService.step, 'awaiting_time');
  await h.send('12:00', 'SOCIAL'); assert.equal(h.state.changeService.step, 'awaiting_confirmation');
  assert.equal(h.conversationCalls, 0);
});
test('bridge rejects unsupported enums, extra fields, and provider failure', async () => {
  for (const result of [{ operation: 'execute_sql' }, { operation: 'change_service_request', serviceId: id(5) }, null]) {
    const bridge = new OperationalIntentBridge({ async completeJson() { return { result }; } });
    assert.equal(await bridge.interpret({ currentMessage: 'message' }), null);
  }
  const bridge = new OperationalIntentBridge({ async completeJson() { throw new Error('offline'); } });
  assert.equal(await bridge.interpret({ currentMessage: 'message' }), null);
});
