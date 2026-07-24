'use strict';

const BaseRepository = require('../../core/BaseRepository');

const SAFE_COLUMNS = `
  id,
  clinic_id,
  branch_id,
  full_name,
  username,
  email,
  phone,
  role,
  is_active,
  last_login_at,
  created_at,
  updated_at
`;

class StaffRepository extends BaseRepository {
  constructor(db) {
    super(db, 'staff');
  }

  getExecutor(client = null) {
    return client || this.db;
  }

  async findAuthByIdentifier(identifier, client = null) {
    const executor = this.getExecutor(client);

    const sql = `
      SELECT
        ${SAFE_COLUMNS},
        password_hash
      FROM ${this.fullTableName}
      WHERE LOWER(email) = LOWER($1)
         OR LOWER(username) = LOWER($1)
      LIMIT 1
    `;

    const result = await executor.query(sql, [identifier]);

    return result.rows[0] || null;
  }

  async findAuthById(staffId, client = null) {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `SELECT ${SAFE_COLUMNS}, password_hash
         FROM ${this.fullTableName}
        WHERE id = $1
        LIMIT 1`,
      [staffId]
    );
    return result.rows[0] || null;
  }

  async findById(staffId, client = null) {
    const executor = this.getExecutor(client);

    const sql = `
      SELECT
        ${SAFE_COLUMNS}
      FROM ${this.fullTableName}
      WHERE id = $1
      LIMIT 1
    `;

    const result = await executor.query(sql, [staffId]);

    return result.rows[0] || null;
  }

  async findByIdForClinic(
    clinicId,
    staffId,
    client = null
  ) {
    const executor = this.getExecutor(client);

    const sql = `
      SELECT
        ${SAFE_COLUMNS}
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
        AND id = $2
      LIMIT 1
    `;

    const result = await executor.query(sql, [
      clinicId,
      staffId,
    ]);

    return result.rows[0] || null;
  }

  async listByClinic(
    clinicId,
    options = {},
    client = null
  ) {
    const executor = this.getExecutor(client);

    const {
      branchId = null,
      role = null,
      isActive = null,
      limit = 50,
      offset = 0,
    } = options;

    const conditions = ['clinic_id = $1'];
    const values = [clinicId];

    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }

    if (role) {
      values.push(role);
      conditions.push(`role = $${values.length}`);
    }

    if (typeof isActive === 'boolean') {
      values.push(isActive);
      conditions.push(`is_active = $${values.length}`);
    }

    values.push(limit);
    const limitPlaceholder = `$${values.length}`;

    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const sql = `
      SELECT
        ${SAFE_COLUMNS}
      FROM ${this.fullTableName}
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY created_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `;

    const result = await executor.query(sql, values);

    return result.rows;
  }

  async createStaff(staffData, client = null) {
    const executor = this.getExecutor(client);

    const sql = `
      INSERT INTO ${this.fullTableName} (
        clinic_id,
        branch_id,
        full_name,
        username,
        email,
        phone,
        password_hash,
        role,
        is_active
      )
      VALUES (
        $1,
        $2,
        $3,
        LOWER($4),
        LOWER($5),
        $6,
        $7,
        $8,
        $9
      )
      RETURNING
        ${SAFE_COLUMNS}
    `;

    const values = [
      staffData.clinicId,
      staffData.branchId,
      staffData.fullName,
      staffData.username,
      staffData.email,
      staffData.phone,
      staffData.passwordHash,
      staffData.role,
      staffData.isActive,
    ];

    const result = await executor.query(sql, values);

    return result.rows[0];
  }

  async updateStaff(
    clinicId,
    staffId,
    staffData,
    client = null
  ) {
    const executor = this.getExecutor(client);
    const assignments = [];
    const values = [];

    const addAssignment = (column, value, expression = null) => {
      values.push(value);

      assignments.push(
        `${column} = ${
          expression || `$${values.length}`
        }`
      );
    };

    if (staffData.branchId !== undefined) {
      addAssignment('branch_id', staffData.branchId);
    }

    if (staffData.fullName !== undefined) {
      addAssignment('full_name', staffData.fullName);
    }

    if (staffData.username !== undefined) {
      values.push(staffData.username);
      assignments.push(
        `username = LOWER($${values.length})`
      );
    }

    if (staffData.email !== undefined) {
      values.push(staffData.email);
      assignments.push(
        `email = LOWER($${values.length})`
      );
    }

    if (staffData.phone !== undefined) {
      addAssignment('phone', staffData.phone);
    }

    if (assignments.length === 0) {
      return this.findByIdForClinic(
        clinicId,
        staffId,
        client
      );
    }

    assignments.push('updated_at = NOW()');

    values.push(clinicId);
    const clinicPlaceholder = `$${values.length}`;

    values.push(staffId);
    const staffPlaceholder = `$${values.length}`;

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        ${assignments.join(',\n        ')}
      WHERE clinic_id = ${clinicPlaceholder}
        AND id = ${staffPlaceholder}
      RETURNING
        ${SAFE_COLUMNS}
    `;

    const result = await executor.query(sql, values);

    return result.rows[0] || null;
  }

  async updateRole(
    clinicId,
    staffId,
    role,
    branchId,
    client = null
  ) {
    const executor = this.getExecutor(client);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        role = $3,
        branch_id = $4,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING
        ${SAFE_COLUMNS}
    `;

    const result = await executor.query(sql, [
      clinicId,
      staffId,
      role,
      branchId,
    ]);

    return result.rows[0] || null;
  }

  async deleteStaff(clinicId, staffId, client = null) {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM ${this.fullTableName}
       WHERE clinic_id = $1
         AND id = $2
       RETURNING ${SAFE_COLUMNS}`,
      [clinicId, staffId]
    );
    return result.rows[0] || null;
  }

  async updatePassword(
    staffId,
    passwordHash,
    client = null
  ) {
    const executor = this.getExecutor(client);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        password_hash = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `;

    const result = await executor.query(sql, [
      staffId,
      passwordHash,
    ]);

    return result.rows[0] || null;
  }

  async setActiveStatus(
    clinicId,
    staffId,
    isActive,
    client = null
  ) {
    const executor = this.getExecutor(client);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        is_active = $3,
        updated_at = NOW()
      WHERE clinic_id = $1
        AND id = $2
      RETURNING
        ${SAFE_COLUMNS}
    `;

    const result = await executor.query(sql, [
      clinicId,
      staffId,
      isActive,
    ]);

    return result.rows[0] || null;
  }

  async updateLastLogin(
    staffId,
    client = null
  ) {
    const executor = this.getExecutor(client);

    const sql = `
      UPDATE ${this.fullTableName}
      SET
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        last_login_at
    `;

    const result = await executor.query(sql, [staffId]);

    return result.rows[0] || null;
  }

  async emailExists(
    email,
    excludeStaffId = null,
    client = null
  ) {
    const executor = this.getExecutor(client);
    const values = [email];

    let exclusionClause = '';

    if (excludeStaffId) {
      values.push(excludeStaffId);
      exclusionClause = `AND id <> $${values.length}`;
    }

    const sql = `
      SELECT EXISTS (
        SELECT 1
        FROM ${this.fullTableName}
        WHERE LOWER(email) = LOWER($1)
          ${exclusionClause}
      ) AS exists
    `;

    const result = await executor.query(sql, values);

    return result.rows[0].exists;
  }

  async identifierConflict(
    username,
    email,
    excludeStaffId = null,
    client = null
  ) {
    const executor = this.getExecutor(client);
    const values = [username, email];
    let exclusionClause = '';

    if (excludeStaffId) {
      values.push(excludeStaffId);
      exclusionClause = `AND id <> $${values.length}`;
    }

    const result = await executor.query(
      `SELECT EXISTS (
         SELECT 1
           FROM ${this.fullTableName}
          WHERE (
            LOWER(username) IN (LOWER($1), LOWER($2))
            OR LOWER(email) IN (LOWER($1), LOWER($2))
          )
          ${exclusionClause}
       ) AS exists`,
      values
    );

    return result.rows[0].exists;
  }

  async activeBranchBelongsToClinic(clinicId, branchId, client = null) {
    const executor = this.getExecutor(client);
    const result = await executor.query(
      `SELECT 1
         FROM geniusbot.branches
        WHERE clinic_id = $1
          AND id = $2
          AND is_active = true`,
      [clinicId, branchId]
    );
    return result.rowCount === 1;
  }

  async countActiveOwnersByClinic(
    clinicId,
    client = null
  ) {
    const executor = this.getExecutor(client);

    const sql = `
      SELECT COUNT(*)::integer AS count
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
        AND role = 'owner'
        AND is_active = true
    `;

    const result = await executor.query(sql, [clinicId]);

    return result.rows[0].count;
  }
}

module.exports = StaffRepository;
