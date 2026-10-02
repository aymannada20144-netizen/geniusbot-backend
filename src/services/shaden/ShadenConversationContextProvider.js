'use strict';

const PatientIdentityConflictError = require(
  '../../core/errors/PatientIdentityConflictError'
);

class ShadenConversationContextProvider {
  constructor({ patientService, patientRepository, customerMemoryRepository = null } = {}) {
    this.patientService = patientService || (patientRepository ? {
      resolveChannelIdentity: (clinicId, channelIdentity) =>
        patientRepository.findByClinicAndChannelIdentity(
          clinicId,
          channelIdentity
        ),
    } : null);
    if (typeof this.patientService?.resolveChannelIdentity !== 'function') {
      throw new TypeError(
        'ShadenConversationContextProvider requires patientService.resolveChannelIdentity().'
      );
    }
    this.customerMemoryRepository = customerMemoryRepository;
  }

  async load({ clinicId, channelIdentity, conversation }) {
    const patient = await this.patientService.resolveChannelIdentity(
      clinicId,
      channelIdentity
    );
    const resolvedPatientId = patient?.id || null;
    const conversationPatientId = conversation?.patientId || null;
    if (resolvedPatientId !== conversationPatientId) {
      throw new PatientIdentityConflictError(
        'Conversation patient does not match the patient resolved from the current sender.',
        'CONVERSATION_PATIENT_MISMATCH'
      );
    }
    const displayName = normalizedDisplayName(patient?.full_name);
    const memories = patient && typeof this.customerMemoryRepository?.listActive === 'function'
      ? await this.customerMemoryRepository.listActive({ clinicId, patientId: patient.id })
      : [];
    const conversationTopics = patient && typeof this.customerMemoryRepository?.conversationTopics === 'function'
      ? await this.customerMemoryRepository.conversationTopics({ clinicId, patientId: patient.id, currentConversationId: conversation?.id })
      : {};
    return {
      patient: patient ? {
        id: patient.id,
        fullName: displayName,
      } : null,
      // This is the single customer identity boundary for the Shaden runtime.
      // Downstream code must not independently read a patient or WhatsApp profile.
      customer: patient ? {
        id: patient.id,
        displayName,
        firstName: displayName?.split(/\s+/u)[0] || null,
      } : null,
      customerName: displayName,
      customerNameSource: patient ? 'patients.full_name' : 'current_conversation_state',
      // Context only: operational reducers must never read this as session state.
      customerMemory: compactMemory(memories, conversationTopics),
    };
  }
}

function compactMemory(memories, topics = {}) {
  const rows = Array.isArray(memories) ? memories : [];
  return Object.freeze({
    profile: [],
    confirmedPreferences: rows.filter((row) => row.evidenceLevel !== 'contextual'),
    recentTopics: rows.filter((row) => row.memoryType === 'discussed_service'),
    recentCompletedActivities: rows.filter((row) => row.memoryType === 'completed_booking'),
    currentConversationTopic: topics.currentConversationTopic?.value || null,
    previousConversationTopic: topics.previousConversationTopic?.value || null,
  });
}

function normalizedDisplayName(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/gu, ' ').trim();
  return name && !/^(?:null|undefined)$/iu.test(name) ? name : null;
}

module.exports = ShadenConversationContextProvider;
