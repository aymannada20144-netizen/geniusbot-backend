class BookingPatientResolver {
  constructor(repositories) {
    if (!repositories) {
      throw new Error(
        'BookingPatientResolver requires repositories'
      );
    }

    this.repositories = repositories;
  }

  async resolve(data) {
    if (data.patient_id) {
      return this.repositories.patients.findById(
        data.clinic_id,
        data.patient_id
      );
    }

    return this.repositories.patients.findOrCreateByClinicAndPhone({
      clinic_id: data.clinic_id,
      phone_number: data.phone_number,
      full_name: data.full_name || null,
      whatsapp_id: data.whatsapp_id || null,
      source: data.source || 'whatsapp_direct',
      notes: data.patient_notes || null,
    });
  }
}

module.exports = BookingPatientResolver;