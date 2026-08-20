'use strict';

const ValidationError = require('../../core/errors/ValidationError');

const SCALAR_FIELDS = Object.freeze([
  'specialtyId', 'specialtyText', 'serviceId', 'serviceText', 'city',
  'branchId', 'branchText', 'doctorId', 'doctorText', 'date', 'timePeriod',
]);
const CANDIDATE_FIELDS = Object.freeze([
  'specialtyCandidates', 'serviceCandidates', 'branchCandidates',
  'doctorCandidates',
]);
const FIELDS = Object.freeze([...SCALAR_FIELDS, ...CANDIDATE_FIELDS]);

function createClinicDomainEntityProposals(input = {}) {
  if (!isPlainObject(input)) invalid('Clinic domain entity proposals must be a plain object.');
  if (Object.keys(input).some((key) => !FIELDS.includes(key))) {
    invalid('Clinic domain entity proposals contain an unsupported field.');
  }
  const result = {};
  for (const field of SCALAR_FIELDS) {
    const value = optionalText(input[field], field);
    if (value !== null) result[field] = value;
  }
  for (const field of CANDIDATE_FIELDS) {
    const values = optionalCandidates(input[field], field);
    if (values.length > 0) result[field] = Object.freeze(values);
  }
  return Object.freeze(result);
}

function optionalText(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    invalid(`${field} must be a non-empty string of at most 200 characters.`);
  }
  return value.trim();
}

function optionalCandidates(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8) {
    invalid(`${field} must be an array of at most 8 strings.`);
  }
  const values = value.map((item) => optionalText(item, field));
  if (values.some((item) => item === null)) invalid(`${field} contains an empty candidate.`);
  return [...new Set(values)];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function invalid(message) { throw new ValidationError(message); }

module.exports = Object.freeze({
  createClinicDomainEntityProposals,
  CLINIC_DOMAIN_ENTITY_PROPOSAL_FIELDS: FIELDS,
});
