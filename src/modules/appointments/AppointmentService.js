const {
  NotFoundError,
  ConflictError,
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
    { googleReviewDelayMinutes = 60 } = {}
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
    actorId = null
  ) {
    const appointment = await this.getValidatedAppointment(
      clinicId,
      appointmentId
    );
    validateAppointmentTransition(appointment.status, 'cancelled');

    return this.updateAppointmentStatus(
      clinicId,
      appointmentId,
      'cancelled',
      reason,
      true,
      actorId
    );
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
    appointmentEnd
  ) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(appointmentId, 'appointmentId');

    validateRequired(appointmentStart, 'appointmentStart');
    validateRequired(appointmentEnd, 'appointmentEnd');

    const appointment = await this.getValidatedAppointment(clinicId, appointmentId);
    validateAppointmentTransition(appointment.status, 'rescheduled');

    const doctorConflict =
      await this.appointmentRepository.hasDoctorConflict(
        appointment.doctor_id,
        appointmentStart,
        appointmentEnd,
        appointment.id
      );

    if (doctorConflict) {
      throw new ConflictError('Doctor is not available at this time.');
    }

    const roomConflict =
      await this.appointmentRepository.hasRoomConflict(
        appointment.room_id,
        appointmentStart,
        appointmentEnd,
        appointment.id
      );

    if (roomConflict) {
      throw new ConflictError('Room is not available at this time.');
    }

    return this.appointmentRepository.updateAppointmentSchedule(
      clinicId,
      appointment.id,
      {
        appointment_start: appointmentStart,
        appointment_end: appointmentEnd,
      }
    );
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
    });
  }
}

module.exports = AppointmentService;
