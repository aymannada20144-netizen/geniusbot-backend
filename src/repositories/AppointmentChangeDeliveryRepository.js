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

  async findByWamid(wamid) {
    const result = await this.db.query(
      'SELECT * FROM geniusbot.appointment_change_deliveries WHERE wamid = $1 LIMIT 1', [wamid]);
    return result.rows[0] || null;
  }

  async updateProviderStatus(wamid, providerStatus, occurredAt, errorCode = null) {
    const status = ['sent', 'delivered', 'read', 'failed'].includes(providerStatus)
      ? providerStatus : null;
    if (!status) return null;
    const result = await this.db.query(`UPDATE geniusbot.appointment_change_deliveries
      SET status = CASE
            WHEN status = 'read' THEN 'read'
            WHEN status = 'failed' THEN 'failed'
            WHEN $2 = 'read' THEN 'read'
            WHEN status = 'delivered' AND $2 IN ('sent', 'failed') THEN 'delivered'
            ELSE $2 END,
          provider_status_at = COALESCE(provider_status_at, $3),
          error_code = CASE WHEN $2 = 'failed' THEN $4 ELSE error_code END,
          updated_at = now()
      WHERE wamid = $1 RETURNING *`, [wamid, status, occurredAt, errorCode]);
    return result.rows[0] || null;
  }
}

module.exports = AppointmentChangeDeliveryRepository;
