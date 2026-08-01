'use strict';

const BaseRepository = require('../../core/BaseRepository');

const BREAKDOWN_EXPRESSIONS = Object.freeze({
  city: {
    id: 'COALESCE(b.city, \'unknown\')',
    label: 'COALESCE(NULLIF(BTRIM(b.city), \'\'), \'Unknown\')',
  },
  branch: {
    id: 'a.branch_id::text',
    label: 'COALESCE(b.name, \'Unknown\')',
  },
  service: {
    id: 'a.service_id::text',
    label: 'COALESCE(s.name, \'Unknown\')',
  },
  doctor: {
    id: 'a.doctor_id::text',
    label: 'COALESCE(d.full_name, \'Unknown\')',
  },
  status: {
    id: 'a.status',
    label: 'COALESCE(NULLIF(BTRIM(a.status), \'\'), \'Unknown\')',
  },
  source: {
    id: 'COALESCE(NULLIF(BTRIM(a.source), \'\'), \'unknown\')',
    label: 'COALESCE(NULLIF(BTRIM(a.source), \'\'), \'Unknown\')',
  },
});

class ReportsRepository extends BaseRepository {
  constructor(db) {
    super(db, 'appointments');
  }

  async getClinicTimezone(clinicId) {
    const result = await this.query(
      `SELECT timezone
         FROM geniusbot.clinics
        WHERE id = $1
        LIMIT 1`,
      [clinicId]
    );
    return result.rows[0]?.timezone || null;
  }

  async resourceBelongsToClinic(resource, clinicId, id) {
    const definitions = {
      branch: ['branches', 'clinic_id'],
      service: ['services', 'clinic_id'],
      doctor: ['doctors', 'clinic_id'],
    };
    const [table, clinicColumn] = definitions[resource];
    const result = await this.query(
      `SELECT 1
         FROM geniusbot.${table}
        WHERE ${clinicColumn} = $1
          AND id = $2
        LIMIT 1`,
      [clinicId, id]
    );
    return result.rowCount > 0;
  }

  buildAppointmentScope(clinicId, timezone, filters, dateColumn) {
    const values = [clinicId, filters.from, filters.to, timezone];
    const conditions = [
      'a.clinic_id = $1',
      `${dateColumn} >= ($2::date::timestamp AT TIME ZONE $4)`,
      `${dateColumn} < (($3::date + 1)::timestamp AT TIME ZONE $4)`,
    ];
    const add = (sql, value) => {
      values.push(value);
      conditions.push(sql.replace('?', `$${values.length}`));
    };
    if (filters.branchId) add('a.branch_id = ?', filters.branchId);
    if (filters.city) add('b.city = ?', filters.city);
    if (filters.serviceId) add('a.service_id = ?', filters.serviceId);
    if (filters.doctorId) add('a.doctor_id = ?', filters.doctorId);
    if (filters.status) add('a.status = ?', filters.status);
    return { clause: conditions.join('\n AND '), values };
  }

  appointmentJoins() {
    return `
      LEFT JOIN geniusbot.branches b
        ON b.id = a.branch_id AND b.clinic_id = a.clinic_id
      LEFT JOIN geniusbot.services s
        ON s.id = a.service_id AND s.clinic_id = a.clinic_id
      LEFT JOIN geniusbot.doctors d
        ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id`;
  }

  async getAppointmentSummary(clinicId, timezone, filters) {
    const scope = this.buildAppointmentScope(
      clinicId, timezone, filters, 'a.appointment_start'
    );
    const result = await this.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE a.status IN ('pending','confirmed','checked_in','completed','cancelled','no_show')
         )::int AS total,
         COUNT(*) FILTER (WHERE a.status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE a.status = 'confirmed')::int AS confirmed,
         COUNT(*) FILTER (WHERE a.status = 'checked_in')::int AS checked_in,
         COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
         COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_show,
         COUNT(*) FILTER (WHERE a.status = 'rescheduled')::int AS rescheduled
       FROM geniusbot.appointments a
       ${this.appointmentJoins()}
       WHERE ${scope.clause}`,
      scope.values
    );
    return result.rows[0];
  }

  async getAppointmentTrend(clinicId, timezone, filters, groupBy) {
    const appointmentScope = this.buildAppointmentScope(
      clinicId, timezone, filters, 'a.appointment_start'
    );
    const bookingScope = this.buildAppointmentScope(
      clinicId, timezone, filters, 'a.created_at'
    );
    const weekStart = `(d::date - (((EXTRACT(DOW FROM d)::int + 1) % 7))::int)`;
    const periodExpression = groupBy === 'week'
      ? weekStart
      : 'd';
    const appointmentPeriod = groupBy === 'week'
      ? `((a.appointment_start AT TIME ZONE $4)::date -
          (((EXTRACT(DOW FROM a.appointment_start AT TIME ZONE $4)::int + 1) % 7))::int)`
      : '(a.appointment_start AT TIME ZONE $4)::date';
    const bookingPeriod = groupBy === 'week'
      ? `((a.created_at AT TIME ZONE $4)::date -
          (((EXTRACT(DOW FROM a.created_at AT TIME ZONE $4)::int + 1) % 7))::int)`
      : '(a.created_at AT TIME ZONE $4)::date';
    const result = await this.query(
      `WITH calendar AS (
         SELECT DISTINCT ${periodExpression}::date AS period_start
         FROM generate_series($2::date, $3::date, interval '1 day') value(d)
       ),
       appointments AS (
         SELECT ${appointmentPeriod} AS period_start, COUNT(*)::int AS count
         FROM geniusbot.appointments a
         ${this.appointmentJoins()}
         WHERE ${appointmentScope.clause}
           AND a.status IN ('pending','confirmed','checked_in','completed','cancelled','no_show')
         GROUP BY 1
       ),
       bookings AS (
         SELECT ${bookingPeriod} AS period_start, COUNT(*)::int AS count
         FROM geniusbot.appointments a
         ${this.appointmentJoins()}
         WHERE ${bookingScope.clause}
         GROUP BY 1
       )
       SELECT TO_CHAR(c.period_start, 'YYYY-MM-DD') AS period_start,
              COALESCE(a.count, 0)::int AS appointments,
              COALESCE(n.count, 0)::int AS new_bookings
       FROM calendar c
       LEFT JOIN appointments a ON a.period_start = c.period_start
       LEFT JOIN bookings n ON n.period_start = c.period_start
       ORDER BY c.period_start`,
      appointmentScope.values
    );
    return result.rows;
  }

  async getAppointmentBreakdown(
    clinicId, timezone, filters, groupBy
  ) {
    const scope = this.buildAppointmentScope(
      clinicId, timezone, filters, 'a.appointment_start'
    );
    const expression = BREAKDOWN_EXPRESSIONS[groupBy];
    const result = await this.query(
      `SELECT ${expression.id} AS resource_id,
              ${expression.label} AS label,
              COUNT(*) FILTER (
                WHERE a.status IN ('pending','confirmed','checked_in','completed','cancelled','no_show')
              )::int AS count,
              COUNT(*) FILTER (WHERE a.status = 'checked_in')::int AS checked_in,
              COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
              COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_show,
              COUNT(*) FILTER (WHERE a.status = 'rescheduled')::int AS rescheduled
       FROM geniusbot.appointments a
       ${this.appointmentJoins()}
       WHERE ${scope.clause}
       GROUP BY ${expression.id}, ${expression.label}
       ORDER BY count DESC, label ASC, resource_id ASC NULLS LAST`,
      scope.values
    );
    return result.rows;
  }

  async getPatientSummary(clinicId, timezone, filters) {
    const scope = this.buildAppointmentScope(
      clinicId, timezone, filters, 'a.appointment_start'
    );
    const result = await this.query(
      `WITH scoped_appointments AS (
         SELECT DISTINCT a.patient_id
         FROM geniusbot.appointments a
         ${this.appointmentJoins()}
         WHERE ${scope.clause}
           AND a.patient_id IS NOT NULL
       )
       SELECT
         (SELECT COUNT(*)::int
            FROM geniusbot.patients p
           WHERE p.clinic_id = $1
             AND p.created_at >= ($2::date::timestamp AT TIME ZONE $4)
             AND p.created_at < (($3::date + 1)::timestamp AT TIME ZONE $4)
         ) AS new_patient_records,
         COUNT(*)::int AS patients_with_appointments,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1 FROM geniusbot.appointments old
             WHERE old.clinic_id = $1
               AND old.patient_id = sa.patient_id
               AND old.appointment_start < ($2::date::timestamp AT TIME ZONE $4)
           )
         )::int AS first_time_booked_patients,
         COUNT(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM geniusbot.appointments old
             WHERE old.clinic_id = $1
               AND old.patient_id = sa.patient_id
               AND old.appointment_start < ($2::date::timestamp AT TIME ZONE $4)
           )
         )::int AS returning_booked_patients
       FROM scoped_appointments sa`,
      scope.values
    );
    return result.rows[0];
  }

  async getConversationSummary(clinicId, timezone, filters) {
    const values = [clinicId, filters.from, filters.to, timezone];
    const conditions = [
      'c.clinic_id = $1',
      'c.started_at >= ($2::date::timestamp AT TIME ZONE $4)',
      'c.started_at < (($3::date + 1)::timestamp AT TIME ZONE $4)',
    ];
    if (filters.branchId || filters.city || filters.serviceId ||
        filters.doctorId || filters.status) {
      const scope = this.buildAppointmentScope(
        clinicId, timezone, filters, 'a.appointment_start'
      );
      values.splice(0, values.length, ...scope.values);
      conditions.push(`EXISTS (
        SELECT 1 FROM geniusbot.appointments a
        ${this.appointmentJoins()}
        WHERE a.conversation_id = c.id AND ${scope.clause}
      )`);
    }
    const result = await this.query(
      `SELECT COUNT(*)::int AS total_conversations,
              COUNT(*) FILTER (WHERE c.handover_at IS NOT NULL)::int AS human_takeovers,
              COUNT(*) FILTER (WHERE c.bot_enabled = true)::int AS ai_present_conversations
       FROM geniusbot.conversations c
       WHERE ${conditions.join('\n AND ')}`,
      values
    );
    return result.rows[0];
  }
}

module.exports = ReportsRepository;
