'use strict';

const { ConflictError } = require('./index');

const POSTGRES_CONSTRAINT_MAP = Object.freeze({
  no_patient_schedule_overlap: {
    ErrorClass: ConflictError,
    message: 'Patient already has another appointment at this time.',
  },
});

function mapPostgresError(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const mapping = POSTGRES_CONSTRAINT_MAP[error.constraint];

  if (!mapping) {
    return null;
  }

  return new mapping.ErrorClass(mapping.message);
}

module.exports = mapPostgresError;