'use strict';

const BaseRepository = require('../core/BaseRepository');

/**
 * Owns branch and branch-working-hours reads used by booking.
 */
class BranchRepository extends BaseRepository {
  constructor(db) {
    super(db, 'branches');
    this.allowedOrderColumns = [
      'id',
      'name',
      'city',
      'is_active',
      'created_at',
      'updated_at',
    ];
  }

  async findActiveById(clinicId, branchId) {
    const result = await this.query(
      `SELECT *
         FROM geniusbot.branches
        WHERE clinic_id = $1
          AND id = $2
          AND is_active IS TRUE
        LIMIT 1`,
      [clinicId, branchId]
    );
    return result.rows[0] || null;
  }

  async findWorkingHours(branchId, dayOfWeek) {
    const result = await this.query(
      `SELECT
          id,
          branch_id,
          day_of_week,
          opens_at,
          closes_at,
          is_closed
         FROM geniusbot.branch_working_hours
        WHERE branch_id = $1
          AND day_of_week = $2
        LIMIT 1`,
      [branchId, dayOfWeek]
    );
    return result.rows[0] || null;
  }
}

module.exports = BranchRepository;
