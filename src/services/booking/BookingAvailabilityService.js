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
    appointment_start,
    appointment_end,
  }) {
    return this.availabilityService
      .checkAppointmentAvailability({
        clinic_id,
        branch_id,
        service_id,
        doctor_id,
        room_id,
        appointment_start,
        appointment_end,
      });
  }
}

module.exports = BookingAvailabilityService;