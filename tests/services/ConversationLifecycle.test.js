'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ConversationService = require('../../src/services/ConversationService');

function harness({ conversations = [] } = {}) {
  const rows = structuredClone(conversations);
  const messages = new Map();
  const client = { async query() { return { rows: [] }; } };
  const db = {
    async transaction(work) {
      const beforeRows = structuredClone(rows);
      const beforeMessages = new Map(messages);
      try { return await work(client); }
      catch (error) {
        rows.splice(0, rows.length, ...beforeRows);
        messages.clear(); for (const [key, value] of beforeMessages) messages.set(key, value);
        throw error;
      }
    },
  };
  let nextId = rows.length + 1;
  const repository = {
    db,
    async findActiveForLifecycle({ clinicId, channel, channelIdentity }) {
      return rows.find((row) => row.clinicId === clinicId && row.channel === channel &&
        row.channelIdentity === channelIdentity && row.status === 'open') || null;
    },
    async createForLifecycle({ clinicId, channel, channelIdentity }) {
      const row = { id: `conversation-${nextId++}`, clinicId, channel, channelIdentity,
        patientId: null, status: 'open', botEnabled: true, assignedToStaffId: null,
        startedAt: new Date().toISOString(), lastCustomerActivityAt: null,
        currentState: null, statePayload: { channelIdentity } };
      rows.push(row); return row;
    },
    async closeForLifecycle({ conversationId, reason }) {
      const row = rows.find((item) => item.id === conversationId);
      Object.assign(row, { status: 'closed', endedAt: new Date().toISOString(), closedReason: reason });
      return row;
    },
  };
  const messageRepository = {
    async findByWhatsAppMessageId(id) { return messages.get(id) || null; },
    async saveIncomingMessage({ conversationId, waMessageId, rawPayload }) {
      if (messages.has(waMessageId)) return { ...messages.get(waMessageId), inserted: false };
      const message = { id: `message-${messages.size + 1}`, conversationId, waMessageId,
        senderType: 'patient', rawPayload, inserted: true };
      messages.set(waMessageId, message); return message;
    },
  };
  return { rows, messages, service: new ConversationService(repository, { messageRepository, idleTimeoutMinutes: 60 }) };
}

function openConversation(overrides = {}) {
  return {
    id: 'conversation-1', clinicId: 'clinic-1', channel: 'whatsapp',
    channelIdentity: '+966500000001', patientId: null, status: 'open', botEnabled: true,
    assignedToStaffId: null, startedAt: new Date().toISOString(),
    lastCustomerActivityAt: new Date().toISOString(), currentState: 'shaden',
    statePayload: { channelIdentity: '+966500000001', shaden: { stale: true } },
    ...overrides,
  };
}

function inbound(waMessageId, extra = {}) {
  return { clinicId: 'clinic-1', channel: 'whatsapp', channelIdentity: '+966500000001',
    waMessageId, messageText: 'hello', rawPayload: { value: 'hello' }, ...extra };
}

test('reuses an active identity session and reserves the WAMID once', async () => {
  const h = harness({ conversations: [openConversation()] });
  const first = await h.service.reserveInboundMessage(inbound('wamid-1'));
  const duplicate = await h.service.reserveInboundMessage(inbound('wamid-1'));
  assert.equal(first.conversation.id, 'conversation-1');
  assert.equal(first.persistedIncomingMessage.inserted, true);
  assert.deepEqual(duplicate, { duplicate: true, conversation: null, persistedIncomingMessage: null });
  assert.equal(h.rows.filter((row) => row.status === 'open').length, 1);
});

test('a duplicate WAMID is rejected before a timed-out session can be closed or replaced', async () => {
  const staleAt = new Date(Date.now() - 61 * 60 * 1000).toISOString();
  const h = harness({ conversations: [openConversation({ lastCustomerActivityAt: staleAt })] });
  h.messages.set('wamid-replay', { id: 'old-inbound', conversationId: 'conversation-1',
    waMessageId: 'wamid-replay', senderType: 'patient', rawPayload: { value: 'old' } });
  const result = await h.service.reserveInboundMessage(inbound('wamid-replay'));
  assert.equal(result.duplicate, true);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].status, 'open');
});

test('timeout closes historical state and creates a clean session', async () => {
  const staleAt = new Date(Date.now() - 61 * 60 * 1000).toISOString();
  const h = harness({ conversations: [openConversation({ lastCustomerActivityAt: staleAt })] });
  const result = await h.service.reserveInboundMessage(inbound('wamid-timeout'));
  assert.equal(h.rows[0].status, 'closed');
  assert.equal(h.rows[0].closedReason, 'inactivity_timeout');
  assert.ok(h.rows[0].endedAt);
  assert.notEqual(result.conversation.id, h.rows[0].id);
  assert.deepEqual(result.conversation.statePayload, { channelIdentity: '+966500000001' });
  assert.equal(result.conversation.currentState, null);
});

test('human-owned sessions are never auto-closed by customer idle timeout', async () => {
  const staleAt = new Date(Date.now() - 61 * 60 * 1000).toISOString();
  const h = harness({ conversations: [openConversation({ botEnabled: false, lastCustomerActivityAt: staleAt })] });
  const result = await h.service.reserveInboundMessage(inbound('wamid-human'));
  assert.equal(result.conversation.id, 'conversation-1');
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].status, 'open');
});

test('interactive origin is accepted only for the selected session and offered option', async () => {
  const h = harness({ conversations: [openConversation()] });
  h.messages.set('wamid-origin', { id: 'out-1', conversationId: 'conversation-1', senderType: 'bot',
    rawPayload: { interaction: { optionIds: ['price-booking:yes', 'price-booking:no'] } } });
  const accepted = await h.service.reserveInboundMessage(inbound('wamid-answer', {
    interactiveOriginMessageId: 'wamid-origin', interactiveOptionId: 'price-booking:no',
  }));
  assert.equal(accepted.duplicate, false);
  const rejected = await h.service.reserveInboundMessage(inbound('wamid-bad-answer', {
    interactiveOriginMessageId: 'wamid-origin', interactiveOptionId: 'not-offered',
  }));
  assert.equal(rejected.staleInteraction, true);
  assert.equal(h.messages.has('wamid-bad-answer'), false);
});

test('cross-session interactive origin cannot create or mutate a later session', async () => {
  const staleAt = new Date(Date.now() - 61 * 60 * 1000).toISOString();
  const h = harness({ conversations: [openConversation({ lastCustomerActivityAt: staleAt })] });
  h.messages.set('wamid-old-origin', { id: 'out-old', conversationId: 'conversation-1', senderType: 'bot',
    rawPayload: { interaction: { optionIds: ['price-booking:yes'] } } });
  const result = await h.service.reserveInboundMessage(inbound('wamid-old-reply', {
    interactiveOriginMessageId: 'wamid-old-origin', interactiveOptionId: 'price-booking:yes',
  }));
  assert.equal(result.staleInteraction, true);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].status, 'open');
  assert.equal(h.messages.has('wamid-old-reply'), false);
});
