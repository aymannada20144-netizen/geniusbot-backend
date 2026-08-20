'use strict';

const ValidationError = require('../../core/errors/ValidationError');

const FIELDS = Object.freeze([
  'specialtyId',
  'serviceId',
  'city',
  'branchId',
  'doctorId',
  'date',
  'timePeriod',
]);
const TIME_PERIODS = Object.freeze([
  'morning', 'noon', 'afternoon', 'evening',
]);

function createClinicDomainConstraints(input = {}) {
  if (!isPlainObject(input)) invalid('Clinic domain constraints must be a plain object.');
  if (Object.keys(input).some((key) => !FIELDS.includes(key))) {
    invalid('Clinic domain constraints contain an unsupported field.');
  }

  const result = {
    specialtyId: optionalText(input.specialtyId, 'specialtyId'),
    serviceId: optionalText(input.serviceId, 'serviceId'),
    city: optionalText(input.city, 'city'),
    branchId: optionalText(input.branchId, 'branchId'),
    doctorId: optionalText(input.doctorId, 'doctorId'),
    date: optionalDate(input.date),
    timePeriod: optionalTimePeriod(input.timePeriod),
  };
  return Object.freeze(result);
}

function optionalText(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    invalid(`${field} must be a non-empty string of at most 200 characters.`);
  }
  return value.trim();
}

function optionalDate(value) {
  const date = optionalText(value, 'date');
  if (date === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid('date must use YYYY-MM-DD.');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    invalid('date must be a valid calendar date.');
  }
  return date;
}

function optionalTimePeriod(value) {
  const period = optionalText(value, 'timePeriod');
  if (period !== null && !TIME_PERIODS.includes(period)) {
    invalid('timePeriod is invalid.');
  }
  return period;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function invalid(message) {
  throw new ValidationError(message);
}

module.exports = Object.freeze({
  createClinicDomainConstraints,
  CLINIC_DOMAIN_CONSTRAINT_FIELDS: FIELDS,
  TIME_PERIODS,
});
