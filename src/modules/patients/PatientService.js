const {
  NotFoundError,
} = require('../../core/errors');

const {
  validateUuid,
  validateRequired,
} = require('../../core/validators/commonValidators');

class PatientService {
  constructor(patientRepository) {
    if (!patientRepository) {
      throw new Error(
        'PatientService requires patientRepository'
      );
    }

    this.patientRepository = patientRepository;
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
      phoneNumber
    );
  }

  async createPatient(data) {
    validateRequired(data, 'data');

    validateUuid(data.clinic_id, 'clinic_id');
    validateRequired(data.full_name, 'full_name');
    validateRequired(data.phone_number, 'phone_number');

    return this.patientRepository.createPatient(data);
  }

  async findOrCreateByClinicAndPhone(data) {
    validateRequired(data, 'data');

    validateUuid(data.clinic_id, 'clinic_id');
    validateRequired(data.phone_number, 'phone_number');

    return this.patientRepository.findOrCreateByClinicAndPhone(
      data
    );
  }

  async searchPatients(
    clinicId,
    options = {}
  ) {
    validateUuid(clinicId, 'clinicId');

    return this.patientRepository.searchPatients(
      clinicId,
      options
    );
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