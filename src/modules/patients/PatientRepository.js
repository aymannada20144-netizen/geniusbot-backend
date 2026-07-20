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
    return this.create(data);
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
      SELECT *
      FROM geniusbot.patients
      WHERE clinic_id = $1
        AND (
          full_name ILIKE $2
          OR phone_number ILIKE $2
        )
      ORDER BY created_at DESC
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