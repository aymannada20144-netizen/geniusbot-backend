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
        ['name', 'city', 'address', 'full_name', 'room_number', 'room_name', 'code', 'class_name', 'question_text'].includes(field)
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
    if (query.city && config.fields.includes('city')) {
      values.push(query.city.trim());
      clauses.push(`lower(btrim(r.city)) = lower(btrim($${values.length}))`);
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

  async findBranch(branchId) {
    const result = await this.db.query(
      `SELECT id, clinic_id, is_active
       FROM geniusbot.branches
       WHERE id = $1
       LIMIT 1`,
      [branchId]
    );
    return result.rows[0] || null;
  }

  async findRoomForClinic(clinicId, roomId) {
    const result = await this.db.query(
      `SELECT r.*, b.clinic_id, b.is_active AS branch_is_active
       FROM geniusbot.rooms r
       JOIN geniusbot.branches b ON b.id = r.branch_id
       WHERE b.clinic_id = $1
         AND r.id = $2
       LIMIT 1`,
      [clinicId, roomId]
    );
    return result.rows[0] || null;
  }

  async roomUsage(roomId) {
    const result = await this.db.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM geniusbot.service_assignments
           WHERE room_id = $1
         ) AS has_assignments,
         EXISTS (
           SELECT 1 FROM geniusbot.service_assignments
           WHERE room_id = $1 AND is_active = TRUE
         ) AS has_active_assignments,
         EXISTS (
           SELECT 1 FROM geniusbot.appointments
           WHERE room_id = $1
         ) AS has_appointments,
         EXISTS (
           SELECT 1 FROM geniusbot.appointments
           WHERE room_id = $1
             AND status IN ('pending', 'confirmed')
             AND appointment_start >= NOW()
         ) AS has_future_appointments,
         EXISTS (
           SELECT 1 FROM geniusbot.room_time_off
           WHERE room_id = $1
         ) AS has_time_off`,
      [roomId]
    );
    return result.rows[0];
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
    let sql;
    if (config.table === 'rooms') {
      values.push(clinicId, id);
      sql = `UPDATE geniusbot.rooms r
       SET ${assignments.join(', ')}
       FROM geniusbot.branches scope_branch
       WHERE r.branch_id = scope_branch.id
         AND scope_branch.clinic_id = $${values.length - 1}
         AND r.id = $${values.length}
       RETURNING r.*`;
    } else {
      values.push(id);
      sql = `UPDATE geniusbot.${config.table}
       SET ${assignments.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`;
    }
    const result = await this.db.query(sql, values);
    return result.rows[0] || null;
  }

  async remove(config, clinicId, id) {
    const existing = await this.find(config, clinicId, id);
    if (!existing) return null;
    if (config.table === 'rooms') {
      const result = await this.db.query(
        `DELETE FROM geniusbot.rooms r
         USING geniusbot.branches b
         WHERE r.branch_id = b.id
           AND b.clinic_id = $1
           AND r.id = $2
         RETURNING r.*`,
        [clinicId, id]
      );
      return result.rows[0] || null;
    }
    await this.db.query(
      `DELETE FROM geniusbot.${config.table} WHERE id = $1`,
      [id]
    );
    return existing;
  }
}

module.exports = MasterDataRepository;
