const { ValidationError } = require('../errors');

function validateRequired(value, fieldName) {
  if (!value) {
    throw new ValidationError(`${fieldName} is required`);
  }
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
};