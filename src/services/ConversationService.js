'use strict';

const { NotFoundError } = require('../core/errors');
const { validateUuid } = require('../core/validators/commonValidators');
const { normalizeSaudiMobile } = require('../core/validators/saudiMobile');

class ConversationService {
  constructor(conversationRepository, {
    messageRepository = null,
    idleTimeoutMinutes = 60,
  } = {}) {
    if (!conversationRepository) {
      throw new TypeError(
        'ConversationService requires conversationRepository.'
      );
    }
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    if (!Number.isInteger(idleTimeoutMinutes) || idleTimeoutMinutes < 1) {
      throw new TypeError('Conversation idle timeout must be a positive integer.');
    }
    this.idleTimeoutMinutes = idleTimeoutMinutes;
  }

  async findOrCreateForChannel({ clinicId, channel, channelIdentity }) {
    let conversation =
      await this.conversationRepository.findActiveByChannelIdentity({
        clinicId,
        channel,
        channelIdentity,
      });
    if (!conversation) {
      conversation = await this.conversationRepository.create({
        clinicId,
        channel,
        channelIdentity,
      });
    }
    return conversation;
  }

  /**
   * Reserves one provider inbound message before any session state is read or
   * written. This deliberately remains synchronous Phase-1 processing: it
   * protects ingress/session selection, not outbound delivery recovery.
   */
  async reserveInboundMessage({
    clinicId, channel, channelIdentity, waMessageId, messageText, rawPayload,
    interactiveOriginMessageId = null, interactiveOptionId = null,
  } = {}) {
    if (!this.messageRepository ||
        typeof this.messageRepository.findByWhatsAppMessageId !== 'function' ||
        typeof this.conversationRepository?.db?.transaction !== 'function') {
      throw new TypeError('Conversation ingress reservation requires transactional repositories.');
    }
    const normalizedIdentity = normalizeSaudiMobile(channelIdentity, 'channelIdentity');
    const normalizedChannel = String(channel || '').trim().toLowerCase();
    const normalizedWamId = String(waMessageId || '').trim();
    if (!normalizedChannel || !normalizedWamId) {
      throw new TypeError('Conversation ingress reservation requires channel and waMessageId.');
    }
    try {
      return await this.conversationRepository.db.transaction(async (client) => {
        await advisoryLock(client, `wamid:${normalizedWamId}`);
        if (await this.messageRepository.findByWhatsAppMessageId(normalizedWamId, { queryable: client })) {
          return { duplicate: true, conversation: null, persistedIncomingMessage: null };
        }

        await advisoryLock(client, `conversation:${clinicId}:${normalizedChannel}:${normalizedIdentity}`);
        if (await this.messageRepository.findByWhatsAppMessageId(normalizedWamId, { queryable: client })) {
          return { duplicate: true, conversation: null, persistedIncomingMessage: null };
        }

        let conversation = await this.conversationRepository.findActiveForLifecycle({
          clinicId, channel: normalizedChannel, channelIdentity: normalizedIdentity, queryable: client,
        });
        if (!conversation) {
          conversation = await this.conversationRepository.createForLifecycle({
            clinicId, channel: normalizedChannel, channelIdentity: normalizedIdentity, queryable: client,
          });
        } else if (!isHumanOwned(conversation) && isIdle(conversation, this.idleTimeoutMinutes)) {
          await this.conversationRepository.closeForLifecycle({
            conversationId: conversation.id, reason: 'inactivity_timeout', queryable: client,
          });
          conversation = await this.conversationRepository.createForLifecycle({
            clinicId, channel: normalizedChannel, channelIdentity: normalizedIdentity, queryable: client,
          });
        }

        if (interactiveOriginMessageId !== null || interactiveOptionId !== null) {
          const origin = interactiveOriginMessageId
            ? await this.messageRepository.findByWhatsAppMessageId(
              interactiveOriginMessageId,
              { queryable: client }
            )
            : null;
          const offered = origin?.rawPayload?.interaction?.optionIds;
          if (origin?.senderType !== 'bot' ||
              origin.conversationId !== conversation.id ||
              !Array.isArray(offered) || !offered.includes(interactiveOptionId)) {
            throw new StaleInteractiveReplyError();
          }
        }

        const persistedIncomingMessage = await this.messageRepository.saveIncomingMessage({
          conversationId: conversation.id,
          waMessageId: normalizedWamId,
          messageText,
          rawPayload,
          queryable: client,
        });
        if (persistedIncomingMessage.inserted !== true) {
          throw new DuplicateInboundMessageError();
        }
        return { duplicate: false, conversation, persistedIncomingMessage };
      });
    } catch (error) {
      if (error instanceof DuplicateInboundMessageError) {
        return { duplicate: true, conversation: null, persistedIncomingMessage: null };
      }
      if (error instanceof StaleInteractiveReplyError) {
        return { staleInteraction: true, duplicate: false, conversation: null, persistedIncomingMessage: null };
      }
      throw error;
    }
  }

  async loadState(conversationId) {
    return this.conversationRepository.loadState(conversationId);
  }

  async updateState(conversationId, state) {
    return this.conversationRepository.updateState(conversationId, state);
  }

  async attachPatient(conversationId, patientId) {
    return this.conversationRepository.attachPatient(
      conversationId,
      patientId
    );
  }

  async getForClinic(clinicId, conversationId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(conversationId, 'conversationId');
    const conversation = await this.conversationRepository.findForClinic(
      clinicId,
      conversationId
    );
    if (!conversation) throw new NotFoundError('Conversation not found.');
    return conversation;
  }

  async takeOver(clinicId, conversationId, staffId) {
    validateUuid(staffId, 'staffId');
    await this.getForClinic(clinicId, conversationId);
    return this.conversationRepository.setHumanHandling(
      clinicId,
      conversationId,
      staffId
    );
  }

  async returnToAssistant(clinicId, conversationId) {
    await this.getForClinic(clinicId, conversationId);
    return this.conversationRepository.setAiHandling(
      clinicId,
      conversationId
    );
  }

  async close(clinicId, conversationId) {
    await this.getForClinic(clinicId, conversationId);
    return this.conversationRepository.close(conversationId);
  }
}

class DuplicateInboundMessageError extends Error {}
class StaleInteractiveReplyError extends Error {}

function isHumanOwned(conversation) {
  return conversation.botEnabled === false || Boolean(conversation.assignedToStaffId);
}

function isIdle(conversation, timeoutMinutes) {
  const timestamp = conversation.lastCustomerActivityAt || conversation.startedAt;
  const activity = new Date(timestamp);
  return Number.isFinite(activity.getTime()) &&
    Date.now() - activity.getTime() >= timeoutMinutes * 60 * 1000;
}

async function advisoryLock(client, value) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [value]
  );
}

module.exports = ConversationService;
