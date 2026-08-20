'use strict';

const { ValidationError } = require('../core/errors');
const { validateUuid } = require('../core/validators/commonValidators');
const {
  normalizeSaudiMobileDigits,
} = require('../core/validators/saudiMobile');
const {
  MessageContextBuilder,
} = require('../core/communication/MessageContextBuilder');
const MessageTypes = require('../communication/types/MessageTypes');

const REMINDER_TYPES = Object.freeze([
  'confirmation',
  'day_before',
  'same_day',
  'followup',
  'google_review',
  'custom',
  'cancellation',
]);

/**
 * Schedules and delivers appointment notifications.
 */
class NotificationService {
  constructor(
    notificationRepository,
    communicationService = null,
    { googleReviewDelayMinutes = 60 } = {}
  ) {
    if (!notificationRepository) {
      throw new TypeError('NotificationService requires notificationRepository.');
    }
    if (
      communicationService &&
      typeof communicationService.send !== 'function'
    ) {
      throw new TypeError(
        'communicationService must provide send().'
      );
    }
    this.notificationRepository = notificationRepository;
    this.communicationService = communicationService;
    this.googleReviewDelayMinutes = googleReviewDelayMinutes;
    this.messageContextBuilder = new MessageContextBuilder();
  }

  async schedule({ appointmentId, reminderType, scheduledAt }) {
    validateUuid(appointmentId, 'appointmentId');
    if (!REMINDER_TYPES.includes(reminderType)) {
      throw new ValidationError('Unsupported reminderType.');
    }
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError('scheduledAt must be a valid date.');
    }
    return this.notificationRepository.scheduleReminder({
      appointmentId,
      reminderType,
      scheduledAt: date,
    });
  }

  async scheduleAppointmentLifecycle(appointment) {
    validateUuid(appointment?.id, 'appointment.id');
    const start = new Date(appointment.appointment_start);
    if (Number.isNaN(start.getTime())) {
      throw new ValidationError('appointment_start must be a valid date.');
    }
    const dayBefore = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const sameDay = new Date(start.getTime() - 60 * 60 * 1000);
    const now = new Date();
    return Promise.all([
      { reminderType: 'day_before', scheduledAt: dayBefore },
      { reminderType: 'same_day', scheduledAt: sameDay },
    ]
      .filter(({ scheduledAt }) => scheduledAt > now)
      .map(({ reminderType, scheduledAt }) => this.schedule({
        appointmentId: appointment.id,
        reminderType,
        scheduledAt,
      })));
  }

  async cancelAppointmentNotifications(appointmentId) {
    validateUuid(appointmentId, 'appointmentId');
    return this.notificationRepository.cancelPendingByAppointment(
      appointmentId
    );
  }

  async sendCancellationConfirmation(appointmentId) {
    validateUuid(appointmentId, 'appointmentId');
    const reminder = await this.notificationRepository.scheduleCancellation(
      appointmentId
    );
    if (!reminder) {
      return { attempted: false, success: false, status: 'already_scheduled' };
    }
    const claimed = await this.notificationRepository.claimCancellation(
      reminder.id
    );
    if (!claimed) {
      return { attempted: false, success: false, status: 'not_claimed' };
    }
    return this.#deliver(claimed, { recoverCancellation: true });
  }

  async sendRescheduleConfirmation(appointmentId) {
    validateUuid(appointmentId, 'appointmentId');
    if (!this.communicationService) {
      return { attempted: false, success: false, status: 'not_configured' };
    }

    try {
      const context = await this.notificationRepository
        .loadAppointmentDeliveryContext(appointmentId);
      if (!context?.recipient) {
        const error = new Error('Reschedule delivery context is missing recipient.');
        error.code = 'RESCHEDULE_CONTEXT_INCOMPLETE';
        throw error;
      }

      const messageContext = this.messageContextBuilder.build(
        {
          patient: { full_name: context.patient_name },
          service: { name: context.service_name },
          branch: { name: context.branch_name },
          appointment: {
            ...context,
            booking_reference: context.appointment_reference,
          },
        },
        {
          timezone: context.clinic_timezone,
          locale: 'ar-SA-u-ca-gregory-nu-latn',
        }
      ).context;

      const payload = {
        phone: normalizeSaudiMobileDigits(
          context.recipient,
          'appointment.recipient'
        ),
        patientName: messageContext.patient_name,
        appointmentNumber: messageContext.booking_reference,
        serviceName: messageContext.service_name,
        branchName: messageContext.branch_name,
        appointmentDate: messageContext.appointment_date,
        appointmentTime: messageContext.appointment_time,
        appointmentId: context.appointment_id,
        patientId: context.patient_id,
        clinicId: context.clinic_id,
      };
      this.#validateReschedulePayload(payload);

      const result = await this.communicationService.send(
        MessageTypes.APPOINTMENT_RESCHEDULED,
        payload
      );
      if (result?.success !== true) {
        return {
          attempted: true,
          success: false,
          status: 'failed',
          errorCode: result?.error?.code || 'RESCHEDULE_NOTIFICATION_FAILED',
          retryable: result?.error?.retryable !== false,
        };
      }

      return {
        attempted: true,
        success: true,
        status: 'sent',
        messageId: result.transportResult?.messageId || null,
      };
    } catch (error) {
      return {
        attempted: true,
        success: false,
        status: 'failed',
        errorCode: error?.code || 'RESCHEDULE_NOTIFICATION_FAILED',
        retryable: error?.retryable !== false,
      };
    }
  }

  async rescheduleAppointmentNotifications(appointment) {
    await this.cancelAppointmentNotifications(appointment.id);
    return this.scheduleAppointmentLifecycle(appointment);
  }

  async scheduleGoogleReview(appointmentId, scheduledAt) {
    return this.schedule({
      appointmentId,
      reminderType: 'google_review',
      scheduledAt,
    });
  }

  async scheduleFollowup(appointmentId) {
    console.info('Creating followup reminder.', { appointmentId });
    const reminder = await this.schedule({
      appointmentId,
      reminderType: 'followup',
      scheduledAt: new Date(),
    });
    console.info('Followup reminder pending.', {
      appointmentId,
      reminderId: reminder?.id || null,
    });
    return reminder;
  }

  async processDue(limit = 25) {
    if (!this.communicationService) {
      throw new Error('Notification delivery transport is not configured.');
    }
    const reminders = await this.notificationRepository.claimDue(limit);
    const results = [];
    for (const reminder of reminders) {
      console.info('Scheduler picked reminder.', {
        reminderId: reminder.id,
        reminderType: reminder.reminder_type,
      });
      const delivery = await this.#deliver(reminder);
      results.push(delivery);
    }
    return results;
  }

  async #deliver(reminder, { recoverCancellation = false } = {}) {
      const context = await this.notificationRepository.loadDeliveryContext(
        reminder.id
      );
      if (context && !this.#isDeliveryAllowed(context)) {
        await this.notificationRepository.markCancelled(reminder.id);
        return { id: reminder.id, sent: false, errorCode: 'APPOINTMENT_NOT_REMINDABLE' };
      }
      if (!context?.recipient) {
        await this.notificationRepository.markFailed(reminder.id);
        return { id: reminder.id, sent: false, errorCode: 'REMINDER_RECIPIENT_MISSING' };
      }
      try {
        const messageContext = this.messageContextBuilder.build(
          {
            patient: { full_name: context.patient_name },
            service: { name: context.service_name },
            doctor: context.doctor_name
              ? { full_name: context.doctor_name }
              : null,
            branch: { name: context.branch_name },
            appointment: {
              ...context,
              booking_reference: context.appointment_reference,
            },
          },
          {
            timezone: context.clinic_timezone,
            locale: 'ar-SA-u-ca-gregory-nu-latn',
          }
        );

        const payload = {
          phone: normalizeSaudiMobileDigits(
            context.recipient,
            'reminder.recipient'
          ),
          patientName: messageContext.context.patient_name,
          serviceName: messageContext.context.service_name,
          doctorName: messageContext.context.doctor_name,
          branchName: messageContext.context.branch_name,
          roomNumber: context.room_number,
          appointmentDate: messageContext.context.appointment_date,
          appointmentTime: messageContext.context.appointment_time,
          appointmentNumber: messageContext.context.booking_reference,
          appointmentId: context.appointment_id,
          patientId: context.patient_id,
          clinicId: context.clinic_id,
        };

        const isGoogleReview = reminder.reminder_type === 'google_review';
        const isFollowup = reminder.reminder_type === 'followup';
        const isCancellation = reminder.reminder_type === 'cancellation';
        const deliveryPayload = isGoogleReview
          ? {
              phone: payload.phone,
              patientName: payload.patientName,
              reviewUrl: context.review_url,
              appointmentId: payload.appointmentId,
              patientId: payload.patientId,
              clinicId: payload.clinicId,
            }
          : isFollowup
            ? {
                phone: payload.phone,
                patientName: payload.patientName,
                appointmentNumber: payload.appointmentNumber,
                appointmentId: payload.appointmentId,
                patientId: payload.patientId,
                clinicId: payload.clinicId,
              }
          : isCancellation
            ? {
                phone: payload.phone,
                patientName: payload.patientName,
                appointmentNumber: payload.appointmentNumber,
                serviceName: payload.serviceName,
                branchName: payload.branchName,
                appointmentDate: payload.appointmentDate,
                appointmentTime: payload.appointmentTime,
                appointmentId: payload.appointmentId,
                patientId: payload.patientId,
                clinicId: payload.clinicId,
              }
            : payload;

        if (isGoogleReview) {
          this.#validateGoogleReviewPayload(deliveryPayload);
        } else if (isCancellation) {
          this.#validateCancellationPayload(deliveryPayload);
        } else if (!isFollowup && !isCancellation) {
          this.#validateReminderPayload(payload);
        }

        const result = await this.communicationService.send(
          isGoogleReview
            ? MessageTypes.GOOGLE_REVIEW
            : isFollowup
              ? MessageTypes.THANK_YOU
              : isCancellation
                ? MessageTypes.APPOINTMENT_CANCELLED
                : MessageTypes.APPOINTMENT_REMINDER,
          deliveryPayload
        );

        if (result?.success !== true) {
          const errorCode = result?.error?.code || 'REMINDER_SEND_FAILED';
          console.error('Notification delivery failed.', {
            reminderId: reminder.id,
            reminderType: reminder.reminder_type,
            statusCode: result?.error?.statusCode || null,
            message: result?.error?.message || 'Communication delivery failed.',
            code: errorCode,
            errorSubcode: result?.error?.errorSubcode || null,
            details: result?.error?.details || null,
            fbtraceId: result?.error?.fbtraceId || null,
          });
          if (isCancellation || recoverCancellation) {
            await this.notificationRepository.releaseForRetry(reminder.id);
          } else {
            await this.notificationRepository.markFailed(reminder.id);
          }
          return {
            id: reminder.id, sent: false, attempted: true,
            success: false,
            status: isCancellation || recoverCancellation
              ? 'pending_retry' : 'failed',
            errorCode,
            retryable: result?.error?.retryable !== false,
          };
        }

        await this.notificationRepository.markSent(reminder.id);
        console.info('Notification sent.', {
          reminderId: reminder.id,
          reminderType: reminder.reminder_type,
        });

        if (isFollowup && context.review_url) {
          try {
            const scheduledAt = new Date(
              Date.now() + this.googleReviewDelayMinutes * 60 * 1000
            );
            console.info('Creating google_review reminder.', {
              appointmentId: context.appointment_id,
              scheduledAt,
            });
            const googleReview = await this.scheduleGoogleReview(
              context.appointment_id,
              scheduledAt
            );
            console.info('Google review reminder pending.', {
              appointmentId: context.appointment_id,
              reminderId: googleReview?.id || null,
            });
          } catch (error) {
            console.error('Google review scheduling failed.', {
              appointmentId: context.appointment_id,
              errorCode: error?.code || 'GOOGLE_REVIEW_SCHEDULING_FAILED',
            });
          }
        }
        return {
          id: reminder.id, sent: true, attempted: true,
          success: true, status: 'sent',
        };
      } catch (error) {
        console.error('Notification processing failed.', {
          reminderId: reminder.id,
          reminderType: reminder.reminder_type,
          message: error?.message || 'Notification processing failed.',
          code: error?.code || 'REMINDER_SEND_FAILED',
        });
        if (reminder.reminder_type === 'cancellation' || recoverCancellation) {
          await this.notificationRepository.releaseForRetry(reminder.id);
        } else {
          await this.notificationRepository.markFailed(reminder.id);
        }
        return {
          id: reminder.id,
          sent: false,
          attempted: true,
          success: false,
          status: reminder.reminder_type === 'cancellation' || recoverCancellation
            ? 'pending_retry' : 'failed',
          error,
          errorCode: error?.code || 'REMINDER_SEND_FAILED',
          retryable: error?.retryable !== false,
        };
      }
  }

  #validateReminderPayload(payload) {
    const requiredFields = [
      'phone',
      'patientName',
      'serviceName',
      'doctorName',
      'branchName',
      'roomNumber',
      'appointmentDate',
      'appointmentTime',
      'appointmentNumber',
      'appointmentId',
      'patientId',
      'clinicId',
    ];
    const missingField = requiredFields.find((field) => {
      const value = payload[field];
      return value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '');
    });

    if (missingField) {
      const error = new Error(
        `Reminder delivery context is missing ${missingField}.`
      );
      error.code = 'REMINDER_CONTEXT_INCOMPLETE';
      throw error;
    }
  }

  #validateReschedulePayload(payload) {
    const requiredFields = [
      'phone', 'patientName', 'appointmentNumber', 'serviceName',
      'branchName', 'appointmentDate', 'appointmentTime', 'appointmentId',
      'patientId', 'clinicId',
    ];
    const missingField = requiredFields.find((field) => {
      const value = payload[field];
      return value === null || value === undefined ||
        (typeof value === 'string' && value.trim() === '');
    });
    if (missingField) {
      const error = new Error(
        `Reschedule delivery context is missing ${missingField}.`
      );
      error.code = 'RESCHEDULE_CONTEXT_INCOMPLETE';
      throw error;
    }
  }

  #isDeliveryAllowed(context) {
    if (['day_before', 'same_day'].includes(context.reminder_type)) {
      return ['pending', 'confirmed'].includes(context.appointment_status);
    }
    if (['followup', 'google_review'].includes(context.reminder_type)) {
      return context.appointment_status === 'completed';
    }
    if (context.reminder_type === 'cancellation') {
      return context.appointment_status === 'cancelled';
    }
    return true;
  }

  #validateGoogleReviewPayload(payload) {
    for (const field of ['reviewUrl']) {
      const value = payload[field];
      if (
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        const error = new Error(
          `Google review delivery context is missing ${field}.`
        );
        error.code = 'GOOGLE_REVIEW_CONTEXT_INCOMPLETE';
        throw error;
      }
    }
  }

  #validateCancellationPayload(payload) {
    const requiredFields = [
      'phone',
      'patientName',
      'appointmentNumber',
      'serviceName',
      'branchName',
      'appointmentDate',
      'appointmentTime',
      'appointmentId',
      'patientId',
      'clinicId',
    ];
    const missingField = requiredFields.find((field) => {
      const value = payload[field];
      return value === null || value === undefined ||
        (typeof value === 'string' && value.trim() === '');
    });
    if (missingField) {
      const error = new Error(
        `Cancellation delivery context is missing ${missingField}.`
      );
      error.code = 'CANCELLATION_CONTEXT_INCOMPLETE';
      throw error;
    }
  }
}

module.exports = NotificationService;
module.exports.REMINDER_TYPES = REMINDER_TYPES;
