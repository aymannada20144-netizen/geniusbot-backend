const BookingValidator = require('./BookingValidator');
const BookingPatientResolver = require(
  './BookingPatientResolver'
);
const BookingAppointmentFactory = require(
  './BookingAppointmentFactory'
);
const BookingAvailabilityService = require(
  './BookingAvailabilityService'
);
const BookingAssignmentResolver = require(
  './BookingAssignmentResolver'
);

class BookingOrchestrator {
  constructor(repositories, availabilityService) {
    if (!repositories) {
      throw new Error(
        'BookingOrchestrator requires repositories'
      );
    }

    if (!availabilityService) {
      throw new Error(
        'BookingOrchestrator requires availabilityService'
      );
    }

    this.repositories = repositories;

    this.validator = new BookingValidator();

    this.patientResolver =
      new BookingPatientResolver(
        repositories
      );

    this.bookingAvailabilityService =
      new BookingAvailabilityService(
        availabilityService
      );

    this.assignmentResolver =
      new BookingAssignmentResolver(
        repositories,
        this.bookingAvailabilityService
      );

    this.appointmentFactory =
      new BookingAppointmentFactory(
        repositories,
        this.validator
      );
  }

  async bookAppointment(data = {}) {
    this.validator.validateBookingInput(data);

    const clinic =
      await this.repositories.clinics.findById(
        data.clinic_id
      );

    if (!clinic || clinic.is_active !== true) {
      return {
        success: false,
        reason: 'clinic_not_found',
        message:
          'Clinic not found or inactive',
      };
    }

    const service =
      await this.repositories.services
        .findActiveById(
          data.clinic_id,
          data.service_id
        );

    if (
      !service ||
      service.is_booking_enabled !== true
    ) {
      return {
        success: false,
        reason: 'service_not_available',
        message:
          'Service not found or booking is disabled',
      };
    }

    const patient =
      await this.patientResolver.resolve(data);

    if (!patient) {
      return {
        success: false,
        reason: 'patient_not_found',
        message: 'Patient not found',
      };
    }

    const {
      appointmentStart,
      appointmentEnd,
    } =
      this.appointmentFactory
        .buildAppointmentTimes(
          data.preferred_start,
          service.duration_minutes
        );

    const resolution =
      await this.assignmentResolver.resolve({
        clinic_id: data.clinic_id,
        branch_id: data.branch_id,
        service_id: service.id,

        doctor_id: data.doctor_id || null,
        room_id: data.room_id || null,

        appointment_start: appointmentStart,
        appointment_end: appointmentEnd,
      });

    if (!resolution.resolved) {
      if (resolution.availability) {
        return {
          success: false,
          reason: 'slot_not_available',
          availability:
            resolution.availability,
        };
      }

      return {
        success: false,
        reason: resolution.reason,
        message: resolution.message,
      };
    }

    const assignment =
      resolution.assignment;

    const appointment =
      await this.appointmentFactory.create({
        data,
        patient,
        service,
        assignment,
        appointmentStart,
        appointmentEnd,
      });

    return {
      success: true,
      stage: 'appointment_created',
      clinic,
      service,
      patient,
      availability:
        resolution.availability,
      assignment,
      appointment,
    };
  }
}

module.exports = BookingOrchestrator;