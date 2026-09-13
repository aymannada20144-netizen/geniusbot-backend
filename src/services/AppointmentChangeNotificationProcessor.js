'use strict';

class AppointmentChangeNotificationProcessor {
  constructor({ deliveryRepository, notificationService, logger = console }) {
    this.deliveries = deliveryRepository;
    this.notifications = notificationService;
    this.logger = logger;
  }

  async process(payload, { outboxEventId } = {}) {
    // Other operations retain their existing post-commit senders.
    if (payload?.operation !== 'change_service') return;
    if (!outboxEventId || !payload.appointmentId) throw new Error('CHANGE_NOTIFICATION_EVENT_INCOMPLETE');
    const claim = await this.deliveries.claim(outboxEventId);
    if (!claim) {
      const receipt = await this.deliveries.find(outboxEventId);
      if (['sent', 'delivered', 'read'].includes(receipt?.status) || receipt?.status === 'uncertain' ||
          (receipt?.status === 'failed' && receipt.retryable === false)) return;
      // A concurrent sender or a retry scheduled for later still owns this event.
      throw new Error('CHANGE_NOTIFICATION_PENDING');
    }

    let result;
    try {
      result = await this.notifications.sendRescheduleConfirmation(payload.appointmentId);
    } catch (error) {
      // Never repeat a send whose external outcome cannot be established.
      result = { success: false, deliveryUncertain: true, errorCode: error.code || 'DELIVERY_UNCERTAIN' };
    }
    if (result?.success && result.messageId) {
      this.logger.info?.({ event: 'APPOINTMENT_CHANGE_META_ACCEPTED', outboxEventId,
        appointmentId: payload.appointmentId, wamid: result.messageId });
      // A persistence failure intentionally leaves processing locked for reconciliation.
      // Reclaiming it could duplicate an already accepted Meta message.
      try {
        await this.deliveries.markSent(outboxEventId, result.messageId);
      } catch (error) {
        this.logger.error?.({ event: 'APPOINTMENT_CHANGE_RECEIPT_FAILED', outboxEventId,
          wamid: result.messageId, errorCode: error.code || 'RECEIPT_PERSISTENCE_FAILED' });
        throw error;
      }
      this.logger.info?.({ event: 'APPOINTMENT_CHANGE_NOTIFICATION_SENT', outboxEventId,
        appointmentId: payload.appointmentId, wamid: result.messageId });
      return;
    }
    const uncertain = result?.deliveryUncertain === true || result?.success === true;
    const retryable = !uncertain && result?.retryable !== false;
    const errorCode = result?.errorCode || (uncertain ? 'DELIVERY_UNCERTAIN' : 'CHANGE_NOTIFICATION_FAILED');
    await this.deliveries.markFailed(outboxEventId, { uncertain, retryable, errorCode });
    this.logger.error?.({ event: 'APPOINTMENT_CHANGE_NOTIFICATION_FAILED', outboxEventId,
      appointmentId: payload.appointmentId, errorCode, retryable,
      status: uncertain ? 'uncertain' : 'failed' });
    if (retryable) throw new Error(errorCode);
  }
}

module.exports = AppointmentChangeNotificationProcessor;
