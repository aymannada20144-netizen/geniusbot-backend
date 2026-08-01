const { ValidationError } = require('../errors');

function validateRequired(value, fieldName) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new ValidationError(`${fieldName} is required`);
  }
}

function validatePlainObject(value, fieldName = 'value') {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new ValidationError(`${fieldName} must be an object.`);
  }
  return value;
}

function validateOptionalUuid(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  validateUuid(value, fieldName);
  return value;
}

function validateIsoDate(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${fieldName} must be an ISO date.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${fieldName} must be a valid ISO date.`);
  }
  return value;
}

function validateUuid(value, fieldName) {
  validateRequired(value, fieldName);

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid UUID.`);
  }
}

module.exports = {
  validateRequired,
  validateUuid,
  validatePlainObject,
  validateOptionalUuid,
  validateIsoDate,
};
