'use strict';

const {
  ConflictError,
  NotFoundError,
  ValidationError,
} = require('../core/errors');
const { validateUuid } = require('../core/validators/commonValidators');

/**
 * Resolves the single authoritative price for a booking.
 */
class PriceService {
  /**
   * @param {import('../repositories/PriceRepository')} priceRepository
   */
  constructor(priceRepository) {
    if (!priceRepository) {
      throw new TypeError('PriceService requires priceRepository.');
    }
    this.priceRepository = priceRepository;
  }

  /**
   * @param {object} input
   * @returns {Promise<object>}
   */
  async resolvePrice(input = {}) {
    const request = validateResolutionInput(input);
    const context = await this.priceRepository.findResolutionContext(request);
    validateContext(context, request);

    const bookingDate = toClinicDate(
      request.bookingDate,
      context.clinic_timezone
    );
    const prices = await this.priceRepository.findApplicablePrices({
      ...request,
      bookingDate,
    });

    if (prices.length === 0) {
      throw new NotFoundError(
        'No active price applies to the requested booking date.'
      );
    }
    if (prices.length > 1) {
      throw new ConflictError(
        'Multiple active prices apply to the requested booking date.'
      );
    }

    return Object.freeze({
      ...prices[0],
      booking_date: bookingDate,
    });
  }

  async listPrices(clinicId, query = {}) {
    validateUuid(clinicId, 'clinicId');
    const limit = integerWithin(query.limit, 50, 1, 100);
    const offset = integerWithin(query.offset, 0, 0, 1000000);
    const active = query.active === undefined
      ? null
      : parseBoolean(query.active, 'active');
    return this.priceRepository.listByClinic({
      clinicId,
      active,
      limit,
      offset,
    });
  }

  async listApplicableInsuranceOptions(input = {}) {
    validateUuid(input.clinicId, 'clinicId');
    validateUuid(input.serviceId, 'serviceId');
    validateUuid(input.paymentMethodId, 'paymentMethodId');
    if (input.insuranceCompanyId !== undefined &&
        input.insuranceCompanyId !== null) {
      validateUuid(input.insuranceCompanyId, 'insuranceCompanyId');
    }
    const rows = await this.priceRepository.findApplicableInsuranceOptions({
      clinicId: input.clinicId,
      serviceId: input.serviceId,
      paymentMethodId: input.paymentMethodId,
      insuranceCompanyId: input.insuranceCompanyId || null,
    });
    const companies = uniqueBy(rows.map((row) => ({
      id: row.insurance_company_id,
      name: row.insurance_company_name,
    })), 'id');
    const classes = uniqueBy(rows.map((row) => ({
      id: row.insurance_class_id,
      insuranceCompanyId: row.insurance_company_id,
      name: row.insurance_class_name,
      isAccepted: true,
    })), 'id');
    return Object.freeze({ companies, classes });
  }

  async getPrice(clinicId, priceId) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(priceId, 'priceId');
    const price = await this.priceRepository.findByClinicAndId(
      clinicId,
      priceId
    );
    if (!price) throw new NotFoundError('Price not found.');
    return price;
  }

  async createPrice(clinicId, input = {}) {
    validateUuid(clinicId, 'clinicId');
    return this.priceRepository.createForClinic(
      clinicId,
      normalizePriceWrite(input, false)
    );
  }

  async updatePrice(clinicId, priceId, input = {}) {
    validateUuid(clinicId, 'clinicId');
    validateUuid(priceId, 'priceId');
    const price = await this.priceRepository.updateForClinic(
      clinicId,
      priceId,
      normalizePriceWrite(input, true)
    );
    if (!price) throw new NotFoundError('Price not found.');
    return price;
  }
}

const WRITABLE_FIELDS = Object.freeze([
  'service_id',
  'payment_method_id',
  'insurance_company_id',
  'insurance_class_id',
  'price',
  'currency',
  'valid_from',
  'valid_to',
  'is_active',
]);

function uniqueBy(items, field) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item[field] || seen.has(item[field])) return false;
    seen.add(item[field]);
    return true;
  });
}

function normalizePriceWrite(input, partial) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Price body must be an object.');
  }
  const unknown = Object.keys(input).filter(
    (key) => !WRITABLE_FIELDS.includes(key)
  );
  if (unknown.length) {
    throw new ValidationError(`Unknown price fields: ${unknown.join(', ')}.`);
  }
  if (partial && Object.keys(input).length === 0) {
    throw new ValidationError('At least one price field is required.');
  }
  const data = {};
  for (const field of ['service_id', 'payment_method_id']) {
    if (!partial || input[field] !== undefined) {
      validateUuid(input[field], field);
      data[field] = input[field];
    }
  }
  for (const field of ['insurance_company_id', 'insurance_class_id']) {
    if (input[field] !== undefined) {
      if (input[field] !== null) validateUuid(input[field], field);
      data[field] = input[field];
    }
  }
  if (!partial || input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new ValidationError('price must be a non-negative number.');
    }
    data.price = price;
  }
  if (input.currency !== undefined) {
    if (typeof input.currency !== 'string' || !/^[A-Za-z]{3}$/.test(input.currency.trim())) {
      throw new ValidationError('currency must be a three-letter ISO code.');
    }
    data.currency = input.currency;
  }
  for (const field of ['valid_from', 'valid_to']) {
    if ((!partial && field === 'valid_from') || input[field] !== undefined) {
      if (field === 'valid_to' && input[field] === null) {
        data[field] = null;
      } else if (typeof input[field] !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(input[field])) {
        throw new ValidationError(`${field} must be an ISO date.`);
      } else {
        data[field] = input[field];
      }
    }
  }
  if (input.is_active !== undefined) {
    if (typeof input.is_active !== 'boolean') {
      throw new ValidationError('is_active must be a boolean.');
    }
    data.is_active = input.is_active;
  }
  return data;
}

function integerWithin(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ValidationError(
      `Pagination value must be an integer from ${minimum} to ${maximum}.`
    );
  }
  return number;
}

function parseBoolean(value, field) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new ValidationError(`${field} must be true or false.`);
}

function validateResolutionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Price resolution input is required.');
  }

  validateUuid(input.clinicId, 'clinicId');
  validateUuid(input.serviceId, 'serviceId');
  validateUuid(input.paymentMethodId, 'paymentMethodId');
  if (input.insuranceCompanyId) {
    validateUuid(input.insuranceCompanyId, 'insuranceCompanyId');
  }
  if (input.insuranceClassId) {
    validateUuid(input.insuranceClassId, 'insuranceClassId');
  }
  if (!input.bookingDate) {
    throw new ValidationError('bookingDate is required.');
  }

  return {
    clinicId: input.clinicId,
    serviceId: input.serviceId,
    paymentMethodId: input.paymentMethodId,
    insuranceCompanyId: input.insuranceCompanyId || null,
    insuranceClassId: input.insuranceClassId || null,
    bookingDate: input.bookingDate,
  };
}

function validateContext(context, request) {
  if (!context || context.clinic_is_active !== true) {
    throw new NotFoundError('Clinic not found or inactive.');
  }
  if (!context.service_id || context.service_is_active !== true) {
    throw new NotFoundError('Service not found or inactive.');
  }
  if (context.service_clinic_id !== request.clinicId) {
    throw new ValidationError('Service does not belong to the clinic.');
  }
  if (!context.payment_method_id || context.payment_method_is_active !== true) {
    throw new NotFoundError('Payment method not found or inactive.');
  }
  if (context.payment_method_clinic_id !== request.clinicId) {
    throw new ValidationError('Payment method does not belong to the clinic.');
  }

  if (context.payment_method_code === 'cash') {
    if (request.insuranceCompanyId || request.insuranceClassId) {
      throw new ValidationError(
        'Cash pricing does not accept insurance identifiers.'
      );
    }
    return;
  }

  if (context.payment_method_code !== 'insurance') {
    throw new ValidationError('Payment method is not supported for pricing.');
  }
  if (!request.insuranceCompanyId || !request.insuranceClassId) {
    throw new ValidationError(
      'Insurance company and insurance class are required.'
    );
  }
  if (!context.insurance_company_id ||
      context.insurance_company_is_active !== true) {
    throw new NotFoundError('Insurance company not found or inactive.');
  }
  if (context.insurance_company_clinic_id !== request.clinicId) {
    throw new ValidationError('Insurance company does not belong to the clinic.');
  }
  if (!context.insurance_class_id ||
      context.insurance_class_is_active !== true) {
    throw new NotFoundError('Insurance class not found or inactive.');
  }
  if (context.insurance_class_company_id !== request.insuranceCompanyId) {
    throw new ValidationError(
      'Insurance class does not belong to the insurance company.'
    );
  }
}

function toClinicDate(value, timeZone) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('bookingDate must be a valid date.');
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    throw new ValidationError('Clinic timezone is invalid.');
  }
}

module.exports = PriceService;
module.exports.toClinicDate = toClinicDate;
