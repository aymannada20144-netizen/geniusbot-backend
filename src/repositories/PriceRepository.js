'use strict';

const BaseRepository = require('../core/BaseRepository');

/**
 * Owns all SQL used to read and manage clinic service prices.
 */
class PriceRepository extends BaseRepository {
  /**
   * @param {{query: Function}} db PostgreSQL query interface.
   */
  constructor(db) {
    super(db, 'prices');
    this.allowedOrderColumns = [
      'id',
      'valid_from',
      'valid_to',
      'price',
      'created_at',
      'updated_at',
    ];
    this.defaultOrderBy = 'valid_from';
  }

  /**
   * Loads the resources that define a price request.
   *
   * @param {object} input
   * @param {string} input.clinicId
   * @param {string} input.serviceId
   * @param {string} input.paymentMethodId
   * @param {string|null} input.insuranceCompanyId
   * @param {string|null} input.insuranceClassId
   * @returns {Promise<object>}
   */
  async findResolutionContext({
    clinicId,
    serviceId,
    paymentMethodId,
    insuranceCompanyId = null,
    insuranceClassId = null,
  }) {
    const sql = `
      SELECT
        c.id AS clinic_id,
        c.is_active AS clinic_is_active,
        c.timezone AS clinic_timezone,
        s.id AS service_id,
        s.clinic_id AS service_clinic_id,
        s.is_active AS service_is_active,
        pm.id AS payment_method_id,
        pm.clinic_id AS payment_method_clinic_id,
        pm.is_active AS payment_method_is_active,
        lower(btrim(pm.code)) AS payment_method_code,
        ic.id AS insurance_company_id,
        ic.clinic_id AS insurance_company_clinic_id,
        ic.is_active AS insurance_company_is_active,
        cls.id AS insurance_class_id,
        cls.insurance_company_id AS insurance_class_company_id,
        cls.is_accepted AS insurance_class_is_active
      FROM geniusbot.clinics AS c
      LEFT JOIN geniusbot.services AS s
        ON s.id = $2
      LEFT JOIN geniusbot.payment_methods AS pm
        ON pm.id = $3
      LEFT JOIN geniusbot.insurance_companies AS ic
        ON ic.id = $4
      LEFT JOIN geniusbot.insurance_classes AS cls
        ON cls.id = $5
      WHERE c.id = $1
      LIMIT 1
    `;

    const result = await this.query(sql, [
      clinicId,
      serviceId,
      paymentMethodId,
      insuranceCompanyId,
      insuranceClassId,
    ]);
    return result.rows[0] || null;
  }

  /**
   * Finds all active prices that contain the requested booking date.
   * Database exclusion constraints guarantee at most one valid row.
   *
   * @param {object} input
   * @returns {Promise<object[]>}
   */
  async findApplicablePrices({
    clinicId,
    serviceId,
    paymentMethodId,
    insuranceCompanyId = null,
    insuranceClassId = null,
    bookingDate,
  }) {
    const sql = `
      SELECT
        p.id,
        p.clinic_id,
        p.service_id,
        p.payment_method_id,
        p.insurance_company_id,
        p.insurance_class_id,
        p.price,
        p.currency,
        p.valid_from,
        p.valid_to
      FROM geniusbot.prices AS p
      WHERE p.clinic_id = $1
        AND p.service_id = $2
        AND p.payment_method_id = $3
        AND p.insurance_company_id IS NOT DISTINCT FROM $4::uuid
        AND p.insurance_class_id IS NOT DISTINCT FROM $5::uuid
        AND p.is_active IS TRUE
        AND p.valid_from <= $6::date
        AND (p.valid_to IS NULL OR p.valid_to >= $6::date)
      ORDER BY p.valid_from DESC, p.id
      LIMIT 2
    `;

    const result = await this.query(sql, [
      clinicId,
      serviceId,
      paymentMethodId,
      insuranceCompanyId,
      insuranceClassId,
      bookingDate,
    ]);
    return result.rows;
  }

  async findApplicableInsuranceOptions({
    clinicId,
    serviceId,
    paymentMethodId,
    insuranceCompanyId = null,
  }) {
    const result = await this.query(`
      SELECT DISTINCT
        ic.id AS insurance_company_id,
        ic.name AS insurance_company_name,
        cls.id AS insurance_class_id,
        cls.class_name AS insurance_class_name
      FROM geniusbot.prices AS p
      JOIN geniusbot.clinics AS c
        ON c.id = p.clinic_id AND c.is_active IS TRUE
      JOIN geniusbot.services AS s
        ON s.id = p.service_id AND s.clinic_id = p.clinic_id
        AND s.is_active IS TRUE
      JOIN geniusbot.payment_methods AS pm
        ON pm.id = p.payment_method_id AND pm.clinic_id = p.clinic_id
        AND pm.is_active IS TRUE AND lower(btrim(pm.code)) = 'insurance'
      JOIN geniusbot.insurance_companies AS ic
        ON ic.id = p.insurance_company_id AND ic.clinic_id = p.clinic_id
        AND ic.is_active IS TRUE
      JOIN geniusbot.insurance_classes AS cls
        ON cls.id = p.insurance_class_id
        AND cls.insurance_company_id = ic.id
        AND cls.is_accepted IS TRUE
      WHERE p.clinic_id = $1
        AND p.service_id = $2
        AND p.payment_method_id = $3
        AND ($4::uuid IS NULL OR p.insurance_company_id = $4)
        AND p.is_active IS TRUE
        AND p.valid_from <= (CURRENT_TIMESTAMP AT TIME ZONE c.timezone)::date
        AND (p.valid_to IS NULL OR p.valid_to >=
          (CURRENT_TIMESTAMP AT TIME ZONE c.timezone)::date)
      ORDER BY insurance_company_name, insurance_class_name
    `, [clinicId, serviceId, paymentMethodId, insuranceCompanyId]);
    return result.rows;
  }

  /**
   * Lists prices for a clinic with stable pagination.
   *
   * @param {object} input
   * @returns {Promise<object[]>}
   */
  async listByClinic({ clinicId, active = null, limit = 50, offset = 0 }) {
    const values = [clinicId];
    const conditions = ['p.clinic_id = $1'];

    if (typeof active === 'boolean') {
      values.push(active);
      conditions.push(`p.is_active = $${values.length}`);
    }

    values.push(limit, offset);
    const sql = `
      SELECT
        p.*,
        s.name AS service_name,
        pm.name AS payment_method_name,
        pm.code AS payment_method_code,
        ic.name AS insurance_company_name,
        cls.class_name AS insurance_class_name
      FROM geniusbot.prices AS p
      JOIN geniusbot.services AS s ON s.id = p.service_id
      JOIN geniusbot.payment_methods AS pm ON pm.id = p.payment_method_id
      LEFT JOIN geniusbot.insurance_companies AS ic
        ON ic.id = p.insurance_company_id
      LEFT JOIN geniusbot.insurance_classes AS cls
        ON cls.id = p.insurance_class_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.valid_from DESC, p.id
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;
    const result = await this.query(sql, values);
    return result.rows;
  }

  async findByClinicAndId(clinicId, priceId) {
    return this.findByIdAndClinic(clinicId, priceId);
  }

  async createForClinic(clinicId, data) {
    return this.create({ clinic_id: clinicId, ...data });
  }

  async updateForClinic(clinicId, priceId, data) {
    return this.updateByIdAndClinic(clinicId, priceId, data);
  }
}

module.exports = PriceRepository;
