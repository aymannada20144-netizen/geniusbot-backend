'use strict';

const { NotFoundError } = require('../core/errors');
const { validateUuid } = require('../core/validators/commonValidators');

class ConversationService {
  constructor(conversationRepository) {
    if (!conversationRepository) {
      throw new TypeError(
        'ConversationService requires conversationRepository.'
      );
    }
    this.conversationRepository = conversationRepository;
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

module.exports = ConversationService;
