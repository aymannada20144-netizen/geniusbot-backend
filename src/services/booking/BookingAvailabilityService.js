class BookingAvailabilityService {
  constructor(availabilityService) {
    if (!availabilityService) {
      throw new Error(
        'BookingAvailabilityService requires availabilityService'
      );
    }

    this.availabilityService = availabilityService;
  }

  async check({
    clinic_id,
    branch_id,
    service_id,
    doctor_id,
    room_id,
    requires_doctor,
    requires_room,
    appointment_start,
    appointment_end,
    patient_id,
    excludeAppointmentId,
  }) {
    return this.availabilityService
      .checkAppointmentAvailability({
        clinic_id,
        branch_id,
        service_id,
        doctor_id,
        room_id,
        requires_doctor,
        requires_room,
        appointment_start,
        appointment_end,
        patient_id,
        excludeAppointmentId,
      });
  }
}

module.exports = BookingAvailabilityService;
