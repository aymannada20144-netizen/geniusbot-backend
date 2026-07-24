'use strict';

class DoctorWorkingHoursRepository {
  constructor(db) {
    this.db = db;
  }

  async doctorBelongsToClinic(clinicId, doctorId, executor = this.db) {
    const result = await executor.query(
      `SELECT 1
         FROM geniusbot.doctors
        WHERE clinic_id = $1
          AND id = $2
          AND is_active = true`,
      [clinicId, doctorId]
    );
    return result.rowCount === 1;
  }

  async branchBelongsToClinic(clinicId, branchId, executor = this.db) {
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

  async getBranchWorkingHours(branchId, dayOfWeek, executor = this.db) {
    const result = await executor.query(
      `SELECT opens_at, closes_at, is_closed
         FROM geniusbot.branch_working_hours
        WHERE branch_id = $1
          AND day_of_week = $2
        LIMIT 1`,
      [branchId, dayOfWeek]
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

  async replace(clinicId, doctorId, periods) {
    return this.db.transaction(async (client) => {
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

      return this.list(clinicId, doctorId, client);
    });
  }
}

module.exports = DoctorWorkingHoursRepository;
