'use strict';

class MasterDataRepository {
  constructor(db) {
    this.db = db;
  }

  scope(config) {
    if (config.singleton) return 'r.id';
    return config.directClinic ? 'r.clinic_id' : config.scopeColumn;
  }

  async list(config, clinicId, query = {}) {
    const values = [clinicId];
    const clauses = [`${this.scope(config)} = $1`];
    if (query.search) {
      const searchable = config.fields.filter((field) =>
        ['name', 'full_name', 'room_number', 'room_name', 'code', 'class_name', 'question_text'].includes(field)
      );
      if (searchable.length) {
        values.push(`%${query.search}%`);
        clauses.push(`(${searchable.map((field) => `r.${field}::text ILIKE $${values.length}`).join(' OR ')})`);
      }
    }
    if (query.active !== undefined && config.fields.includes('is_active')) {
      values.push(query.active);
      clauses.push(`r.is_active = $${values.length}`);
    }
    for (const field of config.fields.filter((name) => name.endsWith('_id'))) {
      if (query[field]) {
        values.push(query[field]);
        clauses.push(`r.${field} = $${values.length}`);
      }
    }
    const result = await this.db.query(
      `SELECT r.* FROM geniusbot.${config.table} r ${config.scopeJoin || ''} WHERE ${clauses.join(' AND ')} ORDER BY ${config.orderBy || 'r.created_at DESC'}`,
      values
    );
    return result.rows;
  }

  async find(config, clinicId, id) {
    const result = await this.db.query(
      `SELECT r.* FROM geniusbot.${config.table} r ${config.scopeJoin || ''} WHERE ${this.scope(config)} = $1 AND r.id = $2`,
      [clinicId, id]
    );
    return result.rows[0] || null;
  }

  async parentBelongsToClinic(table, id, clinicId) {
    const scopes = {
      branches: 'r.clinic_id',
      doctors: 'r.clinic_id',
      specialties: 'r.clinic_id',
      services: 'r.clinic_id',
      insurance_companies: 'r.clinic_id',
      rooms: 'b.clinic_id',
    };
    const join = table === 'rooms'
      ? 'JOIN geniusbot.branches b ON b.id = r.branch_id'
      : '';
    const result = await this.db.query(
      `SELECT 1 FROM geniusbot.${table} r ${join} WHERE r.id = $1 AND ${scopes[table]} = $2`,
      [id, clinicId]
    );
    return result.rowCount === 1;
  }

  async create(config, clinicId, data) {
    const fields = config.fields.filter((field) => data[field] !== undefined);
    if (config.directClinic) fields.unshift('clinic_id');
    const values = fields.map((field) => field === 'clinic_id' ? clinicId : data[field]);
    const placeholders = fields.map((_, index) => `$${index + 1}`);
    const result = await this.db.query(
      `INSERT INTO geniusbot.${config.table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async update(config, clinicId, id, data) {
    const existing = await this.find(config, clinicId, id);
    if (!existing) return null;
    const fields = config.fields.filter((field) => data[field] !== undefined);
    if (!fields.length) return existing;
    const values = fields.map((field) => data[field]);
    const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
    if (config.fields.includes('is_active') || !['doctor_specialties', 'doctor_time_off', 'room_time_off'].includes(config.table)) {
      assignments.push('updated_at = NOW()');
    }
    values.push(id);
    const result = await this.db.query(
      `UPDATE geniusbot.${config.table} SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async remove(config, clinicId, id) {
    const existing = await this.find(config, clinicId, id);
    if (!existing) return null;
    await this.db.query(`DELETE FROM geniusbot.${config.table} WHERE id = $1`, [id]);
    return existing;
  }
}

module.exports = MasterDataRepository;
