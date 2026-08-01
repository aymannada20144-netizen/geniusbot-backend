class BookingAssignmentResolver {
  constructor(
    repositories,
    bookingAvailabilityService
  ) {
    if (!repositories) {
      throw new Error(
        'BookingAssignmentResolver requires repositories'
      );
    }

    if (!repositories.serviceAssignments) {
      throw new Error(
        'BookingAssignmentResolver requires serviceAssignments repository'
      );
    }

    if (!bookingAvailabilityService) {
      throw new Error(
        'BookingAssignmentResolver requires bookingAvailabilityService'
      );
    }

    this.repositories = repositories;
    this.bookingAvailabilityService =
      bookingAvailabilityService;
  }

  /**
   * السيناريوهات المدعومة:
   *
   * 1. service only
   *    النظام يختار الطبيب والغرفة.
   *
   * 2. service + doctor
   *    النظام يثبت الطبيب ويختار غرفة متاحة.
   *
   * 3. service + doctor + room
   *    النظام يتحقق من التعيين المحدد.
   *
   * غير مسموح:
   * room دون doctor.
   */
  async resolve(data = {}) {
    const {
      clinic_id,
      branch_id,
      service_id,
      doctor_id = null,
      room_id = null,
      appointment_start,
      appointment_end,
    } = data;

    const filters = {
      clinicId: clinic_id,
      branchId: branch_id,
      serviceId: service_id,
      activeOnly: true,
      defaultFirst: true,
    };

    if (doctor_id) {
      filters.doctorId = doctor_id;
    }

    if (room_id) {
      filters.roomId = room_id;
    }

    const assignments =
      await this.repositories.serviceAssignments
        .findAssignments(filters);

    if (!assignments.length) {
      return this.buildAssignmentNotFoundResult({
        doctorId: doctor_id,
        roomId: room_id,
      });
    }

    let lastAvailability = null;

    for (const assignment of assignments) {
      const availability =
        await this.bookingAvailabilityService.check({
          clinic_id,
          branch_id,
          service_id,
          doctor_id: assignment.doctor_id,
          room_id: assignment.room_id,
          requires_doctor: assignment.requires_doctor,
          requires_room: assignment.requires_room,
          appointment_start,
          appointment_end,
        });

      if (availability.available) {
        return {
          resolved: true,
          reason: null,
          message:
            'A valid doctor and room assignment was found.',
          assignment,
          availability,
        };
      }

      lastAvailability = availability;
    }

    return {
      resolved: false,
      reason: 'no_available_assignment',
      message:
        'No doctor and room assignment is available for the requested time.',
      assignment: null,
      availability: lastAvailability,
    };
  }

  buildAssignmentNotFoundResult({
    doctorId,
    roomId,
  }) {
    if (doctorId && roomId) {
      return {
        resolved: false,
        reason: 'service_assignment_not_found',
        message:
          'The selected doctor and room are not assigned to this service in this branch.',
        assignment: null,
        availability: null,
      };
    }

    if (doctorId) {
      return {
        resolved: false,
        reason:
          'doctor_service_assignment_not_found',
        message:
          'The selected doctor is not assigned to this service in this branch.',
        assignment: null,
        availability: null,
      };
    }

    return {
      resolved: false,
      reason: 'service_assignment_not_found',
      message:
        'No active doctor and room assignments were found for this service.',
      assignment: null,
      availability: null,
    };
  }
}

module.exports = BookingAssignmentResolver;
