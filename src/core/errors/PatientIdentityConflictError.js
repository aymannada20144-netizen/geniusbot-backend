'use strict';

const ConflictError = require('./ConflictError');

class PatientIdentityConflictError extends ConflictError {
  constructor(
    message = 'Multiple patients match the same normalized phone number.',
    code = 'PATIENT_IDENTITY_CONFLICT'
  ) {
    super(message);
    this.name = 'PatientIdentityConflictError';
    this.code = code;
  }
}

module.exports = PatientIdentityConflictError;
