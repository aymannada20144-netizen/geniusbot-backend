'use strict';

class AppointmentChangeDeliveryRepository {
  constructor(db) { this.db = db; }

  async claim(eventId) {
    const result = await this.db.query(`
      INSERT INTO geniusbot.appointment_change_deliveries (outbox_event_id, status)
      VALUES ($1, 'processing')
      ON CONFLICT (outbox_event_id) DO UPDATE
      SET status = 'processing', attempts = appointment_change_deliveries.attempts + 1,
          retryable = false, retry_at = NULL, updated_at = now()
      WHERE appointment_change_deliveries.status = 'failed'
        AND appointment_change_deliveries.retryable = true
        AND appointment_change_deliveries.retry_at <= now()
      RETURNING *`, [eventId]);
    return result.rows[0] || null;
  }

  async find(eventId) {
    const result = await this.db.query(
      'SELECT * FROM geniusbot.appointment_change_deliveries WHERE outbox_event_id = $1', [eventId]);
    return result.rows[0] || null;
  }

  async markSent(eventId, wamid) {
    const result = await this.db.query(`UPDATE geniusbot.appointment_change_deliveries
      SET status = 'sent', wamid = $2, error_code = NULL, retryable = false, updated_at = now()
      WHERE outbox_event_id = $1 AND status = 'processing' RETURNING outbox_event_id`, [eventId, wamid]);
    if (!result.rows.length) throw new Error('CHANGE_NOTIFICATION_RECEIPT_NOT_SAVED');
  }

  async markFailed(eventId, { uncertain, retryable, errorCode }) {
    const result = await this.db.query(`UPDATE geniusbot.appointment_change_deliveries
      SET status = $2, error_code = $3, retryable = $4,
          retry_at = CASE WHEN $4 THEN now() + interval '1 minute' ELSE NULL END,
          updated_at = now()
      WHERE outbox_event_id = $1 AND status = 'processing' RETURNING outbox_event_id`,
    [eventId, uncertain ? 'uncertain' : 'failed', errorCode, !uncertain && retryable]);
    if (!result.rows.length) throw new Error('CHANGE_NOTIFICATION_FAILURE_NOT_SAVED');
  }
}

module.exports = AppointmentChangeDeliveryRepository;
