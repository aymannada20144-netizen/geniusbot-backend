'use strict';

const { AppError } = require('../../core/errors');

class PatientLifecycleError extends AppError {
  constructor(code, message, statusCode = 400, details) {
    super(message, statusCode, code);
    if (details) this.details = details;
  }
}

module.exports = PatientLifecycleError;
