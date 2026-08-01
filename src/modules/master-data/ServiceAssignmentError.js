'use strict';

const AppError = require('../../core/errors/AppError');

class ServiceAssignmentError extends AppError {
  constructor(code, message, statusCode = 400) {
    super(message, statusCode, code);
  }
}

module.exports = ServiceAssignmentError;
