'use strict';

class ShadenService {
  constructor(dependencies) {
    Object.assign(this, dependencies);
  }

  async processMessage(rawMessage) {
    if (!rawMessage || rawMessage.messageType !== 'text' || !rawMessage.text) return null;
    const clinic = await this.clinicRepository.findByWhatsAppNumber(rawMessage.receiverPhone);
    if (!clinic) throw new Error('WhatsApp clinic could not be resolved.');
    let patient = await this.patientRepository.findByClinicAndPhone(clinic.id, rawMessage.senderPhone);
    if (!patient) {
      patient = await this.patientRepository.findOrCreateByClinicAndPhone({
        clinic_id: clinic.id, full_name: rawMessage.senderPhone,
        phone_number: rawMessage.senderPhone, whatsapp_id: rawMessage.senderPhone,
        source: 'whatsapp_direct',
      });
    }
    let conversation = await this.conversationRepository.findActiveByChannelIdentity({
      clinicId: clinic.id, channel: 'whatsapp', channelIdentity: rawMessage.senderPhone,
    });
    if (!conversation) {
      conversation = await this.conversationRepository.create({
        clinicId: clinic.id, channel: 'whatsapp', channelIdentity: rawMessage.senderPhone,
      });
    }
    const duplicate = await this.messageRepository.findByExternalId(
      conversation.id,
      rawMessage.waMessageId
    );
    if (duplicate) return { duplicate: true };
    await this.messageRepository.saveIncomingMessage({
      conversationId: conversation.id, waMessageId: rawMessage.waMessageId,
      messageText: rawMessage.text, rawPayload: rawMessage.rawPayload,
    });
    if (conversation.botEnabled === false) return { suppressed: true };
    const messages = await this.messageRepository.getRecentMessages({ conversationId: conversation.id, limit: 20 });
    const reply = await this.aiClient.reply({ patientName: patient.full_name, messages, message: rawMessage.text });
    const delivery = await this.sendMessage({ to: rawMessage.senderPhone, body: reply });
    await this.messageRepository.saveOutgoingMessage({
      conversationId: conversation.id, messageText: reply,
      waMessageId: delivery.messageId, rawPayload: { delivery },
    });
    return { suppressed: false };
  }
}

module.exports = ShadenService;
