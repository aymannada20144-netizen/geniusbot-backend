const BaseRepository = require('../core/BaseRepository');

class ClinicRepository extends BaseRepository {
  constructor(db) {
    super(db, 'clinics');
  }
  /**
   * الحصول على عطلة العيادة في تاريخ محدد.
   */
  async findHoliday(
    clinicId,
    branchId,
    holidayDate
  ) {
    const sql = `
      SELECT
        id,
        clinic_id,
        branch_id,
        holiday_date,
        name,
        is_closed,
        opens_at,
        closes_at
      FROM geniusbot.clinic_holidays
      WHERE clinic_id = $1
        AND (branch_id = $2 OR branch_id IS NULL)
        AND holiday_date = $3
      ORDER BY branch_id DESC NULLS LAST
      LIMIT 1
    `;

    const result = await this.query(sql, [
      clinicId,
      branchId,
      holidayDate,
    ]);

    return result.rows[0] || null;
  }
  /**
   * البحث عن عيادة بواسطة رقم الواتساب
   */
  async findByWhatsAppNumber(whatsappNumber) {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE whatsapp_number = $1
      LIMIT 1
    `;

    const result = await this.query(sql, [whatsappNumber]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على أول عيادة مفعلة
   * مفيد أثناء التطوير إذا كان النظام يخدم عيادة واحدة
   */
  async findActiveClinic() {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE is_active = true
      ORDER BY created_at
      LIMIT 1
    `;

    const result = await this.query(sql);
    return result.rows[0] || null;
  }

  /**
   * جميع العيادات المفعلة
   */
  async listActiveClinics() {
    const sql = `
      SELECT *
      FROM ${this.fullTableName}
      WHERE is_active = true
      ORDER BY name
    `;

    const result = await this.query(sql);
    return result.rows;
  }

  /**
   * الحصول على ساعات عمل فرع في يوم محدد.
   *
   * dayOfWeek:
   * 0 = Sunday
   * 1 = Monday
   * 2 = Tuesday
   * 3 = Wednesday
   * 4 = Thursday
   * 5 = Friday
   * 6 = Saturday
   */
  async findBranchWorkingHours(branchId, dayOfWeek) {
    const sql = `
      SELECT
        id,
        branch_id,
        day_of_week,
        opens_at,
        closes_at,
        is_closed
      FROM geniusbot.branch_working_hours
      WHERE branch_id = $1
        AND day_of_week = $2
      LIMIT 1
    `;

    const result = await this.query(sql, [
      branchId,
      dayOfWeek,
    ]);

    return result.rows[0] || null;
  }

  /**
   * تحديث بيانات عيادة
   */
  async updateClinic(id, data) {
    const clinic = await this.findById(id);

    if (!clinic) {
      return null;
    }

    return this.updateById(id, {
      name: data.name ?? clinic.name,
      whatsapp_number:
        data.whatsapp_number ?? clinic.whatsapp_number,
      phone: data.phone ?? clinic.phone,
      timezone: data.timezone ?? clinic.timezone,
      default_language:
        data.default_language ?? clinic.default_language,
      is_active:
        data.is_active ?? clinic.is_active,
    });
  }
}

module.exports = ClinicRepository;