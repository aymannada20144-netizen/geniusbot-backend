const {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} = require('../../core/errors');

const {
  validateUuid,
  validateRequired,
} = require('../../core/validators/commonValidators');
const { normalizeSaudiMobile } = require('../../core/validators/saudiMobile');
const PatientLifecycleError = require('./PatientLifecycleError');

class PatientService {
  constructor(patientRepository, dependencies = {}) {
    if (!patientRepository) {
      throw new Error(
        'PatientService requires patientRepository'
      );
    }

    this.patientRepository = patientRepository;
    Object.assign(this, dependencies);
  }

  async getPatientById(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    const patient =
      await this.patientRepository.findByClinicAndId(
        clinicId,
        patientId
      );

    if (!patient) {
      throw new NotFoundError('Patient not found.');
    }

    return patient;
  }

  async findByPhone(clinicId, phoneNumber) {
    validateUuid(clinicId, 'clinicId');
    validateRequired(phoneNumber, 'phoneNumber');

    return this.patientRepository.findByClinicAndPhone(
      clinicId,
      normalizeSaudiMobile(phoneNumber, 'phoneNumber')
    );
  }

  async createPatient(clinicId, data) {
    validateUuid(clinicId, 'clinicId');
    const normalized = this.#normalizePatient(data, false);
    const duplicate = await this.patientRepository.findByClinicAndPhone(
      clinicId,
      normalized.phone_number
    );
    if (duplicate) {
      throw new PatientLifecycleError(
        'PATIENT_PHONE_DUPLICATE',
        'A patient with this phone number already exists.',
        409
      );
    }
    if (normalized.whatsapp_id) {
      const whatsappDuplicate =
        await this.patientRepository.findByClinicAndWhatsApp(
          clinicId,
          normalized.whatsapp_id
        );
      if (whatsappDuplicate) {
        throw new ConflictError(
          'A patient with this WhatsApp number already exists.'
        );
      }
    }
    return this.patientRepository.createPatient({
      clinic_id: clinicId,
      ...normalized,
    });
  }

  async resolveChannelIdentity(clinicId, channelIdentity) {
    validateRequired(clinicId, 'clinicId');
    validateRequired(channelIdentity, 'channelIdentity');
    return this.patientRepository.findByClinicAndChannelIdentity(
      clinicId,
      normalizeSaudiMobile(channelIdentity, 'channelIdentity')
    );
  }

  async updatePatient(clinicId, patientId, data) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');
    await this.getPatientById(clinicId, patientId);
    const normalized = this.#normalizePatient(data, true);
    if (normalized.phone_number) {
      const duplicate = await this.patientRepository.findByClinicAndPhone(
        clinicId,
        normalized.phone_number
      );
      if (duplicate && duplicate.id !== patientId) {
        throw new PatientLifecycleError(
          'PATIENT_PHONE_DUPLICATE',
          'A patient with this phone number already exists.',
          409
        );
      }
    }
    if (normalized.whatsapp_id) {
      const duplicate =
        await this.patientRepository.findByClinicAndWhatsApp(
          clinicId,
          normalized.whatsapp_id
        );
      if (duplicate && duplicate.id !== patientId) {
        throw new ConflictError(
          'A patient with this WhatsApp number already exists.'
        );
      }
    }
    const patient = await this.patientRepository.updatePatient(
      clinicId,
      patientId,
      normalized
    );
    if (!patient) throw new NotFoundError('Patient not found.');
    return patient;
  }

  async getAppointments(clinicId, patientId) {
    await this.getPatientById(clinicId, patientId);
    return this.patientRepository.getAppointments(clinicId, patientId);
  }

  async findOrCreateByClinicAndPhone(data) {
    validateRequired(data, 'data');

    validateUuid(data.clinic_id, 'clinic_id');
    validateRequired(data.phone_number, 'phone_number');

    return this.patientRepository.findOrCreateByClinicAndPhone({
      ...data,
      phone_number: normalizeSaudiMobile(data.phone_number, 'phone_number'),
    });
  }

  async searchPatients(
    clinicId,
    options = {}
  ) {
    validateUuid(clinicId, 'clinicId');

    const patients = await this.patientRepository.searchPatients(
      clinicId,
      options
    );

    return patients.map((patient) => ({
      id: patient.id,
      fullName: patient.full_name,
      phoneNumber: patient.phone_number,
      email: patient.email ?? null,
      isActive: patient.is_active === true,
      updatedAt: patient.updated_at,
      createdAt: patient.created_at,
      totalAppointments: patient.total_appointments,
      latestAppointmentDate: patient.latest_appointment_date ?? null,
      latestAppointmentStatus: patient.latest_appointment_status ?? null,
      hasUpcomingAppointment: patient.has_upcoming_appointment === true,
      conversationId: patient.conversation_id ?? null,
      handlingMode: patient.conversation_id
        ? (patient.bot_enabled === false ? 'HUMAN_HANDLING' : 'AI_HANDLING')
        : null,
    }));
  }

  async getConversation(clinicId, patientId) {
    const patient = await this.getPatientById(clinicId, patientId);
    const conversation = await this.conversationRepository.findForPatient(clinicId, patientId);
    if (!conversation) {
      return { patient: this.#patientSummary(patient), conversation: null,
        ownership: null, messages: [] };
    }
    const messages = await this.messageRepository.getRecentMessages({
      conversationId: conversation.id, limit: 100,
    });
    return {
      patient: this.#patientSummary(patient),
      conversation: { id: conversation.id, status: conversation.status },
      ownership: conversation.bot_enabled === false ? 'HUMAN_HANDLING' : 'AI_HANDLING',
      messages,
    };
  }

  async takeOver(clinicId, conversationId, staffId) {
    validateUuid(clinicId, 'clinicId'); validateUuid(conversationId, 'conversationId');
    validateUuid(staffId, 'staffId');
    const conversation = await this.conversationRepository.setHumanHandling(clinicId, conversationId, staffId);
    if (!conversation) throw new NotFoundError('Conversation not found.');
    return { id: conversation.id, ownership: 'HUMAN_HANDLING' };
  }

  async startHumanConversation(clinicId, patientId, staffId) {
    validateUuid(clinicId, 'clinicId'); validateUuid(patientId, 'patientId');
    validateUuid(staffId, 'staffId');
    const patient = await this.getPatientById(clinicId, patientId);
    let conversation = await this.conversationRepository.findForPatient(clinicId, patientId);
    if (!conversation) {
      const channelIdentity = patient.whatsapp_id || patient.phone_number;
      if (!channelIdentity) throw new TypeError('Patient WhatsApp recipient is missing.');
      conversation = await this.conversationRepository.create({
        clinicId, channel: 'whatsapp', channelIdentity,
      });
    }
    const updated = await this.conversationRepository.setHumanHandling(
      clinicId, conversation.id, staffId
    );
    if (!updated) throw new NotFoundError('Conversation not found.');
    return { id: updated.id, status: updated.status, ownership: 'HUMAN_HANDLING' };
  }

  async returnToShaden(clinicId, conversationId) {
    validateUuid(clinicId, 'clinicId'); validateUuid(conversationId, 'conversationId');
    const conversation = await this.conversationRepository.setAiHandling(clinicId, conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found.');
    return { id: conversation.id, ownership: 'AI_HANDLING' };
  }

  async sendHumanMessage(clinicId, conversationId, staffId, body) {
    validateUuid(clinicId, 'clinicId'); validateUuid(conversationId, 'conversationId');
    validateUuid(staffId, 'staffId'); validateRequired(body, 'body');
    if (typeof body !== 'string' || !body.trim()) {
      throw new ValidationError('body is required.');
    }
    const conversation = await this.conversationRepository.findForClinic(clinicId, conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found.');
    if (conversation.bot_enabled !== false) {
      const { ConflictError } = require('../../core/errors');
      throw new ConflictError('Human takeover is required before sending.');
    }
    const recipient = conversation.patient_whatsapp_id || conversation.patient_phone;
    if (!recipient) throw new TypeError('Patient WhatsApp recipient is missing.');
    let delivery;
    try {
      delivery = await this.sendMessage({ to: recipient, body: body.trim() });
    } catch (error) {
      const deliveryError = new AppError(
        'WhatsApp delivery failed. Please try again.',
        502,
        'WHATSAPP_DELIVERY_FAILED'
      );
      deliveryError.cause = error;
      throw deliveryError;
    }
    const message = await this.messageRepository.saveStaffMessage({
      conversationId, messageText: body.trim(), waMessageId: delivery.messageId, staffId,
    });
    return { message, delivery };
  }

  #patientSummary(patient) {
    return { id: patient.id, fullName: patient.full_name, phoneNumber: patient.phone_number };
  }

  #normalizePatient(input, partial) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError('Patient data is required.');
    }
    const allowed = partial
      ? ['full_name', 'phone_number', 'whatsapp_id', 'email', 'gender', 'birth_date', 'notes']
      : ['full_name', 'phone_number', 'whatsapp_id', 'email', 'gender', 'birth_date', 'source', 'notes'];
    const unknown = Object.keys(input).filter((field) => !allowed.includes(field));
    if (unknown.length) {
      throw new PatientLifecycleError(
        'PATIENT_UNKNOWN_FIELD',
        `Unsupported patient field: ${unknown[0]}.`
      );
    }
    const data = {};
    for (const field of allowed) {
      if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
      let value = input[field];
      if (typeof value === 'string') value = value.trim();
      data[field] = value === '' ? null : value;
    }
    if (!partial) {
      if (!data.full_name) throw new ValidationError('full_name is required.');
      if (!data.phone_number) throw new ValidationError('phone_number is required.');
      data.source ??= 'unknown';
      data.is_active = true;
    }
    if (data.full_name !== undefined && data.full_name === null) {
      throw new ValidationError('full_name cannot be blank.');
    }
    if (data.full_name !== undefined && typeof data.full_name !== 'string') {
      throw new ValidationError('full_name must be a string.');
    }
    if (typeof data.full_name === 'string' && data.full_name.length > 255) {
      throw new ValidationError('full_name must not exceed 255 characters.');
    }
    if (data.phone_number !== undefined) {
      data.phone_number = normalizeSaudiMobile(
        data.phone_number,
        'phone_number'
      );
    }
    if (data.whatsapp_id !== undefined) {
      data.whatsapp_id = normalizeSaudiMobile(
        data.whatsapp_id,
        'whatsapp_id',
        true
      );
    }
    if (
      data.gender !== undefined &&
      data.gender !== null &&
      !['male', 'female'].includes(data.gender)
    ) {
      throw new ValidationError('gender must be female or male.');
    }
    if (
      data.email !== undefined &&
      data.email !== null &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    ) {
      throw new ValidationError('email is invalid.');
    }
    if (typeof data.email === 'string' && data.email.length > 255) {
      throw new ValidationError('email must not exceed 255 characters.');
    }
    if (
      data.birth_date &&
      new Date(`${data.birth_date}T00:00:00Z`) > new Date()
    ) {
      throw new ValidationError('birth_date cannot be in the future.');
    }
    return data;
  }

  async setActiveStatus(clinicId, patientId, body) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, 'is_active') ||
        typeof body.is_active !== 'boolean') {
      throw new PatientLifecycleError(
        'PATIENT_STATUS_INVALID',
        'is_active must be the only field and must be a boolean.'
      );
    }
    const patient = await this.patientRepository.setActiveStatus(
      clinicId,
      patientId,
      body.is_active
    );
    if (!patient) throw new NotFoundError('Patient not found.');
    return patient;
  }

  async deletePatient(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');
    const result = await this.patientRepository.deleteSafely(clinicId, patientId);
    if (!result.patient) throw new NotFoundError('Patient not found.');
    if (result.blockers.length) {
      throw new PatientLifecycleError(
        'PATIENT_DELETE_BLOCKED',
        'This patient has historical or operational records. Deactivate the patient instead.',
        409,
        { blockers: result.blockers }
      );
    }
    return result.patient;
  }

  async updateLastSeen(
    clinicId,
    patientId
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    return this.patientRepository.updateLastSeen(
      clinicId,
      patientId
    );
  }

  async deactivate(
    clinicId,
    patientId
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    const patient =
      await this.patientRepository.deactivate(
        clinicId,
        patientId
      );

    if (!patient) {
      throw new NotFoundError('Patient not found.');
    }

    return patient;
  }

  async reactivate(
    clinicId,
    patientId
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    const patient =
      await this.patientRepository.reactivate(
        clinicId,
        patientId
      );

    if (!patient) {
      throw new NotFoundError('Patient not found.');
    }

    return patient;
  }
}

module.exports = PatientService;
