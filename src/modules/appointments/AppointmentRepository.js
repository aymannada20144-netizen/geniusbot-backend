const BaseRepository = require('../../core/BaseRepository');

class AppointmentRepository extends BaseRepository {
  constructor(db) {
    super(db, 'appointments');
  }

  async createAppointment(data) {
    return this.create({
      clinic_id: data.clinic_id,
      branch_id: data.branch_id,
      patient_id: data.patient_id,
      service_id: data.service_id,
      doctor_id: data.doctor_id || null,
      room_id: data.room_id || null,
      conversation_id: data.conversation_id || null,
      appointment_start: data.appointment_start,
      appointment_end: data.appointment_end,
      payment_method_id: data.payment_method_id || null,
      insurance_company_id: data.insurance_company_id || null,
      insurance_class_id: data.insurance_class_id || null,
      quoted_price: data.quoted_price || null,
      currency: data.currency || 'SAR',
      status: data.status || 'pending',
      source: data.source || 'whatsapp_direct',
      notes: data.notes || null,
    });
  }

  async findByClinicId(clinicId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
      ORDER BY "appointment_start" DESC
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }

  async findUpcomingByPatient(clinicId, patientId) {
    const sql = `
      SELECT
        a."id",
        a."clinic_id",
        a."branch_id",
        a."patient_id",
        a."service_id",
        a."doctor_id",
        a."room_id",
        a."appointment_start",
        a."appointment_end",
        a."status",
        a."notes",
        s."name" AS "service_name",
        d."full_name" AS "doctor_name",
        b."name" AS "branch_name",
        r."room_name",
        r."room_number"
      FROM ${this.fullTableName} a
      LEFT JOIN "geniusbot"."services" s
        ON s."id" = a."service_id"
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = a."doctor_id"
      LEFT JOIN "geniusbot"."branches" b
        ON b."id" = a."branch_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = a."room_id"
      WHERE a."clinic_id" = $1
        AND a."patient_id" = $2
        AND a."appointment_start" >= NOW()
        AND a."status" IN ('pending', 'confirmed')
      ORDER BY a."appointment_start" ASC
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows[0] || null;
  }

  async findAppointmentHistoryByPatient(clinicId, patientId) {
    const sql = `
      SELECT
        a."id",
        a."clinic_id",
        a."branch_id",
        a."patient_id",
        a."service_id",
        a."doctor_id",
        a."room_id",
        a."appointment_start",
        a."appointment_end",
        a."status",
        a."notes",
        s."name" AS "service_name",
        d."full_name" AS "doctor_name",
        b."name" AS "branch_name",
        r."room_name",
        r."room_number"
      FROM ${this.fullTableName} a
      LEFT JOIN "geniusbot"."services" s
        ON s."id" = a."service_id"
      LEFT JOIN "geniusbot"."doctors" d
        ON d."id" = a."doctor_id"
      LEFT JOIN "geniusbot"."branches" b
        ON b."id" = a."branch_id"
      LEFT JOIN "geniusbot"."rooms" r
        ON r."id" = a."room_id"
      WHERE a."clinic_id" = $1
        AND a."patient_id" = $2
      ORDER BY a."appointment_start" DESC
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows;
  }

  async hasDoctorConflict(
    doctorId,
    startTime,
    endTime,
    excludeAppointmentId = null
  ) {
    if (!doctorId) return false;

    let sql = `
      SELECT "id"
      FROM ${this.fullTableName}
      WHERE "doctor_id" = $1
        AND "status" IN ('pending', 'confirmed')
        AND "appointment_start" < $3
        AND "appointment_end" > $2
    `;

    const values = [doctorId, startTime, endTime];

    if (excludeAppointmentId) {
      sql += `
        AND "id" <> $4
      `;
      values.push(excludeAppointmentId);
    }

    sql += `
      LIMIT 1
    `;

    const result = await this.query(sql, values);
    return result.rows.length > 0;
  }

  async hasRoomConflict(
    roomId,
    startTime,
    endTime,
    excludeAppointmentId = null
  ) {
    if (!roomId) return false;

    let sql = `
      SELECT "id"
      FROM ${this.fullTableName}
      WHERE "room_id" = $1
        AND "status" IN ('pending', 'confirmed')
        AND "appointment_start" < $3
        AND "appointment_end" > $2
    `;

    const values = [roomId, startTime, endTime];

    if (excludeAppointmentId) {
      sql += `
        AND "id" <> $4
      `;
      values.push(excludeAppointmentId);
    }

    sql += `
      LIMIT 1
    `;

    const result = await this.query(sql, values);
    return result.rows.length > 0;
  }

  async updateStatus(clinicId, appointmentId, status) {
    return this.updateByIdAndClinic(clinicId, appointmentId, { status });
  }

  async cancelAppointment(clinicId, appointmentId, notes = null) {
    return this.updateByIdAndClinic(clinicId, appointmentId, {
      status: 'cancelled',
      notes,
    });
  }

  async completeAppointment(clinicId, appointmentId) {
    return this.updateByIdAndClinic(clinicId, appointmentId, {
      status: 'completed',
    });
  }

  async markAppointmentAsNoShow(clinicId, appointmentId) {
    return this.updateByIdAndClinic(clinicId, appointmentId, {
      status: 'no_show',
    });
  }

  async updateAppointmentSchedule(clinicId, appointmentId, data) {
    return this.updateByIdAndClinic(clinicId, appointmentId, {
      appointment_start: data.appointment_start,
      appointment_end: data.appointment_end,
    });
  }
}

module.exports = AppointmentRepository;