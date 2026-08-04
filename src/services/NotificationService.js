'use strict';

const { ValidationError } = require('../core/errors');
const { validateUuid } = require('../core/validators/commonValidators');

const REMINDER_TYPES = Object.freeze([
  'confirmation',
  'day_before',
  'same_day',
  'custom',
]);

/**
 * Schedules and delivers appointment notifications.
 */
class NotificationService {
  constructor(notificationRepository, sendMessage) {
    if (!notificationRepository) {
      throw new TypeError('NotificationService requires notificationRepository.');
    }
    if (sendMessage && typeof sendMessage !== 'function') {
      throw new TypeError('sendMessage must be a function.');
    }
    this.notificationRepository = notificationRepository;
    this.sendMessage = sendMessage || null;
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
    return Promise.all([
      this.schedule({
        appointmentId: appointment.id,
        reminderType: 'day_before',
        scheduledAt: dayBefore,
      }),
      this.schedule({
        appointmentId: appointment.id,
        reminderType: 'same_day',
        scheduledAt: sameDay,
      }),
    ]);
  }

  async cancelAppointmentNotifications(appointmentId) {
    validateUuid(appointmentId, 'appointmentId');
    return this.notificationRepository.cancelPendingByAppointment(
      appointmentId
    );
  }

  async rescheduleAppointmentNotifications(appointment) {
    await this.cancelAppointmentNotifications(appointment.id);
    return this.scheduleAppointmentLifecycle(appointment);
  }

  async processDue(limit = 25) {
    if (!this.sendMessage) {
      throw new Error('Notification delivery transport is not configured.');
    }
    const reminders = await this.notificationRepository.claimDue(limit);
    const results = [];
    for (const reminder of reminders) {
      const context = await this.notificationRepository.loadDeliveryContext(
        reminder.id
      );
      if (!context?.recipient) {
        await this.notificationRepository.markFailed(reminder.id);
        results.push({ id: reminder.id, sent: false });
        continue;
      }
      try {
        await this.sendMessage(
          context.recipient,
          buildReminderMessage(context)
        );
        await this.notificationRepository.markSent(reminder.id);
        results.push({ id: reminder.id, sent: true });
      } catch (error) {
        await this.notificationRepository.markFailed(reminder.id);
        results.push({ id: reminder.id, sent: false, error });
      }
    }
    return results;
  }
}

function buildReminderMessage(context) {
  const reference = context.appointment_reference
    ? ` (${context.appointment_reference})`
    : '';
  return `Appointment reminder${reference}: ${new Date(
    context.appointment_start
  ).toISOString()}`;
}

module.exports = NotificationService;
module.exports.REMINDER_TYPES = REMINDER_TYPES;
