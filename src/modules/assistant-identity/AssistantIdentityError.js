'use strict';

const { AppError } = require('../../core/errors');

class AssistantIdentityError extends AppError {
  constructor(code, message, statusCode = 400) {
    super(message, statusCode, code);
  }
}

module.exports = AssistantIdentityError;
