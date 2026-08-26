'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createShadenEngine = require('../../src/services/shaden/createShadenEngine');

test('free text reaches the single deterministic operational engine', async () => {
  const calls = [];
  const runtime = createShadenEngine({
    clinicService: {
      async resolveWhatsAppClinic() { return { id: 'clinic-1', name: 'Clinic' }; },
    },
    conversationService: {
      async findOrCreateForChannel() {
        return { id: 'conversation-1', patientId: null, botEnabled: true };
      },
      async loadState() { return { data: {} }; },
      async updateState() {},
    },
    patientService: { async resolveChannelIdentity() { return null; } },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() {},
      async saveOutgoingMessage() {},
    },
    catalogService: { async list() { return []; } },
    clinicConfigurationSource: { async get() { return {}; } },
    shadenEngine: {
      async handle(input) {
        calls.push(input);
        return {
          reply: 'deterministic',
          nextState: {},
          undeclaredLifecycleReason: 'legacy_undeclared',
        };
      },
    },
    logger: { info() {} },
    async sendMessage() { return { messageId: 'out-1' }; },
  });
  const result = await runtime.processMessage({
    channel: 'whatsapp', waMessageId: 'in-1',
    senderPhone: '+966500000001', receiverPhone: '+966500000002',
    messageType: 'text', text: 'hello', rawPayload: {},
  });
  assert.equal(result.replyText, 'deterministic');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.text, 'hello');
  assert.equal('dialogueDecision' in calls[0], false);
  assert.equal('authoritativeInquiry' in calls[0], false);
});
