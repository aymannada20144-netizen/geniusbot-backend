const BaseRepository = require('../../core/BaseRepository');

class PatientRepository extends BaseRepository {
  constructor(db) {
    super(db, 'patients');
  }

  async findByClinicAndId(clinicId, patientId) {
    const sql = `
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND id = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }
async findById(clinicId, patientId) {
  return this.findByClinicAndId(
    clinicId,
    patientId
  );
}
  async findByClinicAndPhone(clinicId, phoneNumber) {
    const sql = `
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND phone_number = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [
      clinicId,
      phoneNumber,
    ]);

    return result.rows[0] || null;
  }

  async createPatient(data) {
    const result = await this.query(`
      INSERT INTO geniusbot.patients (
        clinic_id, full_name, phone_number, whatsapp_id,
        email, gender, birth_date, source, notes, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      data.clinic_id,
      data.full_name,
      data.phone_number,
      data.whatsapp_id,
      data.email,
      data.gender,
      data.birth_date,
      data.source,
      data.notes,
      data.is_active,
    ]);
    return result.rows[0];
  }

  async updatePatient(clinicId, patientId, data) {
    const fields = Object.keys(data);
    if (fields.length === 0) {
      return this.findByClinicAndId(clinicId, patientId);
    }
    const values = fields.map((field) => data[field]);
    const assignments = fields.map(
      (field, index) => `${field} = $${index + 1}`
    );
    values.push(clinicId, patientId);
    const result = await this.query(`
      UPDATE geniusbot.patients
      SET ${assignments.join(', ')}, updated_at = NOW()
      WHERE clinic_id = $${values.length - 1}
        AND id = $${values.length}
      RETURNING *
    `, values);
    return result.rows[0] || null;
  }

  async findByClinicAndWhatsApp(clinicId, whatsappId) {
    const result = await this.query(`
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND whatsapp_id = $2
      LIMIT 1
    `, [clinicId, whatsappId]);
    return result.rows[0] || null;
  }

  async getAppointments(clinicId, patientId) {
    const result = await this.query(`
      SELECT
        a.id,
        a.appointment_start,
        a.appointment_end,
        a.status,
        s.name AS service_name,
        d.full_name AS doctor_name,
        b.name AS branch_name
      FROM geniusbot.appointments a
      LEFT JOIN geniusbot.services s ON s.id = a.service_id
      LEFT JOIN geniusbot.doctors d ON d.id = a.doctor_id
      LEFT JOIN geniusbot.branches b ON b.id = a.branch_id
      WHERE a.clinic_id = $1
        AND a.patient_id = $2
      ORDER BY a.appointment_start DESC
      LIMIT 100
    `, [clinicId, patientId]);
    return result.rows;
  }

  async findOrCreateByClinicAndPhone(data) {
    let patient = await this.findByClinicAndPhone(
      data.clinic_id,
      data.phone_number
    );

    if (patient) {
      return patient;
    }

    patient = await this.create({
      clinic_id: data.clinic_id,
      full_name: data.full_name,
      phone_number: data.phone_number,
      whatsapp_id: data.whatsapp_id,
      source: data.source,
      notes: data.notes,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      is_active: true,
    });

    return patient;
  }

  async searchPatients(
    clinicId,
    {
      search = '',
      limit = 50,
      offset = 0,
    } = {}
  ) {
    const sql = `
      SELECT p.id, p.full_name, p.phone_number, p.email, p.is_active,
        p.updated_at, p.created_at,
        COUNT(a.id)::int AS total_appointments,
        MAX(a.appointment_start) AS latest_appointment_date,
        (ARRAY_AGG(a.status ORDER BY a.appointment_start DESC)
          FILTER (WHERE a.id IS NOT NULL))[1] AS latest_appointment_status,
        BOOL_OR(a.appointment_start >= NOW() AND a.status IN ('pending', 'confirmed'))
          AS has_upcoming_appointment,
        c.id AS conversation_id, c.bot_enabled
      FROM geniusbot.patients p
      LEFT JOIN geniusbot.appointments a
        ON a.patient_id = p.id AND a.clinic_id = p.clinic_id
      LEFT JOIN LATERAL (
        SELECT id, bot_enabled FROM geniusbot.conversations
        WHERE clinic_id = p.clinic_id AND patient_id = p.id AND status = 'open'
        ORDER BY started_at DESC LIMIT 1
      ) c ON true
      WHERE p.clinic_id = $1
        AND (
          p.full_name ILIKE $2 OR p.phone_number ILIKE $2
        )
      GROUP BY p.id, c.id, c.bot_enabled
      ORDER BY p.created_at DESC
      LIMIT $3
      OFFSET $4
    `;

    const result = await this.query(sql, [
      clinicId,
      `%${search}%`,
      limit,
      offset,
    ]);

    return result.rows;
  }

  async updateLastSeen(clinicId, patientId) {
    const sql = `
      UPDATE geniusbot.patients
      SET
        last_seen_at = NOW(),
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }

  async deactivate(clinicId, patientId) {
    const sql = `
      UPDATE geniusbot.patients
      SET
        is_active = false,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }

  async reactivate(clinicId, patientId) {
    const sql = `
      UPDATE geniusbot.patients
      SET
        is_active = true,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING *
    `;

    const result = await this.query(sql, [
      clinicId,
      patientId,
    ]);

    return result.rows[0] || null;
  }
}

module.exports = PatientRepository;
