'use strict';

const BaseRepository = require('../core/BaseRepository');

/**
 * Owns appointment reminder queue persistence.
 */
class NotificationRepository extends BaseRepository {
  constructor(db) {
    super(db, 'appointment_reminders');
  }

  async scheduleReminder({
    appointmentId,
    reminderType,
    scheduledAt,
  }) {
    console.info('INSERT into appointment_reminders.', {
      appointmentId,
      reminderType,
      scheduledAt,
    });
    const result = await this.query(
      `INSERT INTO geniusbot.appointment_reminders (
          appointment_id,
          reminder_type,
          scheduled_at,
          status
       ) VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (appointment_id, reminder_type)
       DO UPDATE SET
         scheduled_at = EXCLUDED.scheduled_at,
         sent_at = NULL,
         status = 'pending',
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        appointmentId,
        reminderType,
        scheduledAt,
      ]
    );

    return result.rows[0];
  }

  async scheduleCancellation(appointmentId) {
    const result = await this.query(
      `INSERT INTO geniusbot.appointment_reminders (
          appointment_id, reminder_type, scheduled_at, status
       ) VALUES ($1, 'cancellation', CURRENT_TIMESTAMP, 'pending')
       ON CONFLICT (appointment_id, reminder_type) DO NOTHING
       RETURNING *`,
      [appointmentId]
    );
    return result.rows[0] || null;
  }

  async claimCancellation(reminderId) {
    const result = await this.query(
      `UPDATE geniusbot.appointment_reminders
          SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [reminderId]
    );
    return result.rows[0] || null;
  }

  async releaseForRetry(reminderId) {
    const result = await this.query(
      `UPDATE geniusbot.appointment_reminders
          SET status = 'pending', scheduled_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'processing'
       RETURNING *`,
      [reminderId]
    );
    return result.rows[0] || null;
  }

  async cancelPendingByAppointment(appointmentId) {
    const result = await this.query(
      `UPDATE geniusbot.appointment_reminders
          SET status = 'cancelled',
              updated_at = CURRENT_TIMESTAMP
        WHERE appointment_id = $1
          AND status = 'pending'
       RETURNING *`,
      [appointmentId]
    );

    return result.rows;
  }

  async claimDue(limit = 25) {
    const result = await this.query(
      `WITH due AS (
         SELECT ar.id
           FROM geniusbot.appointment_reminders AS ar
           JOIN geniusbot.appointments AS a
             ON a.id = ar.appointment_id
          WHERE ar.status = 'pending'
            AND ar.scheduled_at <= CURRENT_TIMESTAMP
            AND (
              (
                ar.reminder_type IN ('day_before', 'same_day')
                AND a.status IN ('pending', 'confirmed')
              )
              OR (
                ar.reminder_type IN ('followup', 'google_review')
                AND a.status = 'completed'
              )
              OR (
                ar.reminder_type = 'cancellation'
                AND a.status = 'cancelled'
              )
            )
          ORDER BY ar.scheduled_at, ar.id
          FOR UPDATE OF ar SKIP LOCKED
          LIMIT $1
       )
       UPDATE geniusbot.appointment_reminders AS ar
          SET status = 'processing',
              updated_at = CURRENT_TIMESTAMP
         FROM due
        WHERE ar.id = due.id
       RETURNING ar.*`,
      [limit]
    );

    return result.rows;
  }

  async loadDeliveryContext(reminderId) {
    const result = await this.query(
      `SELECT
         ar.*,
         ar.status AS reminder_status,
         a.clinic_id,
         a.status AS appointment_status,
         a.booking_reference AS appointment_reference,
         a.appointment_start,
         p.id AS patient_id,
         p.full_name AS patient_name,
         COALESCE(
           p.whatsapp_id,
           p.phone_number
         ) AS recipient,
         s.name AS service_name,
         d.full_name AS doctor_name,
         b.name AS branch_name,
         r.room_number,
         b.google_maps_url AS review_url,
         c.name AS clinic_name,
         c.timezone AS clinic_timezone
       FROM geniusbot.appointment_reminders AS ar
       JOIN geniusbot.appointments AS a
         ON a.id = ar.appointment_id
       JOIN geniusbot.clinics AS c
         ON c.id = a.clinic_id
       JOIN geniusbot.patients AS p
         ON p.id = a.patient_id
        AND p.clinic_id = a.clinic_id
       JOIN geniusbot.services AS s
         ON s.id = a.service_id
        AND s.clinic_id = a.clinic_id
       JOIN geniusbot.branches AS b
         ON b.id = a.branch_id
        AND b.clinic_id = a.clinic_id
       LEFT JOIN geniusbot.doctors AS d
         ON d.id = a.doctor_id
        AND d.clinic_id = a.clinic_id
       LEFT JOIN geniusbot.rooms AS r
         ON r.id = a.room_id
      WHERE ar.id = $1
      LIMIT 1`,
      [reminderId]
    );

    return result.rows[0] || null;
  }

  async loadAppointmentDeliveryContext(appointmentId) {
    const result = await this.query(
      `SELECT
         a.id AS appointment_id,
         a.clinic_id,
         a.status AS appointment_status,
         a.booking_reference AS appointment_reference,
         a.appointment_start,
         p.id AS patient_id,
         p.full_name AS patient_name,
         COALESCE(
           p.whatsapp_id,
           p.phone_number
         ) AS recipient,
         s.name AS service_name,
         d.full_name AS doctor_name,
         b.name AS branch_name,
         r.room_number,
         c.name AS clinic_name,
         c.timezone AS clinic_timezone
       FROM geniusbot.appointments AS a
       JOIN geniusbot.clinics AS c
         ON c.id = a.clinic_id
       JOIN geniusbot.patients AS p
         ON p.id = a.patient_id
        AND p.clinic_id = a.clinic_id
       JOIN geniusbot.services AS s
         ON s.id = a.service_id
        AND s.clinic_id = a.clinic_id
       JOIN geniusbot.branches AS b
         ON b.id = a.branch_id
        AND b.clinic_id = a.clinic_id
       LEFT JOIN geniusbot.doctors AS d
         ON d.id = a.doctor_id
        AND d.clinic_id = a.clinic_id
       LEFT JOIN geniusbot.rooms AS r
         ON r.id = a.room_id
       WHERE a.id = $1
       LIMIT 1`,
      [appointmentId]
    );

    return result.rows[0] || null;
  }

  async markSent(reminderId) {
    const result = await this.query(
      `UPDATE geniusbot.appointment_reminders
          SET status = 'sent',
              sent_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status = 'processing'
       RETURNING *`,
      [reminderId]
    );

    return result.rows[0] || null;
  }

  async markFailed(reminderId) {
    const result = await this.query(
      `UPDATE geniusbot.appointment_reminders
          SET status = 'failed',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status = 'processing'
       RETURNING *`,
      [reminderId]
    );

    return result.rows[0] || null;
  }

  async markCancelled(reminderId) {
    const result = await this.query(
      `UPDATE geniusbot.appointment_reminders
          SET status = 'cancelled',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status = 'processing'
       RETURNING *`,
      [reminderId]
    );

    return result.rows[0] || null;
  }
}

module.exports = NotificationRepository;
