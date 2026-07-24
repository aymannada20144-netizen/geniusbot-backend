'use strict';

const { ValidationError } = require('../errors');

function normalizeSaudiMobile(value, fieldName, optional = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (optional) return null;
    throw new ValidationError(`${fieldName} is required.`);
  }

  const compact = String(value).trim().replace(/[\s()-]/g, '');
  let local;
  if (/^05\d{8}$/.test(compact)) local = compact;
  if (/^(?:\+?966)5\d{8}$/.test(compact)) local = `0${compact.replace(/^\+?966/, '')}`;

  if (!local) {
    throw new ValidationError(
      `${fieldName} must be a valid Saudi mobile number, such as +9665XXXXXXXX.`
    );
  }

  return `+966${local.slice(1)}`;
}

module.exports = { normalizeSaudiMobile };
