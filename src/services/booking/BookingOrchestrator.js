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
const PriceService = require('../PriceService');
const NotificationService = require('../NotificationService');

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

    this.priceService = repositories.prices
      ? new PriceService(repositories.prices)
      : null;
    this.notificationService = repositories.notifications
      ? new NotificationService(repositories.notifications)
      : null;
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

    if (this.repositories.branches) {
      const branch = await this.repositories.branches.findActiveById(
        data.clinic_id,
        data.branch_id
      );

      if (!branch) {
        return {
          success: false,
          reason: 'branch_not_found',
          message: 'Branch not found or inactive',
        };
      }
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
          reason: resolution.availability.reason || 'slot_not_available',
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

    let assignment =
      resolution.assignment;

    const revalidation = await this.assignmentResolver.resolve({
      clinic_id: data.clinic_id,
      branch_id: data.branch_id,
      service_id: service.id,
      doctor_id: assignment.doctor_id || null,
      room_id: assignment.room_id || null,
      appointment_start: appointmentStart,
      appointment_end: appointmentEnd,
    });

    if (!revalidation.resolved || revalidation.assignment.id !== assignment.id) {
      return {
        success: false,
        reason: revalidation.availability?.reason ||
          revalidation.reason || 'service_assignment_not_found',
        message: revalidation.message || 'The selected assignment is no longer available.',
        availability: revalidation.availability,
      };
    }

    assignment = revalidation.assignment;

    if (!this.priceService) {
      throw new Error(
        'BookingOrchestrator requires prices repository before creation'
      );
    }

    const resolvedPrice = await this.priceService.resolvePrice({
      clinicId: data.clinic_id,
      serviceId: service.id,
      paymentMethodId: data.payment_method_id,
      insuranceCompanyId: data.insurance_company_id || null,
      insuranceClassId: data.insurance_class_id || null,
      bookingDate: appointmentStart,
    });

    const appointmentData = {
      ...data,
      quoted_price: resolvedPrice.price,
      currency: resolvedPrice.currency,
    };

    const appointment =
      await this.appointmentFactory.create({
        data: appointmentData,
        patient,
        service,
        assignment,
        appointmentStart,
        appointmentEnd,
      });

    let notification = { scheduled: false, reason: 'not_configured' };
    if (this.notificationService) {
      try {
        await this.notificationService.scheduleAppointmentLifecycle(
          appointment
        );
        notification = { scheduled: true };
      } catch (error) {
        notification = { scheduled: false, reason: 'scheduling_failed' };
        console.error('Appointment notification scheduling failed.', {
          appointmentId: appointment.id,
          clinicId: data.clinic_id,
          error: error?.message || 'Unknown notification error',
        });
      }
    }

    return {
      success: true,
      stage: 'appointment_created',
      clinic,
      service,
      patient,
      availability:
        resolution.availability,
      assignment,
      price: resolvedPrice,
      appointment,
      notification,
    };
  }

  async checkAvailability(data = {}) {
    const clinic = await this.repositories.clinics.findById(data.clinic_id);
    if (!clinic || clinic.is_active !== true) {
      return { success: false, reason: 'clinic_not_found' };
    }
    const service = await this.repositories.services.findActiveById(
      data.clinic_id,
      data.service_id
    );
    if (!service || service.is_booking_enabled !== true) {
      return { success: false, reason: 'service_not_available' };
    }
    const { appointmentStart, appointmentEnd } =
      this.appointmentFactory.buildAppointmentTimes(
        data.preferred_start,
        service.duration_minutes
      );
    const resolution = await this.assignmentResolver.resolve({
      clinic_id: data.clinic_id,
      branch_id: data.branch_id,
      service_id: service.id,
      doctor_id: data.doctor_id || null,
      room_id: null,
      appointment_start: appointmentStart,
      appointment_end: appointmentEnd,
    });
    if (!resolution.resolved) {
      return {
        success: false,
        reason: resolution.availability?.reason || resolution.reason || 'technical_failure',
        availability: resolution.availability,
      };
    }
    return {
      success: true,
      availability: resolution.availability,
      assignment: resolution.assignment,
    };
  }
}

module.exports = BookingOrchestrator;
