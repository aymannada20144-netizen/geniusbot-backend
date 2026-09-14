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
    const displayName = normalizedDisplayName(patient?.full_name);
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
    };
  }
}

function normalizedDisplayName(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/gu, ' ').trim();
  return name && !/^(?:null|undefined)$/iu.test(name) ? name : null;
}

module.exports = ShadenConversationContextProvider;
