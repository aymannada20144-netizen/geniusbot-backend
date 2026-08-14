'use strict';

class ShadenDataProvider {
  constructor({ catalogService, clinicConfigurationSource } = {}) {
    if (typeof catalogService?.list !== 'function') {
      throw new TypeError('ShadenDataProvider requires catalogService.list().');
    }
    this.catalogService = catalogService;
    if (typeof clinicConfigurationSource?.get !== 'function') {
      throw new TypeError('ShadenDataProvider requires clinicConfigurationSource.get().');
    }
    this.clinicConfigurationSource = clinicConfigurationSource;
  }

  async load(clinic) {
    if (!clinic?.id) throw new TypeError('Clinic is required.');
    const clinicId = clinic.id;
    const [
      branches,
      specialties,
      services,
      paymentMethods,
      insuranceCompanies,
      insuranceClasses,
      workingHours,
      assistantIdentity,
    ] = await Promise.all([
      this.catalogService.list('branches', clinicId, { active: true }),
      this.catalogService.list('specialties', clinicId, { active: true }),
      this.catalogService.list('services', clinicId, { active: true }),
      this.catalogService.list('payment-methods', clinicId, { active: true }),
      this.catalogService.list('insurance-companies', clinicId, { active: true }),
      this.catalogService.list('insurance-classes', clinicId, {}),
      this.catalogService.list('branch-working-hours', clinicId, {}),
      this.clinicConfigurationSource.get(clinicId),
    ]);
    return {
      clinic: {
        id: clinic.id,
        name: clinic.display_name_ar || clinic.name || null,
      },
      assistantIdentity: {
        name: assistantIdentity.assistantName,
        gender: assistantIdentity.assistantGender,
      },
      branches: active(branches).map(branchFact),
      specialties: active(specialties).map(named),
      services: active(services).map(serviceFact),
      paymentMethods: active(paymentMethods).map((method) => ({
        ...named(method),
        code: method.code || null,
      })),
      insuranceCompanies: active(insuranceCompanies).map(named),
      insuranceClasses: insuranceClasses.map((item) => ({
        id: item.id,
        insuranceCompanyId: item.insurance_company_id || null,
        name: item.display_name_ar || item.class_name || null,
        isAccepted: item.is_accepted === true,
      })),
      workingHours: workingHours.map((item) => ({
        branchId: item.branch_id,
        dayOfWeek: Number(item.day_of_week),
        opensAt: item.opens_at || null,
        closesAt: item.closes_at || null,
        isClosed: item.is_closed === true,
      })),
    };
  }
}

function active(items) {
  return items.filter((item) => item.is_active !== false);
}

function named(item) {
  return {
    id: item.id,
    name: item.display_name_ar || item.name || null,
    address: item.address || null, // ✅ أضف هذا السطر
  };
}

function serviceFact(item) {
  return {
    ...named(item),
    aliases: Array.isArray(item.aliases)
      ? item.aliases.filter((alias) => typeof alias === 'string' && alias.trim())
      : [],
    specialtyId: item.specialty_id || null,
    isBookingEnabled: item.is_booking_enabled !== false,
    requiresDoctor: item.requires_doctor === true,
    requiresRoom: item.requires_room === true,
  };
}

function branchFact(item) {
  return {
    id: item.id,
    name: item.name || null,
    city: item.city || null,
    address: item.address || null,
    googleMapsUrl: item.google_maps_url || null,
    timezone: item.timezone || null,
    isActive: item.is_active === true,
  };
}

module.exports = ShadenDataProvider;
