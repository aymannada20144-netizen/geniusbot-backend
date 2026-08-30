'use strict';

const TOOL_DEFINITIONS = Object.freeze([
  toolDefinition(
    'get_clinic_catalog',
    'Required for any clinic question about specialties, services, treatments, capabilities, descriptions, whether something exists, branches, addresses, map links, or authoritative service-to-branch availability.'
  ),
  toolDefinition(
    'get_clinic_business_details',
    'Required for any clinic question about payment methods, accepted insurance companies or classes, and branch working hours.'
  ),
]);

class ShadenReadOnlyTools {
  constructor({ clinicData } = {}) {
    if (!clinicData || typeof clinicData !== 'object') {
      throw new TypeError('ShadenReadOnlyTools requires clinicData');
    }
    this.data = clinicData;
  }

  definitions() { return TOOL_DEFINITIONS; }

  async execute(name) {
    try {
      if (name === 'get_clinic_catalog') {
        return evidence(catalogEvidence(this.data));
      }
      if (name === 'get_clinic_business_details') {
        return evidence(businessEvidence(this.data));
      }
      return { status: 'NOT_FOUND', reason: 'UNKNOWN_READ_ONLY_TOOL' };
    } catch {
      return { status: 'FAILED', reason: 'READ_ONLY_TOOL_FAILURE' };
    }
  }
}

function catalogEvidence(data) {
  const branchById = new Map((data.branches || []).map((item) => [String(item.id), item]));
  const branchesByService = new Map();
  for (const pair of data.serviceBranchAssignments || []) {
    const key = String(pair.serviceId);
    const values = branchesByService.get(key) || [];
    const branch = branchById.get(String(pair.branchId));
    if (branch) values.push(branch.name);
    branchesByService.set(key, values);
  }
  const services = (data.services || []).map((service) => ({
    name: service.name,
    description: service.description || null,
    specialty: service.specialtyName || null,
    availableAt: unique(branchesByService.get(String(service.id)) || []),
  }));
  return {
    clinicName: data.clinic?.name || null,
    specialties: (data.specialties || []).map((specialty) => ({
      name: specialty.name,
      description: specialty.description || null,
      services: services.filter((service) => service.specialty === specialty.name),
    })),
    services,
    branches: (data.branches || []).map((branch) => ({
      name: branch.name,
      city: branch.city || null,
      address: branch.address || null,
      googleMapsUrl: branch.googleMapsUrl || null,
    })),
  };
}

function businessEvidence(data) {
  const branchById = new Map((data.branches || []).map((item) => [String(item.id), item.name]));
  const companyById = new Map((data.insuranceCompanies || []).map((item) => [String(item.id), item.name]));
  return {
    paymentMethods: (data.paymentMethods || []).map((item) => item.name).filter(Boolean),
    insuranceCompanies: (data.insuranceCompanies || []).map((item) => item.name).filter(Boolean),
    acceptedInsuranceClasses: (data.insuranceClasses || [])
      .filter((item) => item.isAccepted)
      .map((item) => ({
        company: companyById.get(String(item.insuranceCompanyId)) || null,
        name: item.name,
      })),
    workingHours: (data.workingHours || []).map((item) => ({
      branch: branchById.get(String(item.branchId)) || null,
      dayOfWeek: item.dayOfWeek,
      opensAt: item.opensAt,
      closesAt: item.closesAt,
      isClosed: item.isClosed,
    })),
  };
}

function toolDefinition(name, description) {
  return Object.freeze({
    type: 'function',
    function: {
      name, description,
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {}, required: [],
      },
    },
  });
}
function evidence(value) { return { status: 'EVIDENCE', value }; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

module.exports = Object.assign(ShadenReadOnlyTools, { TOOL_DEFINITIONS });
