'use strict';

const { ValidationError } = require('../errors');

function normalizeSaudiMobile(value, fieldName = 'phoneNumber', optional = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (optional) return null;
    throw new ValidationError(`${fieldName} is required.`);
  }

  const digits = String(value).replace(/\D/g, '');
  let nationalNumber = null;

  if (/^05\d{8}$/.test(digits)) {
    nationalNumber = digits.slice(1);
  } else if (/^5\d{8}$/.test(digits)) {
    nationalNumber = digits;
  } else if (/^9665\d{8}$/.test(digits)) {
    nationalNumber = digits.slice(3);
  } else if (/^009665\d{8}$/.test(digits)) {
    nationalNumber = digits.slice(5);
  }

  if (!nationalNumber) {
    throw new ValidationError(
      `${fieldName} must be a valid Saudi mobile number, such as +9665XXXXXXXX.`
    );
  }

  return `+966${nationalNumber}`;
}

function normalizeSaudiMobileDigits(
  value,
  fieldName = 'phoneNumber',
  optional = false
) {
  const normalized = normalizeSaudiMobile(value, fieldName, optional);
  return normalized === null ? null : normalized.slice(1);
}

function sameSaudiMobile(left, right) {
  try {
    return normalizeSaudiMobile(left) === normalizeSaudiMobile(right);
  } catch {
    return false;
  }
}

module.exports = {
  normalizeSaudiMobile,
  normalizeSaudiMobileDigits,
  sameSaudiMobile,
};
