'use strict';

const CONTRACT_VERSION = 'minimal-consumer-contract';

const STATUS = Object.freeze([
  'UNDERSTOOD',
  'AMBIGUOUS',
  'UNKNOWN',
]);

const GOAL_TYPES = Object.freeze([
  'ASK',
  'ACT',
  'SOCIAL',
  'OTHER',
]);

const SUBJECT_KINDS = Object.freeze([
  'SERVICE_OR_NEED',
  'BRANCH',
  'PROVIDER',
  'APPOINTMENT',
  'PAYMENT',
]);

const SERVICE_REFERENCE_TYPES = Object.freeze([
  'IDENTITY',
  'NEED',
]);

const CONSTRAINT_KINDS = Object.freeze([
  'NEGATIVE',
  'LOCATION',
  'DATE',
  'TIME',
  'PREFERENCE',
  'MEDICAL_CONTEXT',
  'OTHER',
]);

const SOURCES = Object.freeze([
  'CURRENT',
  'CONTEXT',
]);

const MAX_CONTEXT_TURNS = 4;

module.exports = Object.freeze({
  CONTRACT_VERSION,
  STATUS,
  GOAL_TYPES,
  SUBJECT_KINDS,
  SERVICE_REFERENCE_TYPES,
  CONSTRAINT_KINDS,
  SOURCES,
  MAX_CONTEXT_TURNS,
});
