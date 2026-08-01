'use strict';

const {
  normalizeSaudiMobile,
} = require('../../core/validators/saudiMobile');

class BookingPatientResolver {
  constructor(repositories) {
    if (!repositories?.patients) {
      throw new Error('BookingPatientResolver requires patients repository');
    }
    this.repositories = repositories;
  }

  async resolve(data) {
    let patient;
    if (data.patient_id) {
      patient = await this.repositories.patients.findById(
        data.clinic_id,
        data.patient_id
      );
    } else {
      if (!validName(data.full_name) || !data.phone_number) return null;
      patient = await this.repositories.patients.findOrCreateByClinicAndPhone({
        clinic_id: data.clinic_id,
        phone_number: normalizeSaudiMobile(
          data.phone_number,
          'phone_number'
        ),
        full_name: data.full_name.trim(),
        whatsapp_id: data.whatsapp_id
          ? normalizeSaudiMobile(data.whatsapp_id, 'whatsapp_id')
          : null,
        source: data.source || 'whatsapp_direct',
        notes: data.patient_notes || null,
      });
    }

    if (!isCompletePatient(patient, data.clinic_id)) return null;
    return patient;
  }
}

function isCompletePatient(patient, clinicId) {
  if (!patient?.id) return false;
  if ((patient.clinic_id ?? patient.clinicId) !== clinicId) return false;
  if (patient.is_active === false) return false;
  if (!validName(patient.full_name ?? patient.fullName)) return false;
  try {
    normalizeSaudiMobile(
      patient.phone_number ?? patient.phoneNumber,
      'patient.phone_number'
    );
  } catch {
    return false;
  }
  return patient.is_temporary !== true && patient.isTemporary !== true;
}

function validName(value) {
  const name = String(value || '').trim();
  return name.length >= 2 && !/^\+?[\d\s()-]+$/.test(name);
}

module.exports = BookingPatientResolver;
