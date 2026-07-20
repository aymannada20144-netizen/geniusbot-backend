const BaseRepository = require('../core/BaseRepository');
class DoctorRepository extends BaseRepository {
  constructor(db) {
    super(db, 'doctors');
  }
  /**
   * التحقق من وجود إجازة للطبيب
   * تتداخل مع الموعد المطلوب.
   */
  
  async findByClinicId(clinicId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND is_active = true
      ORDER BY full_name
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }

  async findActiveById(clinicId, doctorId) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND id = $2
      AND is_active = true
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, doctorId]);
    return result.rows[0] || null;
  }

  async findByName(clinicId, fullName) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE clinic_id = $1
      AND full_name ILIKE $2
      AND is_active = true
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, fullName]);
    return result.rows[0] || null;
  }

  async getDoctorWithSpecialties(clinicId, doctorId) {
    const sql = `
      SELECT
        d.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'name', s.name
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS specialties
      FROM ${this.fullTableName} d
      LEFT JOIN geniusbot.doctor_specialties ds
        ON ds.doctor_id = d.id
      LEFT JOIN geniusbot.specialties s
        ON s.id = ds.specialty_id
      WHERE d.clinic_id = $1
      AND d.id = $2
      AND d.is_active = true
      GROUP BY d.id
      LIMIT 1
    `;

    const result = await this.query(sql, [clinicId, doctorId]);
    return result.rows[0] || null;
  }

  async listDoctorsWithSpecialties(clinicId) {
    const sql = `
      SELECT
        d.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'name', s.name
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS specialties
      FROM ${this.fullTableName} d
      LEFT JOIN geniusbot.doctor_specialties ds
        ON ds.doctor_id = d.id
      LEFT JOIN geniusbot.specialties s
        ON s.id = ds.specialty_id
      WHERE d.clinic_id = $1
      AND d.is_active = true
      GROUP BY d.id
      ORDER BY d.full_name
    `;

    const result = await this.query(sql, [clinicId]);
    return result.rows;
  }
    async getWorkingHours(
  clinicId,
  doctorId,
  branchId,
  dayOfWeek
) {
  const sql = `
    SELECT
      dwh.start_time,
      dwh.end_time
    FROM geniusbot.doctor_working_hours dwh
    INNER JOIN geniusbot.doctors d
      ON d.id = dwh.doctor_id
    WHERE d.clinic_id = $1
      AND dwh.doctor_id = $2
      AND dwh.branch_id = $3
      AND dwh.day_of_week = $4
      AND dwh.is_active = true
      AND d.is_active = true
    LIMIT 1
  `;

  const result = await this.query(sql, [
    clinicId,
    doctorId,
    branchId,
    dayOfWeek,
  ]);

  return result.rows[0] || null;
}
async hasTimeOff(
    doctorId,
    appointmentStart,
    appointmentEnd
  ) {
    const sql = `
      SELECT 1
      FROM geniusbot.doctor_time_off
      WHERE doctor_id = $1
        AND start_datetime < $3
        AND end_datetime > $2
      LIMIT 1
    `;

    const result = await this.query(sql, [
      doctorId,
      appointmentStart,
      appointmentEnd,
    ]);

    return result.rowCount > 0;
  }
}

module.exports = DoctorRepository;