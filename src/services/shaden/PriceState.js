'use strict';

// Persisted price-state contract.  Keep this module data-only: all catalog
// validation and transition rules live in the adapter and reducer.
const SCHEMA_VERSION = 2;
const FIELDS = Object.freeze(['schemaVersion', 'status', 'service', 'paymentMethod',
  'insuranceCompany', 'insuranceClass', 'quote', 'pendingSlot', 'provenance']);

function create() {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'awaiting_service',
    service: null,
    paymentMethod: null,
    insuranceCompany: null,
    insuranceClass: null,
    quote: null,
    pendingSlot: 'service',
    provenance: {},
  };
}

module.exports = Object.freeze({ SCHEMA_VERSION, FIELDS, create });
