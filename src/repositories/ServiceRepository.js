const BaseRepository = require('../core/BaseRepository');
class ServiceRepository extends BaseRepository {
  constructor(db) {
    super(db, 'services');
  }

  async findByClinicId(clinicId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND is_active = true
      ORDER BY display_order, name
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }

  async findBookableByClinicId(clinicId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND is_active = true
      AND is_booking_enabled = true
      ORDER BY display_order, name
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }

  async findActiveById(clinicId, serviceId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND id = $2
      AND is_active = true
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, serviceId]);
    return result.rows[0] || null;
  }

  async findByNameOrAlias(clinicId, searchText) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND is_active = true
      AND is_booking_enabled = true
      AND (
        name ILIKE $2
        OR EXISTS (
          SELECT 1
          FROM unnest(aliases) AS alias
          WHERE alias ILIKE $2
        )
      )
      ORDER BY display_order, name
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, `%${searchText}%`]);
    return result.rows[0] || null;
  }

  async findBySpecialtyId(clinicId, specialtyId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND specialty_id = $2
      AND is_active = true
      AND is_booking_enabled = true
      ORDER BY display_order, name
    `;

    const result = await this.query(sql, [clinicId, specialtyId]);
    return result.rows;
  }
}

module.exports = ServiceRepository;