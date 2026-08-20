'use strict';

const {
  createClinicDomainConstraints,
} = require('../../contracts/shaden/ClinicDomainConstraints');

class ClinicDomainQuery {
  constructor({ serviceRepository, branchRepository, serviceAssignmentRepository } = {}) {
    requireMethod(serviceRepository, 'findBookableByClinicId');
    requireMethod(branchRepository, 'findActiveByClinicId');
    requireMethod(serviceAssignmentRepository, 'listActiveDomainAssignments');
    this.serviceRepository = serviceRepository;
    this.branchRepository = branchRepository;
    this.serviceAssignmentRepository = serviceAssignmentRepository;
  }

  async servicesMatching(clinicId, constraints = {}) {
    const domain = await this.#load(clinicId, constraints);
    const eligibleServiceIds = new Set(domain.assignments.map(rowServiceId));
    return Object.freeze(domain.services
      .filter((service) => !domain.constraints.specialtyId ||
        String(service.specialty_id) === domain.constraints.specialtyId)
      .filter((service) => !domain.constraints.serviceId ||
        String(service.id) === domain.constraints.serviceId)
      .filter((service) => eligibleServiceIds.has(String(service.id)))
      .map(frozenCopy));
  }

  async branchesMatching(clinicId, constraints = {}) {
    const domain = await this.#load(clinicId, constraints);
    const eligibleBranchIds = new Set(domain.assignments.map(rowBranchId));
    return Object.freeze(domain.branches
      .filter((branch) => !domain.constraints.city ||
        normalizedCity(branch.city) === normalizedCity(domain.constraints.city))
      .filter((branch) => !domain.constraints.branchId ||
        String(branch.id) === domain.constraints.branchId)
      .filter((branch) => eligibleBranchIds.has(String(branch.id)))
      .map(frozenCopy));
  }

  async #load(clinicId, input) {
    if (!clinicId) throw new TypeError('ClinicDomainQuery requires clinicId.');
    const constraints = createClinicDomainConstraints(input);
    const [services, branches, rows] = await Promise.all([
      this.serviceRepository.findBookableByClinicId(clinicId),
      this.branchRepository.findActiveByClinicId(clinicId),
      this.serviceAssignmentRepository.listActiveDomainAssignments(clinicId),
    ]);
    const branchById = new Map(branches.map((branch) => [String(branch.id), branch]));
    const specialtyServiceIds = new Set(services
      .filter((service) => !constraints.specialtyId ||
        String(service.specialty_id) === constraints.specialtyId)
      .map((service) => String(service.id)));
    const assignments = rows.filter((row) => {
      const branch = branchById.get(rowBranchId(row));
      return branch &&
        specialtyServiceIds.has(rowServiceId(row)) &&
        (!constraints.serviceId || rowServiceId(row) === constraints.serviceId) &&
        (!constraints.branchId || rowBranchId(row) === constraints.branchId) &&
        (!constraints.city || normalizedCity(branch.city) === normalizedCity(constraints.city)) &&
        (!constraints.doctorId || String(row.doctor_id) === constraints.doctorId);
    });
    return { constraints, services, branches, assignments };
  }
}

function rowServiceId(row) { return String(row.service_id); }
function rowBranchId(row) { return String(row.branch_id); }
function normalizedCity(value) { return String(value || '').trim().toLocaleLowerCase('ar'); }
function frozenCopy(value) { return Object.freeze({ ...value }); }
function requireMethod(value, method) {
  if (typeof value?.[method] !== 'function') {
    throw new TypeError(`ClinicDomainQuery requires ${method}().`);
  }
}

module.exports = ClinicDomainQuery;
