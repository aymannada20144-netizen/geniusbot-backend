'use strict';

const crypto = require('node:crypto');

class DoctorWorkingHoursRepository {
  constructor(db) {
    this.db = db;
  }

  async findDoctorScope(clinicId, doctorId, executor = this.db, lock = false) {
    const result = await executor.query(
      `SELECT id, clinic_id, is_active
         FROM geniusbot.doctors
        WHERE id = $2
          AND clinic_id = $1
        ${lock ? 'FOR UPDATE' : ''}`,
      [clinicId, doctorId],
    );
    return result.rows[0] || null;
  }

  async findBranchScope(clinicId, branchId, executor = this.db) {
    const result = await executor.query(
      `SELECT id, clinic_id, is_active, timezone
         FROM geniusbot.branches
        WHERE id = $2
          AND clinic_id = $1`,
      [clinicId, branchId],
    );
    return result.rows[0] || null;
  }

  async getBranchWorkingHours(clinicId, branchId, dayOfWeek, executor = this.db) {
    const result = await executor.query(
      `SELECT opens_at, closes_at, is_closed
         FROM geniusbot.branch_working_hours AS bwh
         JOIN geniusbot.branches AS b ON b.id = bwh.branch_id
        WHERE b.clinic_id = $1
          AND bwh.branch_id = $2
          AND bwh.day_of_week = $3
        LIMIT 1`,
      [clinicId, branchId, dayOfWeek],
    );
    return result.rows[0] || null;
  }

  async list(clinicId, doctorId, executor = this.db) {
    const result = await executor.query(
      `SELECT
         dwh.id,
         dwh.doctor_id,
         dwh.branch_id,
         dwh.day_of_week,
         dwh.start_time,
         dwh.end_time,
         dwh.is_active
       FROM geniusbot.doctor_working_hours dwh
       JOIN geniusbot.doctors d ON d.id = dwh.doctor_id
       JOIN geniusbot.branches b ON b.id = dwh.branch_id
       WHERE d.clinic_id = $1
         AND b.clinic_id = $1
         AND dwh.doctor_id = $2
         AND dwh.is_active = true
       ORDER BY dwh.day_of_week ASC, dwh.start_time ASC, dwh.end_time ASC, dwh.branch_id ASC`,
      [clinicId, doctorId]
    );
    return result.rows;
  }

  static versionFor(periods) {
    const canonical = periods
      .map((period) => [
        period.branch_id,
        period.day_of_week,
        String(period.start_time).slice(0, 8),
        String(period.end_time).slice(0, 8),
        period.is_active === true ? '1' : '0',
      ].join('|'))
      .sort()
      .join('\n');
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  async getWeeklySchedule(clinicId, doctorId, executor = this.db) {
    const periods = await this.list(clinicId, doctorId, executor);
    const versionRows = await executor.query(
      `SELECT dwh.branch_id, dwh.day_of_week, dwh.start_time,
              dwh.end_time, dwh.is_active
         FROM geniusbot.doctor_working_hours AS dwh
         JOIN geniusbot.doctors AS d ON d.id = dwh.doctor_id
        WHERE d.clinic_id = $1
          AND dwh.doctor_id = $2
        ORDER BY dwh.day_of_week, dwh.start_time, dwh.end_time,
                 dwh.branch_id, dwh.is_active`,
      [clinicId, doctorId],
    );
    return {
      periods,
      version: DoctorWorkingHoursRepository.versionFor(versionRows.rows),
    };
  }

  async replace(clinicId, doctorId, periods, expectedVersion) {
    return this.db.transaction(async (client) => {
      const doctor = await this.findDoctorScope(clinicId, doctorId, client, true);
      if (!doctor) return { doctor: null };
      if (doctor.is_active !== true) return { doctorInactive: true };

      const current = await this.getWeeklySchedule(clinicId, doctorId, client);
      if (current.version !== expectedVersion) {
        return { versionConflict: true, currentVersion: current.version };
      }

      await client.query(
        `DELETE FROM geniusbot.doctor_working_hours dwh
          USING geniusbot.doctors d
          WHERE dwh.doctor_id = d.id
            AND d.clinic_id = $1
            AND dwh.doctor_id = $2`,
        [clinicId, doctorId]
      );

      for (const period of periods) {
        await client.query(
          `INSERT INTO geniusbot.doctor_working_hours (
             doctor_id, branch_id, day_of_week, start_time, end_time, is_active
           ) VALUES ($1, $2, $3, $4, $5, true)`,
          [
            doctorId,
            period.branch_id,
            period.day_of_week,
            period.start_time,
            period.end_time,
          ]
        );
      }

      return this.getWeeklySchedule(clinicId, doctorId, client);
    });
  }
}

module.exports = DoctorWorkingHoursRepository;
