const BaseRepository = require('../core/BaseRepository');
class PatientRepository extends BaseRepository {
  constructor(db) {
    super(db, 'patients');

    this.defaultOrderBy = 'created_at';
    this.allowedOrderColumns = [
      'id',
      'full_name',
      'phone_number',
      'email',
      'source',
      'is_active',
      'first_seen_at',
      'last_seen_at',
      'created_at',
      'updated_at',
    ];
  }

  async findByClinicAndId(clinicId, patientId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
        AND "id" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows[0] || null;
  }

  async findByClinicAndPhone(clinicId, phoneNumber) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
        AND "phone_number" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, phoneNumber]);
    return result.rows[0] || null;
  }

  async findByClinicAndEmail(clinicId, email) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
        AND "email" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, email]);
    return result.rows[0] || null;
  }

  async findByClinicAndWhatsAppId(clinicId, whatsappId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
        AND "whatsapp_id" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, whatsappId]);
    return result.rows[0] || null;
  }

  async createPatient(data) {
    return this.create(data);
  }

    async updateByClinicAndId(clinicId, appointmentId, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
      throw new Error('Update data cannot be empty');
    }

    const setClause = keys
      .map((key, index) => `${this.quoteIdentifier(key)} = $${index + 1}`)
      .join(', ');

    const sql = `
      UPDATE ${this.fullTableName}
      SET ${setClause}, "updated_at" = NOW()
      WHERE "clinic_id" = $${keys.length + 1}
        AND "id" = $${keys.length + 2}
      RETURNING *
    `;

    const result = await this.query(sql, [...values, clinicId, appointmentId]);
    return result.rows[0] || null;
  }

  async updateStatus(clinicId, appointmentId, status) {
    return this.updateByClinicAndId(clinicId, appointmentId, { status });
  }

  async cancelAppointment(clinicId, appointmentId, notes = null) {
    return this.updateByClinicAndId(clinicId, appointmentId, {
      status: 'cancelled',
      notes,
    });
  }

  async completeAppointment(clinicId, appointmentId) {
    return this.updateByClinicAndId(clinicId, appointmentId, {
      status: 'completed',
    });
  }

  async markAppointmentAsNoShow(clinicId, appointmentId) {
    return this.updateByClinicAndId(clinicId, appointmentId, {
      status: 'no_show',
    });
  }

  async updateAppointmentSchedule(clinicId, appointmentId, data) {
    return this.updateByClinicAndId(clinicId, appointmentId, {
      appointment_start: data.appointment_start,
      appointment_end: data.appointment_end,
    });
  }

  async searchPatients({
    clinicId,
    search = null,
    isActive = null,
    limit = 50,
    offset = 0,
    orderBy = this.defaultOrderBy,
    orderDirection = 'DESC',
  }) {
    const values = [clinicId];
    const conditions = ['"clinic_id" = $1'];

    if (typeof isActive === 'boolean') {
      values.push(isActive);
      conditions.push(`"is_active" = $${values.length}`);
    }

    if (search && String(search).trim() !== '') {
      values.push(`%${String(search).trim()}%`);

      conditions.push(`
        (
          "full_name" ILIKE $${values.length}
          OR "phone_number" ILIKE $${values.length}
          OR "email" ILIKE $${values.length}
        )
      `);
    }

    const safeOrderBy = this.validateColumnName(orderBy);
    const safeOrderDirection = this.validateOrderDirection(orderDirection);

    values.push(limit);
    const limitIndex = values.length;

    values.push(offset);
    const offsetIndex = values.length;

    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${safeOrderBy} ${safeOrderDirection}
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `;

    const result = await this.query(sql, values);
    return result.rows;
  }

  async countPatients({
    clinicId,
    search = null,
    isActive = null,
  }) {
    const values = [clinicId];
    const conditions = ['"clinic_id" = $1'];

    if (typeof isActive === 'boolean') {
      values.push(isActive);
      conditions.push(`"is_active" = $${values.length}`);
    }

    if (search && String(search).trim() !== '') {
      values.push(`%${String(search).trim()}%`);

      conditions.push(`
        (
          "full_name" ILIKE $${values.length}
          OR "phone_number" ILIKE $${values.length}
          OR "email" ILIKE $${values.length}
        )
      `);
    }

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM ${this.fullTableName}
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.query(sql, values);
    return result.rows[0]?.count || 0;
  }

  async updateLastSeen(clinicId, patientId) {
    const sql = `
      UPDATE ${this.fullTableName}
      SET
        "last_seen_at" = NOW(),
        "updated_at" = NOW()
      WHERE "clinic_id" = $1
        AND "id" = $2
      RETURNING *
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows[0] || null;
  }

  async deactivate(clinicId, patientId) {
    const sql = `
      UPDATE ${this.fullTableName}
      SET
        "is_active" = false,
        "updated_at" = NOW()
      WHERE "clinic_id" = $1
        AND "id" = $2
      RETURNING *
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows[0] || null;
  }

  async reactivate(clinicId, patientId) {
    const sql = `
      UPDATE ${this.fullTableName}
      SET
        "is_active" = true,
        "updated_at" = NOW()
      WHERE "clinic_id" = $1
        AND "id" = $2
      RETURNING *
    `;

    const result = await this.query(sql, [clinicId, patientId]);
    return result.rows[0] || null;
  }
}

module.exports = PatientRepository;