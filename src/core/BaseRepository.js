class BaseRepository {
  constructor(db, tableName, schema = 'geniusbot') {
    if (!db) throw new Error('Database instance is required');
    if (!tableName) throw new Error('tableName is required');

    this.db = db;
    this.tableName = tableName;
    this.schema = schema;
    this.fullTableName = `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(tableName)}`;

    this.defaultOrderBy = 'created_at';
    this.allowedOrderColumns = ['id', 'created_at', 'updated_at'];
  }

  quoteIdentifier(identifier) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return `"${identifier}"`;
  }

  validateColumnName(columnName) {
    if (!this.allowedOrderColumns.includes(columnName)) {
      throw new Error(`Invalid or unsupported column name: ${columnName}`);
    }

    return this.quoteIdentifier(columnName);
  }

  validateOrderDirection(direction) {
    return direction === 'ASC' ? 'ASC' : 'DESC';
  }

  async query(sql, params = []) {
    return this.db.query(sql, params);
  }

  async findById(id) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "id" = $1
      LIMIT 1
    `;

    const result = await this.query(sql, [id]);
    return result.rows[0] || null;
  }

  async findByIdAndClinic(clinicId, id) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
        AND "id" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, id]);
    return result.rows[0] || null;
  }

  async findOne(where = {}) {
    const { clause, values } = this.buildWhereClause(where);

    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      ${clause}
      LIMIT 1
    `;

    const result = await this.query(sql, values);
    return result.rows[0] || null;
  }

  async findMany(where = {}, options = {}) {
    const { clause, values } = this.buildWhereClause(where);

    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;

    const orderBy = this.validateColumnName(
      options.orderBy || this.defaultOrderBy
    );

    const orderDirection = this.validateOrderDirection(
      options.orderDirection
    );

    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      ${clause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    const result = await this.query(sql, [...values, limit, offset]);
    return result.rows;
  }

  async create(data = {}) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
      throw new Error('Create data cannot be empty');
    }

    const columns = keys.map((key) => this.quoteIdentifier(key)).join(', ');
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');

    const sql = `
      INSERT INTO ${this.fullTableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.query(sql, values);
    return result.rows[0];
  }

  async updateById(id, data = {}) {
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
      WHERE "id" = $${keys.length + 1}
      RETURNING *
    `;

    const result = await this.query(sql, [...values, id]);
    return result.rows[0] || null;
  }

  async updateByIdAndClinic(clinicId, id, data = {}) {
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

    const result = await this.query(sql, [...values, clinicId, id]);
    return result.rows[0] || null;
  }

  async softDeleteByIdAndClinic(
    clinicId,
    id,
    activeColumn = 'is_active'
  ) {
    const column = this.quoteIdentifier(activeColumn);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        ${column} = false,
        "updated_at" = NOW()
      WHERE "clinic_id" = $1
        AND "id" = $2
      RETURNING *
    `;

    const result = await this.query(sql, [clinicId, id]);
    return result.rows[0] || null;
  }

  async restoreByIdAndClinic(
    clinicId,
    id,
    activeColumn = 'is_active'
  ) {
    const column = this.quoteIdentifier(activeColumn);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        ${column} = true,
        "updated_at" = NOW()
      WHERE "clinic_id" = $1
        AND "id" = $2
      RETURNING *
    `;

    const result = await this.query(sql, [clinicId, id]);
    return result.rows[0] || null;
  }

  async existsByClinic(clinicId, id) {
    const sql = `
      SELECT 1
      FROM ${this.fullTableName}
      WHERE "clinic_id" = $1
        AND "id" = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, id]);
    return result.rows.length > 0;
  }

  async deleteById(id) {
    const sql = `
      DELETE FROM ${this.fullTableName}
      WHERE "id" = $1
      RETURNING *
    `;

    const result = await this.query(sql, [id]);
    return result.rows[0] || null;
  }

  buildWhereClause(where = {}) {
    const keys = Object.keys(where);

    if (keys.length === 0) {
      return {
        clause: '',
        values: [],
      };
    }

    const conditions = keys.map(
      (key, index) => `${this.quoteIdentifier(key)} = $${index + 1}`
    );

    const values = Object.values(where);

    return {
      clause: `WHERE ${conditions.join(' AND ')}`,
      values,
    };
  }
}

module.exports = BaseRepository;