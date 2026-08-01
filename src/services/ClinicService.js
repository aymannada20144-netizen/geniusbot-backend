'use strict';

const { NotFoundError, ValidationError } = require('../core/errors');
const { validateUuid } = require('../core/validators/commonValidators');

class ClinicService {
  constructor(clinicRepository, branchRepository = null) {
    if (!clinicRepository) {
      throw new TypeError('ClinicService requires clinicRepository.');
    }
    this.clinicRepository = clinicRepository;
    this.branchRepository = branchRepository;
  }

  async getActiveClinic(clinicId) {
    validateUuid(clinicId, 'clinicId');
    const clinic = await this.clinicRepository.findById(clinicId);
    if (!clinic || clinic.is_active !== true) {
      throw new NotFoundError('Clinic not found or inactive.');
    }
    return clinic;
  }

  async resolveWhatsAppClinic({ phoneNumberId, displayPhoneNumber } = {}) {
    return this.clinicRepository.resolveWhatsAppClinic({
      phoneNumberId,
      displayPhoneNumber,
    });
  }

  async getActiveBranch(clinicId, branchId) {
    if (!this.branchRepository) {
      throw new Error('Branch repository is not configured.');
    }
    validateUuid(clinicId, 'clinicId');
    validateUuid(branchId, 'branchId');
    const branch = await this.branchRepository.findActiveById(
      clinicId,
      branchId
    );
    if (!branch) throw new NotFoundError('Branch not found or inactive.');
    return branch;
  }

  async updateClinic(clinicId, input = {}) {
    validateUuid(clinicId, 'clinicId');
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError('Clinic body must be an object.');
    }
    const clinic = await this.clinicRepository.updateClinic(clinicId, input);
    if (!clinic) throw new NotFoundError('Clinic not found.');
    return clinic;
  }
}

module.exports = ClinicService;
