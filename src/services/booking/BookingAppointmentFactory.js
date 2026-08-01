class BookingAppointmentFactory {
  constructor(repositories, validator) {
    if (!repositories) {
      throw new Error(
        'BookingAppointmentFactory requires repositories'
      );
    }

    if (!validator) {
      throw new Error(
        'BookingAppointmentFactory requires validator'
      );
    }

    this.repositories = repositories;
    this.validator = validator;
  }

  buildAppointmentTimes(
    preferredStart,
    durationMinutes
  ) {
    const appointmentStart =
      new Date(preferredStart);

    this.validator.validateAppointmentStart(
      appointmentStart
    );

    const normalizedDuration =
      Number(durationMinutes);

    if (
      !Number.isFinite(normalizedDuration) ||
      normalizedDuration <= 0
    ) {
      throw new Error(
        'Service duration_minutes must be a positive number'
      );
    }

    const appointmentEnd =
      new Date(
        appointmentStart.getTime() +
          normalizedDuration * 60 * 1000
      );

    return {
      appointmentStart,
      appointmentEnd,
    };
  }

  async create({
    data,
    patient,
    service,
    assignment,
    appointmentStart,
    appointmentEnd,
  }) {
    if (!assignment) {
      throw new Error(
        'BookingAppointmentFactory requires a resolved assignment'
      );
    }

    if (service.requires_doctor && !assignment.doctor_id) {
      throw new Error(
        'Resolved assignment must contain the service-required doctor_id'
      );
    }
    if (service.requires_room && !assignment.room_id) {
      throw new Error(
        'Resolved assignment must contain the service-required room_id'
      );
    }

    return this.repositories.appointments
      .createAppointment({
        clinic_id: data.clinic_id,
        branch_id: data.branch_id,
        patient_id: patient.id,
        service_id: service.id,

        /*
         * مصدر الحقيقة الوحيد للطبيب والغرفة
         * هو التعيين الذي أعاده Resolver.
         */
        doctor_id: assignment.doctor_id,
        room_id: assignment.room_id,

        appointment_start:
          appointmentStart,
        appointment_end:
          appointmentEnd,

        payment_method_id:
          data.payment_method_id || null,

        insurance_company_id:
          data.insurance_company_id || null,

        insurance_class_id:
          data.insurance_class_id || null,

        quoted_price:
          data.quoted_price ?? null,

        currency:
          data.currency ?? 'SAR',

        status: 'pending',

        source:
          data.source ||
          'whatsapp_direct',

        notes:
          data.notes || null,
      });
  }
}

module.exports = BookingAppointmentFactory;
