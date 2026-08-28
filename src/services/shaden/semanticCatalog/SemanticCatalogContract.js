'use strict';

const {
  NEED_CONCEPTS,
  NEED_QUALIFIERS,
} = require('../../../contracts/shaden/SemanticNeedConcepts');

const REFERENCE_KINDS = Object.freeze([
  'CATALOG_REFERENCE',
  'DESCRIBED_NEED',
  'LOCATION_REFERENCE',
]);

const EXPLICIT_REFERENCE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'surface', 'interpretedMeaning', 'authoritative',
    'atLocationReferenceIndex',
  ],
  properties: {
    kind: { type: 'string', enum: ['CATALOG_REFERENCE', 'LOCATION_REFERENCE'] },
    surface: { type: ['string', 'null'], minLength: 1 },
    interpretedMeaning: { type: ['string', 'null'], minLength: 1 },
    authoritative: { const: false },
    atLocationReferenceIndex: { type: ['integer', 'null'], minimum: 0 },
  },
});

const DESCRIBED_NEED_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'surface', 'concept', 'qualifiers', 'authoritative',
    'atLocationReferenceIndex',
  ],
  properties: {
    kind: { const: 'DESCRIBED_NEED' },
    surface: { type: 'string', minLength: 1 },
    concept: { type: 'string', enum: NEED_CONCEPTS },
    qualifiers: {
      type: 'array',
      items: { type: 'string', enum: NEED_QUALIFIERS },
    },
    authoritative: { const: false },
    atLocationReferenceIndex: { type: ['integer', 'null'], minimum: 0 },
  },
});

const REFERENCE_SCHEMA = Object.freeze({
  oneOf: [EXPLICIT_REFERENCE_SCHEMA, DESCRIBED_NEED_SCHEMA],
});

const SEMANTIC_CATALOG_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['answerNeeded', 'references'],
  properties: {
    answerNeeded: { type: 'boolean' },
    references: { type: 'array', items: REFERENCE_SCHEMA },
  },
});

function validateSemanticCatalogMeaning(value) {
  const errors = [];
  if (!plainObject(value)) return { valid: false, errors: ['meaning must be a plain object'] };
  exactKeys(value, ['answerNeeded', 'references'], 'meaning', errors);
  if (typeof value.answerNeeded !== 'boolean') errors.push('answerNeeded must be boolean');
  if (!Array.isArray(value.references)) errors.push('references must be an array');
  else value.references.forEach((reference, index) => {
    const label = `references[${index}]`;
    if (!plainObject(reference)) return errors.push(`${label} must be a plain object`);
    if (!REFERENCE_KINDS.includes(reference.kind)) errors.push(`${label}.kind is invalid`);
    if (reference.kind === 'DESCRIBED_NEED') {
      exactKeys(reference, [
        'kind', 'surface', 'concept', 'qualifiers', 'authoritative',
        'atLocationReferenceIndex',
      ], label, errors);
      if (typeof reference.surface !== 'string' || !reference.surface.trim()) errors.push(`${label}.surface is invalid`);
      if (!NEED_CONCEPTS.includes(reference.concept)) errors.push(`${label}.concept is invalid`);
      if (!Array.isArray(reference.qualifiers) ||
          reference.qualifiers.some((item) => !NEED_QUALIFIERS.includes(item)) ||
          new Set(reference.qualifiers).size !== reference.qualifiers.length) {
        errors.push(`${label}.qualifiers is invalid`);
      }
    } else {
      exactKeys(reference, [
        'kind', 'surface', 'interpretedMeaning', 'authoritative',
        'atLocationReferenceIndex',
      ], label, errors);
      if (!nullableText(reference.surface)) errors.push(`${label}.surface is invalid`);
      if (!nullableText(reference.interpretedMeaning)) errors.push(`${label}.interpretedMeaning is invalid`);
      if (reference.surface === null && reference.interpretedMeaning === null) errors.push(`${label} must contain meaning`);
    }
    if (reference.authoritative !== false) errors.push(`${label}.authoritative must be false`);
    validateLocationReference(value.references, reference, index, label, errors);
  });
  return { valid: errors.length === 0, errors };
}
function validateLocationReference(references, reference, index, label, errors) {
  const locationIndex = reference.atLocationReferenceIndex;
  if (reference.kind === 'LOCATION_REFERENCE') {
    if (locationIndex !== null) errors.push(`${label}.atLocationReferenceIndex must be null for LOCATION_REFERENCE`);
    return;
  }
  if (locationIndex === null) return;
  if (!Number.isInteger(locationIndex) || locationIndex < 0 || locationIndex >= references.length) {
    errors.push(`${label}.atLocationReferenceIndex must reference an existing reference`);
    return;
  }
  if (references[locationIndex]?.kind !== 'LOCATION_REFERENCE') {
    errors.push(`${label}.atLocationReferenceIndex must reference LOCATION_REFERENCE`);
  }
  if (locationIndex === index) errors.push(`${label}.atLocationReferenceIndex cannot reference itself`);
}

function exactKeys(value, allowed, label, errors) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    errors.push(`${label} must contain exactly: ${allowed.join(', ')}`);
  }
}
function nullableText(value) { return value === null || (typeof value === 'string' && value.trim()); }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

module.exports = Object.freeze({
  REFERENCE_KINDS, REFERENCE_SCHEMA, SEMANTIC_CATALOG_SCHEMA,
  NEED_CONCEPTS, NEED_QUALIFIERS,
  validateSemanticCatalogMeaning,
});
