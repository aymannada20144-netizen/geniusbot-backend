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
  async resolveWhatsAppClinic({ phoneNumberId, displayPhoneNumber } = {}) {
    const stableId = cleanIdentifier(phoneNumberId);
    if (stableId) {
      const byStableId = await this.query(
        `SELECT * FROM ${this.fullTableName}
         WHERE whatsapp_phone_number_id = $1 AND is_active = TRUE
         ORDER BY id`,
        [stableId]
      );
      const resolved = exactlyOne(byStableId.rows, 'WhatsApp phone number ID');
      if (resolved) return resolved;
    }

    const normalizedNumber = normalizeDisplayNumber(displayPhoneNumber);
    if (!normalizedNumber) return null;
    const byDisplayNumber = await this.query(
      `SELECT * FROM ${this.fullTableName}
       WHERE regexp_replace(whatsapp_number, '\\D', '', 'g') = $1
         AND is_active = TRUE
       ORDER BY id`,
      [normalizedNumber]
    );
    return exactlyOne(byDisplayNumber.rows, 'WhatsApp display number');
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

function cleanIdentifier(value) {
  return typeof value === 'string' && /^\d{6,32}$/.test(value.trim())
    ? value.trim()
    : null;
}

function normalizeDisplayNumber(value) {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function exactlyOne(rows, identifierName) {
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    const error = new Error(`${identifierName} maps to multiple active clinics.`);
    error.code = 'WHATSAPP_CLINIC_AMBIGUOUS';
    throw error;
  }
  return rows[0];
}

module.exports.normalizeDisplayNumber = normalizeDisplayNumber;
