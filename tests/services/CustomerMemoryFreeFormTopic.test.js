'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');
const ShadenConversationLayer = require('../../src/services/shaden/conversation/ShadenConversationLayer');
const CustomerMemoryRepository = require('../../src/repositories/CustomerMemoryRepository');

const clinic = { id: 'clinic-1', name: 'Clinic' };
const patient = { id: 'patient-1', full_name: 'Noura' };

test('meaningful free-form LLM candidate is grounded and writes the current conversation topic', async () => {
  const h = runtimeHarness({ candidate: { shouldUpdateTopic: true, topicText: 'تصبغات الاماكن الحساسة' } });
  await h.send('حابة اسأل عن تصبغات الاماكن الحساسة');
  assert.deepEqual(h.memoryWrites, [{
    memoryKey: 'recent_conversation_topic:conversation-1',
    memoryType: 'recent_conversation_topic',
    value: { topicText: 'تصبغات الاماكن الحساسة', sourceKind: 'free_form', serviceId: null, serviceName: null },
  }]);
});

test('candidate validator permits compact normalized wording but rejects unsupported inferred concepts', async () => {
  const validate = ShadenConversationLayer.validateTopicCandidate;
  assert.deepEqual(validate(
    { shouldUpdateTopic: true, topicText: 'تصبغات الأماكن الحساسة' },
    'حابة اسأل عن تصبغات الاماكن الحساسة'
  ), { shouldUpdateTopic: true, topicText: 'تصبغات الأماكن الحساسة' });
  assert.equal(validate(
    { shouldUpdateTopic: true, topicText: 'اضطراب هرموني' },
    'حابة اسأل عن تصبغات الاماكن الحساسة'
  ), null);
  assert.equal(validate(
    { shouldUpdateTopic: true, topicText: 'حابة اسأل عن تصبغات الاماكن الحساسة' },
    'حابة اسأل عن تصبغات الاماكن الحساسة'
  ), null);
});

test('semantic no-update candidates do not write greetings, acknowledgements, meta recall, or continuation', async () => {
  for (const message of ['greeting', 'thanks', 'acknowledgement', 'recall', 'continue']) {
    const h = runtimeHarness({ candidate: { shouldUpdateTopic: false, topicText: null } });
    await h.send(message);
    assert.equal(h.memoryWrites.length, 0, message);
  }
});

test('a later meaningful free-form turn reconciles the same current-conversation topic key', async () => {
  const h = runtimeHarness({ candidateForMessage: (message) => ({
    shouldUpdateTopic: true,
    topicText: message.includes('skin') ? 'concern skin' : 'concern hair',
  }) });
  await h.send('please discuss concern skin', 'message-1');
  await h.send('please discuss concern hair', 'message-2');
  assert.deepEqual(h.memoryWrites.map((write) => write.memoryKey), [
    'recent_conversation_topic:conversation-1',
    'recent_conversation_topic:conversation-1',
  ]);
  assert.equal(h.memoryWrites.at(-1).value.topicText, 'concern hair');
});

test('repository selects the newest free-form prior conversation topic before older structured topics', async () => {
  const repository = new CustomerMemoryRepository({ async query() {
    return { rows: [
      { value: { topicText: 'recent free form', sourceKind: 'free_form' }, sourceConversationId: 'conversation-2' },
      { value: { topicText: 'older service', sourceKind: 'structured_service' }, sourceConversationId: 'conversation-1' },
    ] };
  } });
  const topics = await repository.conversationTopics({
    clinicId: 'clinic-1', patientId: 'patient-1', currentConversationId: 'conversation-3',
  });
  assert.equal(topics.previousConversationTopic.value.topicText, 'recent free form');
});

test('outbound or state persistence failures cannot write a proposed free-form topic', async () => {
  const candidate = { shouldUpdateTopic: true, topicText: 'concern skin' };
  const outboundFailure = runtimeHarness({ candidate, sendFailure: true });
  await assert.rejects(() => outboundFailure.send('please discuss concern skin'));
  assert.equal(outboundFailure.memoryWrites.length, 0);
  const stateFailure = runtimeHarness({ candidate, stateFailure: true });
  await assert.rejects(() => stateFailure.send('please discuss concern skin'));
  assert.equal(stateFailure.memoryWrites.length, 0);
});

test('duplicate and stale interactive inputs cannot write a proposed free-form topic', async () => {
  const candidate = { shouldUpdateTopic: true, topicText: 'concern skin' };
  const duplicate = runtimeHarness({ candidate, duplicate: true });
  assert.deepEqual(await duplicate.send('concern skin'), { duplicate: true });
  assert.equal(duplicate.memoryWrites.length, 0);
  const stale = runtimeHarness({ candidate, stale: true });
  assert.deepEqual(await stale.send('concern skin'), { staleInteraction: true });
  assert.equal(stale.memoryWrites.length, 0);
});

test('free-form memory remains outside operational state', async () => {
  const h = runtimeHarness({ candidate: { shouldUpdateTopic: true, topicText: 'concern skin' } });
  const result = await h.send('concern skin');
  const price = result.state.data.shaden?.priceInquiry || {};
  for (const key of ['serviceId', 'paymentMethod', 'insuranceCompanyId', 'insuranceClassId', 'branchId', 'booking']) {
    assert.equal(key in price, false, key);
  }
});

function runtimeHarness({ candidate = null, candidateForMessage = null, sendFailure = false,
  stateFailure = false, duplicate = false, stale = false } = {}) {
  const memoryWrites = [];
  let state = { data: {} };
  const conversation = { id: 'conversation-1', patientId: patient.id, botEnabled: true };
  const memoryRepository = {
    async listActive() { return []; },
    async conversationTopics() { return {}; },
    async reconcile(input) {
      memoryWrites.push({ memoryKey: input.memoryKey, memoryType: input.memoryType, value: input.value });
      return input;
    },
  };
  const conversationService = stale ? {
    async reserveInboundMessage() { return { staleInteraction: true }; },
  } : {
    async findOrCreateForChannel() { return conversation; },
    async loadState() { return structuredClone(state); },
    async updateState(_id, next) {
      if (stateFailure) throw new Error('state persistence failed');
      state = structuredClone(next);
    },
  };
  const runtime = createShadenEngine({
    clinicService: { async resolveWhatsAppClinic() { return clinic; } },
    conversationService,
    patientService: { async resolveChannelIdentity() { return patient; } },
    messageRepository: stale ? { async findByWhatsAppMessageId() { return null; } } : {
      async findByExternalId() { return duplicate ? { id: 'existing' } : null; },
      async saveIncomingMessage() { return { id: 'incoming-1' }; },
      async getRecentMessages() { return []; },
      async saveOutgoingMessage() {},
    },
    customerMemoryRepository: memoryRepository,
    catalogService: { async list() { return []; } },
    clinicConfigurationSource: { async get() { return {}; } },
    conversationEnabled: true,
    conversationProvider: {
      async complete() { return { content: 'رد محادثة', toolCalls: [], assistantMessage: {}, model: 'test' }; },
      async completeTopicCandidate({ currentMessage }) {
        return candidateForMessage ? candidateForMessage(currentMessage) : candidate;
      },
    },
    semanticProvider: { async completeJson() { return { result: { status: 'UNKNOWN' } }; } },
    async sendMessage() {
      if (sendFailure) throw new Error('outbound failed');
      return { messageId: 'outgoing-1' };
    },
    logger: { info() {}, warn() {} },
  });
  return {
    memoryWrites,
    async send(text, waMessageId = 'incoming-1') {
      return runtime.processMessage({
        channel: 'whatsapp', waMessageId, senderPhone: '+966500000001',
        receiverPhone: '+966500000002', messageType: 'text', text, rawPayload: {},
      });
    },
  };
}
