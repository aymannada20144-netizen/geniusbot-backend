const {
  NotFoundError,
  ConflictError,
  ValidationError,
} = require('../../core/errors');

const {
  validateRequired,
  validateUuid,
} = require('../../core/validators/commonValidators');
const {
  validateAppointmentTransition,
} = require('./appointmentLifecycle');
const {
  deriveChangeTypes,
  normalizeAppointmentChangeCommand,
  semanticSnapshot,
  validateResolvedPatch,
} = require('./AppointmentChange');
const {
  normalizeSaudiMobileDigits,
} = require('../../core/validators/saudiMobile');
const {
  MessageContextBuilder,
} = require('../../core/communication/MessageContextBuilder');
const MessageTypes = require(
  '../../communication/types/MessageTypes'
);

class AppointmentService {
  constructor(
    appointmentRepository,
    communicationService = null,
    notificationService = null,
    {
      googleReviewDelayMinutes = 60,
      availabilityService = null,
      bookingService = null,
      priceService = null,
    } = {}
  ) {
    if (!appointmentRepository) {
      throw new Error('AppointmentService requires appointmentRepository');
    }

    if (
      communicationService &&
      typeof communicationService.send !== 'function'
    ) {
      throw new TypeError(
        'AppointmentService communicationService must provide send()'
      );
    }

    this.appointmentRepository = appointmentRepository;
    this.communicationService = communicationService;
    this.notificationService = notificationService;
    this.googleReviewDelayMinutes = googleReviewDelayMinutes;
    this.availabilityService = availabilityService;
    this.bookingService = bookingService;
    this.priceService = priceService || bookingService?.priceService || null;
    this.messageContextBuilder = new MessageContextBuilder();
  }

  async listAppointments(clinicId) {
    validateUuid(clinicId, 'clinicId');

    const appointments =
      await this.appointmentRepository.findByClinicId(clinicId);

    return appointments.map((appointment) => ({
      id: appointment.id,
      patientName: appointment.patient_name,
      phoneNumber: appointment.phone_number,
      serviceName: appointment.service_name,
      branchName: appointment.branch_name,
      doctorName: appointment.doctor_name ?? null,
      roomName: appointment.room_name ?? null,
      appointmentStart: new Date(
        appointment.appointment_start
      ).toISOString(),
      appointmentEnd:
        appointment.appointment_end == null
          ? null
          : new Date(appointment.appointment_end).toISOString(),
      paymentMethod: appointment.payment_method ?? null,
      status: appointment.status,
    }));
  }

  async updateAppointmentStatus(
    clinicId,
    appointmentId,
    status,
    cancellationReason = null,
    applyCancellationNotes = false,
    actorId = null
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    if (status === 'cancelled') {
      return this.cancelAppointment(
        clinicId,
        appointmentId,
        cancellationReason,
        actorId
      );
    }

    const appointment =
      await this.appointmentRepository.findByIdAndClinic(
        clinicId,
        appointmentId
      );

    if (!appointment) {
      throw new NotFoundError('Appointment not found.');
    }

    if (appointment.status === status) {
      return {
        id: appointment.id,
        status: appointment.status,
        communication: {
          attempted: false,
          success: false,
          status: 'not_required',
        },
      };
    }

    validateAppointmentTransition(appointment.status, status);

    const updated = await this.appointmentRepository.updateStatus(
      clinicId,
      appointmentId,
      status,
      appointment.status,
      cancellationReason,
      applyCancellationNotes,
      actorId,
      applyCancellationNotes ? cancellationReason : null
    );

    if (!updated) {
      const current =
        await this.appointmentRepository.findByIdAndClinic(
          clinicId,
          appointmentId
        );
      if (current?.status === status) {
        return {
          id: current.id,
          status: current.status,
          communication: {
            attempted: false,
            success: false,
            status: 'not_required',
          },
        };
      }
      throw new NotFoundError('Appointment not found.');
    }

    const communication = status === 'confirmed'
      ? await this.sendAppointmentConfirmation(clinicId, appointmentId)
      : status === 'completed'
        ? await this.scheduleCompletionFollowup(clinicId, appointmentId)
        : {
          attempted: false,
          success: false,
          status: 'not_required',
        };

    return {
      id: updated.id,
      status: updated.status,
      communication,
    };
  }

  async sendAppointmentConfirmation(clinicId, appointmentId) {
    if (!this.communicationService) {
      return {
        attempted: false,
        success: false,
        status: 'not_configured',
      };
    }

    try {
      const appointment =
        await this.appointmentRepository.findPresentationById(
          clinicId,
          appointmentId
        );
      if (!appointment) {
        throw new NotFoundError('Appointment presentation not found.');
      }

      const context = this.messageContextBuilder.build(
        {
          patient: { full_name: appointment.patient_name },
          service: { name: appointment.service_name },
          doctor: appointment.doctor_name
            ? { full_name: appointment.doctor_name }
            : null,
          branch: { name: appointment.branch_name },
          appointment,
        },
        {
          timezone: appointment.clinic_timezone,
          locale: 'ar-SA-u-ca-gregory-nu-latn',
        }
      ).context;

      const result = await this.communicationService.send(
        MessageTypes.APPOINTMENT_CONFIRMATION,
        {
          phone: normalizeSaudiMobileDigits(
            appointment.patient_phone,
            'appointment.patient_phone'
          ),
          patientName: context.patient_name,
          serviceName: context.service_name,
          doctorName: context.doctor_name,
          branchName: context.branch_name,
          roomNumber: appointment.room_number,
          appointmentDate: context.appointment_date,
          appointmentTime: context.appointment_time,
          appointmentNumber: context.booking_reference,
          appointmentId: appointment.id,
          patientId: appointment.patient_id,
          clinicId: appointment.clinic_id,
        }
      );

      if (result?.success !== true) {
        const failure = {
          attempted: true,
          success: false,
          status: 'failed',
          errorCode:
            result?.error?.code ||
            'APPOINTMENT_CONFIRMATION_FAILED',
        };
        console.error('Appointment confirmation delivery failed.', {
          appointmentId,
          clinicId,
          errorCode: failure.errorCode,
        });
        return failure;
      }

      return {
        attempted: true,
        success: true,
        status: 'sent',
        messageId:
          result.transportResult?.messageId || null,
      };
    } catch (error) {
      const failure = {
        attempted: true,
        success: false,
        status: 'failed',
        errorCode:
          error?.code ||
          'APPOINTMENT_CONFIRMATION_FAILED',
      };
      console.error('Appointment confirmation delivery failed.', {
        appointmentId,
        clinicId,
        errorCode: failure.errorCode,
        error: error?.message || 'Unknown communication error',
      });
      return failure;
    }
  }

  async scheduleCompletionFollowup(clinicId, appointmentId) {
    console.info('Appointment completed.', { appointmentId, clinicId });
    if (!this.notificationService) {
      return {
        attempted: false,
        success: false,
        status: 'not_configured',
      };
    }
    try {
      const reminder = await this.notificationService.scheduleFollowup(
        appointmentId
      );
      return {
        attempted: true,
        success: true,
        status: 'scheduled',
        reminderId: reminder?.id || null,
      };
    } catch (error) {
      console.error('Followup scheduling failed.', {
        appointmentId,
        clinicId,
        errorCode: error?.code || 'FOLLOWUP_SCHEDULING_FAILED',
      });
      return {
        attempted: true,
        success: false,
        status: 'failed',
        errorCode: error?.code || 'FOLLOWUP_SCHEDULING_FAILED',
      };
    }
  }

  async sendThankYou(clinicId, appointmentId) {
    if (!this.communicationService) {
      return {
        attempted: false,
        success: false,
        status: 'not_configured',
      };
    }

    try {
      const appointment =
        await this.appointmentRepository.findPresentationById(
          clinicId,
          appointmentId
        );
      if (!appointment) {
        throw new NotFoundError('Appointment presentation not found.');
      }

      const result = await this.communicationService.send(
        MessageTypes.THANK_YOU,
        {
          phone: normalizeSaudiMobileDigits(
            appointment.patient_phone,
            'appointment.patient_phone'
          ),
          patientName: appointment.patient_name,
          appointmentNumber: appointment.booking_reference,
          appointmentId: appointment.id,
          patientId: appointment.patient_id,
          clinicId: appointment.clinic_id,
        }
      );

      if (result?.success !== true) {
        return {
          attempted: true,
          success: false,
          status: 'failed',
          errorCode: result?.error?.code || 'THANK_YOU_FAILED',
        };
      }

      let googleReview = {
        scheduled: false,
        reason: appointment.review_url
          ? 'not_configured'
          : 'review_url_missing',
      };
      if (appointment.review_url && this.notificationService) {
        try {
          const scheduledAt = new Date(
            Date.now() + this.googleReviewDelayMinutes * 60 * 1000
          );
          await this.notificationService.scheduleGoogleReview(
            appointment.id,
            scheduledAt
          );
          googleReview = { scheduled: true, scheduledAt };
        } catch (error) {
          googleReview = {
            scheduled: false,
            reason: 'scheduling_failed',
            errorCode: error?.code || 'GOOGLE_REVIEW_SCHEDULING_FAILED',
          };
          console.error('Google review scheduling failed.', {
            appointmentId,
            clinicId,
            errorCode: googleReview.errorCode,
          });
        }
      }

      return {
        attempted: true,
        success: true,
        status: 'sent',
        messageId: result.transportResult?.messageId || null,
        googleReview,
      };
    } catch (error) {
      const failure = {
        attempted: true,
        success: false,
        status: 'failed',
        errorCode: error?.code || 'THANK_YOU_FAILED',
      };
      console.error('Thank-you delivery failed.', {
        appointmentId,
        clinicId,
        errorCode: failure.errorCode,
      });
      return failure;
    }
  }

  async getValidatedAppointment(clinicId, appointmentId, options = {}) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    const appointment =
      await this.appointmentRepository.findByIdAndClinic(
        clinicId,
        appointmentId
      );

    if (!appointment) {
      throw new NotFoundError('Appointment not found.');
    }

    const blockedStatuses = options.blockedStatuses || [];

    if (blockedStatuses.includes(appointment.status)) {
      throw new ConflictError(
        `Appointment cannot be processed because its status is ${appointment.status}.`
      );
    }

    return appointment;
  }

  async getUpcomingAppointment(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    const appointment =
      await this.appointmentRepository.findUpcomingByPatient(
        clinicId,
        patientId
      );

    if (!appointment) {
      throw new NotFoundError('No upcoming appointment found.');
    }

    return appointment;
  }

  async resolveAppointmentForManagementByBookingReference(
    clinicId,
    bookingReference
  ) {
    validateUuid(clinicId, 'clinicId');
    const normalizedReference = normalizeBookingReference(bookingReference);
    if (!normalizedReference) return null;

    const appointment =
      await this.appointmentRepository.findByBookingReference(
        clinicId,
        normalizedReference
      );
    if (
      !appointment?.id ||
      appointment.clinic_id !== clinicId ||
      !appointment.patient_id
    ) {
      return null;
    }

    return Object.freeze({
      appointmentId: appointment.id,
      clinicId,
      patientId: appointment.patient_id,
      bookingReference: appointment.booking_reference,
    });
  }

  async getFutureManagementCandidates(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');
    return this.appointmentRepository.findFutureForManagementByPatient(
      clinicId,
      patientId
    );
  }

  async verifyAppointmentOwnership(
    clinicId,
    bookingReference,
    registeredMobile
  ) {
    let normalizedSubmittedMobile;
    try {
      normalizedSubmittedMobile = normalizeSaudiMobileDigits(
        registeredMobile,
        'registeredMobile'
      );
    } catch (error) {
      return Object.freeze({ verified: false });
    }

    const resolved =
      await this.resolveAppointmentForManagementByBookingReference(
        clinicId,
        bookingReference
      );
    if (!resolved) return Object.freeze({ verified: false });

    const presentation =
      await this.appointmentRepository.findPresentationById(
        clinicId,
        resolved.appointmentId
      );
    if (
      !presentation ||
      presentation.clinic_id !== clinicId ||
      presentation.patient_id !== resolved.patientId ||
      !presentation.patient_phone
    ) {
      return Object.freeze({ verified: false });
    }

    let normalizedRegisteredMobile;
    try {
      normalizedRegisteredMobile = normalizeSaudiMobileDigits(
        presentation.patient_phone,
        'appointment.patient_phone'
      );
    } catch (error) {
      return Object.freeze({ verified: false });
    }
    if (normalizedSubmittedMobile !== normalizedRegisteredMobile) {
      return Object.freeze({ verified: false });
    }

    return Object.freeze({
      verified: true,
      appointmentId: resolved.appointmentId,
      patientId: resolved.patientId,
    });
  }

  async getAppointmentHistory(clinicId, patientId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(patientId, 'patientId');

    return this.appointmentRepository.findAppointmentHistoryByPatient(
      clinicId,
      patientId
    );
  }

  async cancelAppointment(
    clinicId,
    appointmentId,
    reason = null,
    actorId = null,
    attribution = null
  ) {
    const cancellationAttribution = normalizeCancellationAttribution(
      actorId,
      attribution
    );
    const appointment = await this.getValidatedAppointment(
      clinicId,
      appointmentId
    );

    if (appointment.status === 'cancelled') {
      return this.#cancelledResponse(appointment.id);
    }

    validateAppointmentTransition(appointment.status, 'cancelled');

    const normalizedReason = reason == null || String(reason).trim() === ''
      ? null
      : String(reason).trim();

    let result;
    try {
      result = await this.applyValidatedChange(
        {
          clinicId,
          appointmentId,
          expected: {
            status: appointment.status,
            updatedAt: appointment.updated_at,
          },
          operation: 'cancel',
          changes: { reason: normalizedReason },
          actor: cancellationAttribution.actor,
          metadata: cancellationAttribution.metadata,
        },
        {
          status: 'cancelled',
          cancellation_reason: normalizedReason,
        }
      );
    } catch (error) {
      if (error?.code !== 'APPOINTMENT_STALE') throw error;
      const current = await this.appointmentRepository.findByIdAndClinic(
        clinicId,
        appointmentId
      );
      if (current?.status !== 'cancelled') throw error;
      return this.#cancelledResponse(current.id);
    }

    if (this.notificationService) {
      try {
        await this.notificationService.cancelAppointmentNotifications(
          appointmentId
        );
      } catch (error) {
        console.error('Appointment notification cleanup failed.', {
          appointmentId,
          clinicId,
          errorCode: error?.code || 'NOTIFICATION_CLEANUP_FAILED',
        });
      }
    }

    let communication = {
      attempted: false,
      success: false,
      status: 'not_required',
    };
    if (
      this.notificationService &&
      typeof this.notificationService.sendCancellationConfirmation === 'function'
    ) {
      try {
        communication = await this.notificationService
          .sendCancellationConfirmation(result.appointment.id);
      } catch (error) {
        communication = {
          attempted: true,
          success: false,
          status: 'pending_retry',
          errorCode: error?.code || 'CANCELLATION_NOTIFICATION_FAILED',
          retryable: error?.retryable !== false,
        };
        console.error('Cancellation notification delivery failed.', {
          appointmentId,
          clinicId,
          errorCode: communication.errorCode,
        });
      }
    }

    return this.#cancelledResponse(result.appointment.id, communication);
  }

  #cancelledResponse(appointmentId, communication = null) {
    return {
      id: appointmentId,
      status: 'cancelled',
      communication: communication || {
        attempted: false,
        success: false,
        status: 'not_required',
      },
    };
  }

  async completeAppointment(clinicId, appointmentId, actorId = null) {
    return this.updateAppointmentStatus(
      clinicId,
      appointmentId,
      'completed',
      null,
      false,
      actorId
    );
  }

  async markAppointmentAsNoShow(
    clinicId,
    appointmentId,
    actorId = null
  ) {
    const appointment = await this.getValidatedAppointment(
      clinicId,
      appointmentId
    );
    validateAppointmentTransition(appointment.status, 'no_show');

    return this.updateAppointmentStatus(
      clinicId,
      appointmentId,
      'no_show',
      null,
      false,
      actorId
    );
  }

  async rescheduleAppointment(
    clinicId,
    appointmentId,
    appointmentStart,
    appointmentEnd,
    actorId = null,
    attribution = null
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    validateRequired(appointmentStart, 'appointmentStart');
    validateRequired(appointmentEnd, 'appointmentEnd');

    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new ValidationError(
        'Appointment status is not eligible for rescheduling.'
      );
    }

    const start = new Date(appointmentStart);
    const end = new Date(appointmentEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      throw new ValidationError(
        'appointmentStart and appointmentEnd must define a valid time range.'
      );
    }

    if (this.availabilityService) {
      const availability = await this.availabilityService.checkAppointmentAvailability({
        clinic_id: clinicId,
        branch_id: appointment.branch_id,
        service_id: appointment.service_id,
        doctor_id: appointment.doctor_id,
        room_id: appointment.room_id,
        patient_id: appointment.patient_id,
        requires_doctor: Boolean(appointment.doctor_id),
        requires_room: Boolean(appointment.room_id),
        appointment_start: start.toISOString(),
        appointment_end: end.toISOString(),
        excludeAppointmentId: appointment.id,
      });
      if (!availability.available) {
        const error = new ConflictError('Appointment slot is no longer available.');
        error.code = 'APPOINTMENT_SLOT_NO_LONGER_AVAILABLE';
        throw error;
      }
    }

    const doctorConflict = !this.availabilityService &&
      await this.appointmentRepository.hasDoctorConflict(
        appointment.doctor_id,
        start.toISOString(),
        end.toISOString(),
        appointment.id
      );

    if (doctorConflict) {
      throw new ConflictError('Doctor is not available at this time.');
    }

    const roomConflict = !this.availabilityService &&
      await this.appointmentRepository.hasRoomConflict(
        appointment.room_id,
        start.toISOString(),
        end.toISOString(),
        appointment.id
      );

    if (roomConflict) {
      throw new ConflictError('Room is not available at this time.');
    }

    const rescheduleAttribution = normalizeRescheduleAttribution(
      actorId,
      attribution
    );
    const result = await this.applyValidatedChange(
      {
        clinicId,
        appointmentId: appointment.id,
        expected: {
          status: appointment.status,
          updatedAt: appointment.updated_at,
        },
        operation: 'reschedule',
        changes: { appointmentStart: start.toISOString() },
        actor: rescheduleAttribution.actor,
        metadata: rescheduleAttribution.metadata,
      },
      {
        appointment_start: start.toISOString(),
        appointment_end: end.toISOString(),
      }
    );

    let communication = {
      attempted: false,
      success: false,
      status: 'not_configured',
    };
    if (
      this.notificationService &&
      typeof this.notificationService.rescheduleAppointmentNotifications ===
        'function'
    ) {
      try {
        const reminders = await this.notificationService
          .rescheduleAppointmentNotifications(result.appointment);
        communication = {
          attempted: true,
          success: true,
          status: 'rescheduled',
          reminders,
        };
      } catch (error) {
        communication = {
          attempted: true,
          success: false,
          status: 'failed',
          errorCode: error?.code || 'REMINDER_RESCHEDULE_FAILED',
        };
        console.error('Appointment reminder rescheduling failed.', {
          appointmentId,
          clinicId,
          errorCode: communication.errorCode,
        });
      }
    }

    return {
      ...result.appointment,
      communication,
    };
  }

  async getRescheduleAvailableDates(clinicId, appointmentId, fromDate) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');
    validateRequired(fromDate, 'fromDate');
    if (!this.bookingService) {
      throw new Error('AppointmentService requires bookingService for availability.');
    }
    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new ValidationError('Appointment status is not eligible for rescheduling.');
    }
    return this.bookingService.getAvailableDates({
      clinic_id: clinicId,
      branch_id: appointment.branch_id,
      service_id: appointment.service_id,
      doctor_id: appointment.doctor_id,
      room_id: appointment.room_id,
      from_date: fromDate,
      search_days: 31,
      limit: 31,
      excludeAppointmentId: appointment.id,
    });
  }

  async getRescheduleAvailableTimes(clinicId, appointmentId, date) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');
    validateRequired(date, 'date');
    if (!this.bookingService) {
      throw new Error('AppointmentService requires bookingService for availability.');
    }
    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new ValidationError('Appointment status is not eligible for rescheduling.');
    }
    return this.bookingService.getAvailableTimes({
      clinic_id: clinicId,
      branch_id: appointment.branch_id,
      service_id: appointment.service_id,
      doctor_id: appointment.doctor_id,
      room_id: appointment.room_id,
      date,
      excludeAppointmentId: appointment.id,
    });
  }

  async previewServiceChange(
    clinicId,
    appointmentId,
    targetServiceId,
    preferredStart = null,
    patientId = null
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');
    validateUuid(targetServiceId, 'targetServiceId');
    const storedAppointment = await this.getValidatedAppointment(clinicId, appointmentId);
    const presentation = typeof this.appointmentRepository.findPresentationById === 'function'
      ? await this.appointmentRepository.findPresentationById(clinicId, appointmentId)
      : null;
    const appointment = presentation
      ? { ...storedAppointment, ...presentation }
      : storedAppointment;
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new ValidationError('Appointment status is not eligible for service change.');
    }
    if (patientId && appointment.patient_id !== patientId) {
      throw new NotFoundError('Appointment was not found for the patient.');
    }
    if (appointment.service_id === targetServiceId) {
      const error = new ConflictError('The selected service is already booked.');
      error.code = 'APPOINTMENT_SERVICE_UNCHANGED';
      throw error;
    }
    const repositories = this.bookingService?.repositories;
    const assignmentResolver = this.bookingService?.assignmentResolver;
    if (!repositories?.services || !assignmentResolver || !this.priceService) {
      throw new Error('AppointmentService change-service dependencies are unavailable.');
    }
    const service = await repositories.services.findActiveById(clinicId, targetServiceId);
    if (!service || service.is_booking_enabled !== true) {
      throw new NotFoundError('Target service is unavailable.');
    }
    const start = new Date(preferredStart || appointment.appointment_start);
    if (Number.isNaN(start.getTime())) throw new ValidationError('preferredStart is invalid.');
    const duration = Number(service.duration_minutes);
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new ValidationError('Target service duration is invalid.');
    }
    const end = new Date(start.getTime() + duration * 60000);
    const resolution = await assignmentResolver.resolve({
      clinic_id: clinicId,
      branch_id: appointment.branch_id,
      service_id: targetServiceId,
      appointment_start: start.toISOString(),
      appointment_end: end.toISOString(),
      patient_id: appointment.patient_id,
      excludeAppointmentId: appointment.id,
    });
    if (!resolution.resolved) {
      return Object.freeze({
        appointment, service, requiresNewSlot: true,
        reason: resolution.availability?.reason || resolution.reason,
      });
    }
    const price = await this.priceService.resolvePrice({
      clinicId,
      serviceId: targetServiceId,
      paymentMethodId: appointment.payment_method_id,
      insuranceCompanyId: appointment.insurance_company_id || null,
      insuranceClassId: appointment.insurance_class_id || null,
      bookingDate: start.toISOString(),
    });
    return Object.freeze({
      appointment, service, assignment: resolution.assignment,
      availability: resolution.availability, price,
      appointmentStart: start.toISOString(), appointmentEnd: end.toISOString(),
      requiresNewSlot: false,
    });
  }

  async listEligibleServiceChanges(clinicId, appointmentId, patientId = null) {
    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    if (!['pending', 'confirmed'].includes(appointment.status) ||
        (patientId && appointment.patient_id !== patientId)) return [];
    const repositories = this.bookingService?.repositories;
    if (!repositories?.services || !repositories?.serviceAssignments) return [];
    const services = await repositories.services.findBookableByClinicId(clinicId);
    const eligible = [];
    for (const service of services || []) {
      if (service.id === appointment.service_id || service.is_booking_enabled !== true) continue;
      const assignments = await repositories.serviceAssignments.findAssignments({
        clinicId, branchId: appointment.branch_id, serviceId: service.id,
        activeOnly: true, defaultFirst: true, limit: 1,
      });
      if (assignments.length) eligible.push(service);
    }
    return eligible;
  }

  async changeAppointmentService(
    clinicId,
    appointmentId,
    targetServiceId,
    preferredStart,
    attribution = null,
    expectedUpdatedAt = null
  ) {
    const patientId = attribution?.patientId || null;
    const proposal = await this.previewServiceChange(
      clinicId, appointmentId, targetServiceId, preferredStart, patientId
    );
    if (proposal.requiresNewSlot || !proposal.assignment) {
      const error = new ConflictError('A new appointment slot is required.');
      error.code = 'APPOINTMENT_SERVICE_SLOT_REQUIRED';
      throw error;
    }
    if (expectedUpdatedAt &&
        new Date(proposal.appointment.updated_at).toISOString() !==
          new Date(expectedUpdatedAt).toISOString()) {
      const error = new ConflictError('The appointment changed after review.');
      error.code = 'APPOINTMENT_STALE';
      throw error;
    }
    const actor = {
      staffId: attribution?.staffId || null,
      patientId,
      source: attribution?.source || 'api',
    };
    const result = await this.applyValidatedChange({
      clinicId, appointmentId,
      expected: {
        status: proposal.appointment.status,
        updatedAt: proposal.appointment.updated_at,
      },
      operation: 'change_service',
      changes: {
        serviceId: targetServiceId,
      },
      actor,
      metadata: { conversationId: attribution?.conversationId || null },
    }, {
      service_id: targetServiceId,
      doctor_id: proposal.assignment.doctor_id || null,
      room_id: proposal.assignment.room_id || null,
      appointment_start: proposal.appointmentStart,
      appointment_end: proposal.appointmentEnd,
      quoted_price: proposal.price.price,
      currency: proposal.price.currency,
    });
    return { ...result.appointment, proposal };
  }

  async previewBranchChange(
    clinicId,
    appointmentId,
    targetBranchId,
    preferredStart = null,
    patientId = null
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');
    validateUuid(targetBranchId, 'targetBranchId');
    const storedAppointment = await this.getValidatedAppointment(clinicId, appointmentId);
    const presentation = typeof this.appointmentRepository.findPresentationById === 'function'
      ? await this.appointmentRepository.findPresentationById(clinicId, appointmentId)
      : null;
    const appointment = presentation
      ? { ...storedAppointment, ...presentation }
      : storedAppointment;
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new ValidationError('Appointment status is not eligible for branch change.');
    }
    if (patientId && appointment.patient_id !== patientId) {
      throw new NotFoundError('Appointment was not found for the patient.');
    }
    if (appointment.branch_id === targetBranchId) {
      const error = new ConflictError('The selected branch is already booked.');
      error.code = 'APPOINTMENT_BRANCH_UNCHANGED';
      throw error;
    }
    const repositories = this.bookingService?.repositories;
    const assignmentResolver = this.bookingService?.assignmentResolver;
    if (!repositories?.branches || !repositories?.services || !assignmentResolver || !this.priceService) {
      throw new Error('AppointmentService change-branch dependencies are unavailable.');
    }
    const [branch, service] = await Promise.all([
      repositories.branches.findActiveById(clinicId, targetBranchId),
      repositories.services.findActiveById(clinicId, appointment.service_id),
    ]);
    if (!branch) throw new NotFoundError('Target branch is unavailable.');
    if (!service || service.is_booking_enabled !== true) {
      throw new NotFoundError('Appointment service is unavailable.');
    }
    const start = new Date(preferredStart || appointment.appointment_start);
    if (Number.isNaN(start.getTime())) throw new ValidationError('preferredStart is invalid.');
    const duration = Number(service.duration_minutes);
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new ValidationError('Appointment service duration is invalid.');
    }
    const end = new Date(start.getTime() + duration * 60000);
    const resolution = await assignmentResolver.resolve({
      clinic_id: clinicId,
      branch_id: targetBranchId,
      service_id: appointment.service_id,
      appointment_start: start.toISOString(),
      appointment_end: end.toISOString(),
      patient_id: appointment.patient_id,
      excludeAppointmentId: appointment.id,
    });
    if (!resolution.resolved) {
      return Object.freeze({
        appointment, branch, service, requiresNewSlot: true,
        reason: resolution.availability?.reason || resolution.reason,
      });
    }
    const price = await this.priceService.resolvePrice({
      clinicId,
      serviceId: appointment.service_id,
      paymentMethodId: appointment.payment_method_id,
      insuranceCompanyId: appointment.insurance_company_id || null,
      insuranceClassId: appointment.insurance_class_id || null,
      bookingDate: start.toISOString(),
    });
    return Object.freeze({
      appointment, branch, service, assignment: resolution.assignment,
      availability: resolution.availability, price,
      appointmentStart: start.toISOString(), appointmentEnd: end.toISOString(),
      requiresNewSlot: false,
    });
  }

  async listEligibleBranchChanges(clinicId, appointmentId, patientId = null) {
    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    if (!['pending', 'confirmed'].includes(appointment.status) ||
        (patientId && appointment.patient_id !== patientId)) return [];
    const repositories = this.bookingService?.repositories;
    if (!repositories?.branches?.findActiveByClinicId || !repositories?.serviceAssignments) return [];
    const branches = await repositories.branches.findActiveByClinicId(clinicId);
    const eligible = [];
    for (const branch of branches || []) {
      if (branch.id === appointment.branch_id) continue;
      const assignments = await repositories.serviceAssignments.findAssignments({
        clinicId, branchId: branch.id, serviceId: appointment.service_id,
        activeOnly: true, defaultFirst: true, limit: 1,
      });
      if (assignments.length) eligible.push(branch);
    }
    return eligible;
  }

  async changeAppointmentBranch(
    clinicId,
    appointmentId,
    targetBranchId,
    preferredStart,
    attribution = null,
    expectedUpdatedAt = null
  ) {
    const patientId = attribution?.patientId || null;
    const proposal = await this.previewBranchChange(
      clinicId, appointmentId, targetBranchId, preferredStart, patientId
    );
    if (proposal.requiresNewSlot || !proposal.assignment) {
      const error = new ConflictError('A new appointment slot is required.');
      error.code = 'APPOINTMENT_BRANCH_SLOT_REQUIRED';
      throw error;
    }
    if (expectedUpdatedAt &&
        new Date(proposal.appointment.updated_at).toISOString() !==
          new Date(expectedUpdatedAt).toISOString()) {
      const error = new ConflictError('The appointment changed after review.');
      error.code = 'APPOINTMENT_STALE';
      throw error;
    }
    const actor = {
      staffId: attribution?.staffId || null,
      patientId,
      source: attribution?.source || 'api',
    };
    const result = await this.applyValidatedChange({
      clinicId, appointmentId,
      expected: {
        status: proposal.appointment.status,
        updatedAt: proposal.appointment.updated_at,
      },
      operation: 'change_branch',
      changes: { branchId: targetBranchId },
      actor,
      metadata: { conversationId: attribution?.conversationId || null },
    }, {
      branch_id: targetBranchId,
      doctor_id: proposal.assignment.doctor_id || null,
      room_id: proposal.assignment.room_id || null,
      appointment_start: proposal.appointmentStart,
      appointment_end: proposal.appointmentEnd,
      quoted_price: proposal.price.price,
      currency: proposal.price.currency,
    });
    return { ...result.appointment, proposal };
  }

  normalizeChangeCommand(command) {
    return normalizeAppointmentChangeCommand(command);
  }

  deriveSemanticChangeTypes(before, after) {
    return deriveChangeTypes(
      semanticSnapshot(before),
      semanticSnapshot(after)
    );
  }

  async applyValidatedChange(command, resolvedPatch) {
    const normalized = this.normalizeChangeCommand(command);
    const patch = validateResolvedPatch(resolvedPatch);

    return this.appointmentRepository.applyAtomicChange({
      clinicId: normalized.clinicId,
      appointmentId: normalized.appointmentId,
      expectedStatus: normalized.expected.status,
      expectedUpdatedAt: normalized.expected.updatedAt,
      operation: normalized.operation,
      patch,
      actor: normalized.actor,
      reason: normalized.changes.reason,
      metadata: normalized.metadata,
    });
  }
}

function normalizeBookingReference(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
}

function normalizeCancellationAttribution(actorId, attribution) {
  if (attribution == null) {
    return {
      actor: {
        staffId: actorId,
        patientId: null,
        source: 'api',
      },
      metadata: {},
    };
  }
  if (
    typeof attribution !== 'object' ||
    Array.isArray(attribution)
  ) {
    throw new ValidationError('attribution must be an object.');
  }
  if (actorId != null) {
    throw new ValidationError(
      'actorId cannot be combined with patient attribution.'
    );
  }
  const allowedFields = new Set([
    'patientId',
    'source',
    'conversationId',
    'requestId',
  ]);
  if (Object.keys(attribution).some((key) => !allowedFields.has(key))) {
    throw new ValidationError('attribution contains unsupported fields.');
  }
  validateUuid(attribution.patientId, 'attribution.patientId');
  if (attribution.source !== 'shaden') {
    throw new ValidationError('attribution.source must be shaden.');
  }
  if (attribution.conversationId != null) {
    validateUuid(attribution.conversationId, 'attribution.conversationId');
  }

  return {
    actor: {
      staffId: null,
      patientId: attribution.patientId,
      source: 'shaden',
    },
    metadata: {
      ...(attribution.requestId != null
        ? { requestId: attribution.requestId }
        : {}),
      ...(attribution.conversationId != null
        ? { conversationId: attribution.conversationId }
        : {}),
    },
  };
}

function normalizeRescheduleAttribution(actorId, attribution) {
  if (attribution == null) {
    return {
      actor: { staffId: actorId, patientId: null, source: 'api' },
      metadata: {},
    };
  }
  if (typeof attribution !== 'object' || Array.isArray(attribution)) {
    throw new ValidationError('attribution must be an object.');
  }
  if (actorId != null) {
    throw new ValidationError(
      'actorId cannot be combined with patient attribution.'
    );
  }
  const allowedFields = new Set([
    'patientId', 'source', 'conversationId', 'requestId',
  ]);
  if (Object.keys(attribution).some((key) => !allowedFields.has(key))) {
    throw new ValidationError('attribution contains unsupported fields.');
  }
  validateUuid(attribution.patientId, 'attribution.patientId');
  if (attribution.source !== 'shaden') {
    throw new ValidationError('attribution.source must be shaden.');
  }
  if (attribution.conversationId != null) {
    validateUuid(attribution.conversationId, 'attribution.conversationId');
  }
  return {
    actor: {
      staffId: null,
      patientId: attribution.patientId,
      source: 'shaden',
    },
    metadata: {
      ...(attribution.requestId != null
        ? { requestId: attribution.requestId }
        : {}),
      ...(attribution.conversationId != null
        ? { conversationId: attribution.conversationId }
        : {}),
    },
  };
}

module.exports = AppointmentService;
