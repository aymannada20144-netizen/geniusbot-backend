'use strict';

const PatientIdentityConflictError = require(
  '../../core/errors/PatientIdentityConflictError'
);

class ShadenConversationContextProvider {
  constructor({ patientService, patientRepository } = {}) {
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
    return {
      patient: patient ? {
        id: patient.id,
        fullName: patient.full_name || null,
      } : null,
      customerName: patient?.full_name || null,
      customerNameSource: patient ? 'patients.full_name' : 'current_conversation_state',
    };
  }
}

module.exports = ShadenConversationContextProvider;
