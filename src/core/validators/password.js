'use strict';

const { ValidationError } = require('../errors');

const MIN_PASSWORD_LENGTH = 8;

function validatePassword(password, fieldName = 'password') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`${fieldName} must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (password.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot contain only whitespace.`);
  }

  return password;
}

function validatePasswordConfirmation(password, confirmation) {
  validatePassword(password, 'newPassword');

  if (password !== confirmation) {
    throw new ValidationError('Password confirmation does not match.');
  }

  return password;
}

module.exports = {
  validatePassword,
  validatePasswordConfirmation,
};
