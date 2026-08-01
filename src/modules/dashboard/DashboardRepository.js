const BaseRepository = require('../../core/BaseRepository');

class DashboardRepository extends BaseRepository {
  constructor(db) {
    super(db, 'appointments');
  }

  async getAppointmentStats(clinicId) {
    const sql = `
      SELECT
        COUNT(*)::int AS total_appointments,

        COUNT(*) FILTER (
          WHERE status = 'confirmed'
        )::int AS confirmed_appointments,

        COUNT(*) FILTER (
          WHERE status = 'checked_in'
        )::int AS checked_in_appointments,

        COUNT(*) FILTER (
          WHERE status = 'pending'
        )::int AS pending_appointments,

        COUNT(*) FILTER (
          WHERE status = 'completed'
        )::int AS completed_appointments,

        COUNT(*) FILTER (
          WHERE status = 'cancelled'
        )::int AS cancelled_appointments,

        COUNT(*) FILTER (
          WHERE status = 'no_show'
        )::int AS no_show_appointments,

        COUNT(*) FILTER (
          WHERE appointment_start::date = CURRENT_DATE
        )::int AS today_appointments,

        COUNT(*) FILTER (
          WHERE appointment_start >= CURRENT_DATE
            AND appointment_start < CURRENT_DATE + INTERVAL '7 days'
        )::int AS upcoming_7_days

      FROM geniusbot.appointments
      WHERE clinic_id = $1
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows[0];
  }

  async getAppointmentsList(clinicId, options = {}) {
    const limit = Number(options.limit) || 50;
    const offset = Number(options.offset) || 0;

    const sql = `
      SELECT
        a.id,
        a.clinic_id,
        a.branch_id,
        a.patient_id,
        a.service_id,
        a.doctor_id,
        a.room_id,
        a.appointment_start,
        a.appointment_end,
        a.status,
        a.notes,

        p.full_name AS patient_name,
        p.phone_number AS patient_phone,

        s.name AS service_name,
        d.full_name AS doctor_name,
        b.name AS branch_name,

        r.room_name,
        r.room_number

      FROM geniusbot.appointments a

      LEFT JOIN geniusbot.patients p
        ON p.id = a.patient_id
       AND p.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.services s
        ON s.id = a.service_id
       AND s.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.doctors d
        ON d.id = a.doctor_id
       AND d.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.branches b
        ON b.id = a.branch_id
       AND b.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.rooms r
        ON r.id = a.room_id
       AND r.branch_id = a.branch_id

      WHERE a.clinic_id = $1

      ORDER BY a.appointment_start DESC

      LIMIT $2
      OFFSET $3
    `;

    const result = await this.query(sql, [clinicId, limit, offset]);
    return result.rows;
  }

  async getPatientsList(clinicId, options = {}) {
    const limit = Number(options.limit) || 50;
    const offset = Number(options.offset) || 0;

    const sql = `
      SELECT
        p.id,
        p.clinic_id,
        p.full_name,
        p.phone_number,
        p.whatsapp_id,
        p.gender,
        p.birth_date,
        p.source,
        p.notes,
        p.first_seen_at,
        p.last_seen_at,
        p.created_at,
        p.updated_at

      FROM geniusbot.patients p

      WHERE p.clinic_id = $1

      ORDER BY p.created_at DESC

      LIMIT $2
      OFFSET $3
    `;

    const result = await this.query(sql, [clinicId, limit, offset]);
    return result.rows;
  }

  async getTodaySchedule(clinicId) {
    const sql = `
      SELECT
        a.id,
        a.clinic_id,
        a.branch_id,
        a.patient_id,
        a.service_id,
        a.doctor_id,
        a.room_id,
        a.appointment_start,
        a.appointment_end,
        a.status,
        a.notes,

        p.full_name AS patient_name,
        p.phone_number AS patient_phone,

        s.name AS service_name,
        d.full_name AS doctor_name,
        b.name AS branch_name,

        r.room_name,
        r.room_number

      FROM geniusbot.appointments a

      LEFT JOIN geniusbot.patients p
        ON p.id = a.patient_id
       AND p.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.services s
        ON s.id = a.service_id
       AND s.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.doctors d
        ON d.id = a.doctor_id
       AND d.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.branches b
        ON b.id = a.branch_id
       AND b.clinic_id = a.clinic_id

      LEFT JOIN geniusbot.rooms r
        ON r.id = a.room_id
       AND r.branch_id = a.branch_id

      WHERE a.clinic_id = $1
        AND a.appointment_start >= CURRENT_DATE
        AND a.appointment_start < CURRENT_DATE + INTERVAL '1 day'
        AND a.status IN ('pending', 'confirmed', 'checked_in')

      ORDER BY a.appointment_start ASC
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }

  async updateAppointmentStatus(clinicId, appointmentId, status) {
    const sql = `
      UPDATE geniusbot.appointments
      SET
        status = $3,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING
        id,
        clinic_id,
        branch_id,
        patient_id,
        service_id,
        doctor_id,
        room_id,
        appointment_start,
        appointment_end,
        status,
        notes,
        created_at,
        updated_at
    `;

    const result = await this.query(sql, [
      clinicId,
      appointmentId,
      status,
    ]);

    return result.rows[0] || null;
  }

  async findAppointmentById(clinicId, appointmentId) {
    const result = await this.query(
      `SELECT id, status
         FROM geniusbot.appointments
        WHERE clinic_id = $1 AND id = $2
        LIMIT 1`,
      [clinicId, appointmentId]
    );
    return result.rows[0] || null;
  }
}

module.exports = DashboardRepository;
