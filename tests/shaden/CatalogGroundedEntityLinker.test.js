'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CatalogGroundedEntityLinker,
  comparisonTokens,
} = require('../../src/services/shaden/CatalogGroundedEntityLinker');

const linker = new CatalogGroundedEntityLinker();
const catalog = Object.freeze({
  specialties: [
    entity('specialty-laser', 'ليزر'),
    entity('specialty-dermatology', 'الجلدية'),
  ],
  services: [
    entity('service-hair-removal', 'إزالة الشعر بالليزر'),
    entity('service-pigmentation', 'ليزر التصبغات'),
    entity('service-cleaning', 'تنظيف البشرة'),
    entity('service-consultation', 'استشارة جلدية', {
      aliases: ['جلدية'], specialty_id: 'specialty-dermatology',
    }),
  ],
  branches: [
    entity('branch-hamdaniya', 'فرع الحمدانية'),
    entity('branch-salihiya', 'فرع الصالحية'),
  ],
});

test('comparison normalization removes only a safe Arabic definite article', () => {
  assert.deepEqual(comparisonTokens('ما خدمات الليزر'), ['ما', 'خدمات', 'ليزر']);
  assert.deepEqual(comparisonTokens('الجلدية'), ['جلديه']);
  assert.deepEqual(comparisonTokens('الله'), ['الله']);
  assert.deepEqual(comparisonTokens('إزالة الشعر'), ['ازاله', 'شعر']);
});

test('links grounded specialties and branches without specializing a service', () => {
  const result = linker.link({
    text: 'ما خدمات الليزر فى فرع الحمدانية',
    ...catalog,
  });
  assert.deepEqual(result.specialty, {
    status: 'RESOLVED', id: 'specialty-laser', name: 'ليزر',
    matchType: 'CANONICAL_NAME',
  });
  assert.deepEqual(result.branch, {
    status: 'RESOLVED', id: 'branch-hamdaniya', name: 'فرع الحمدانية',
    matchType: 'CANONICAL_NAME',
  });
  assert.deepEqual(result.service, { status: 'UNRESOLVED' });
});

test('links a branch when the generic branch label is omitted', () => {
  const result = linker.link({ text: 'ما الخدمات المتوفرة في الصالحية', ...catalog });
  assert.equal(result.branch.status, 'RESOLVED');
  assert.equal(result.branch.id, 'branch-salihiya');
  assert.equal(result.branch.matchType, 'TYPE_LABEL_OMITTED');
});

test('protects a full explicit service from its overlapping parent specialty', () => {
  const result = linker.link({ text: 'هل تقدمون إزالة الشعر بالليزر', ...catalog });
  assert.equal(result.service.status, 'RESOLVED');
  assert.equal(result.service.id, 'service-hair-removal');
  assert.equal(result.specialty.status, 'UNRESOLVED');
});

test('suppresses a broad child alias that collides with its parent specialty', () => {
  const result = linker.link({ text: 'ما خدمات الجلدية', ...catalog });
  assert.equal(result.specialty.status, 'RESOLVED');
  assert.equal(result.specialty.id, 'specialty-dermatology');
  assert.equal(result.service.status, 'UNRESOLVED');
});

test('keeps the full child service when its complete identity is grounded', () => {
  const result = linker.link({ text: 'هل تقدمون استشارة جلدية', ...catalog });
  assert.equal(result.service.status, 'RESOLVED');
  assert.equal(result.service.id, 'service-consultation');
  assert.equal(result.specialty.status, 'UNRESOLVED');
});

test('applies parent-alias arbitration outside dermatology', () => {
  const result = linker.link({
    text: 'ما خدمات التجميل', branches: [],
    specialties: [entity('specialty-cosmetic', 'تجميل')],
    services: [entity('service-injection', 'حقن تجميلي', {
      aliases: ['تجميل'], specialty_id: 'specialty-cosmetic',
    })],
  });
  assert.equal(result.specialty.status, 'RESOLVED');
  assert.equal(result.service.status, 'UNRESOLVED');
});

test('marks an equal-strength unrelated cross-type identity ambiguous', () => {
  const result = linker.link({
    text: 'العناية', branches: [],
    specialties: [entity('specialty-care', 'العناية')],
    services: [entity('service-care', 'العناية', {
      specialty_id: 'specialty-other',
    })],
  });
  assert.equal(result.specialty.status, 'AMBIGUOUS');
  assert.equal(result.service.status, 'AMBIGUOUS');
  assert.equal(result.specialty.reason, 'CROSS_TYPE_IDENTITY_COLLISION');
});

test('keeps filler as a service when no specialty shares its grounded span', () => {
  const result = linker.link({
    text: 'خدمات الفيلر', branches: [],
    specialties: [entity('specialty-cosmetic', 'تجميل')],
    services: [entity('service-filler', 'فيلر', {
      specialty_id: 'specialty-cosmetic',
    })],
  });
  assert.equal(result.service.status, 'RESOLVED');
  assert.equal(result.service.id, 'service-filler');
  assert.equal(result.specialty.status, 'UNRESOLVED');
});

test('does not invent unknown catalog identities', () => {
  const result = linker.link({ text: 'ما خدمات العلاج الكريستالي', ...catalog });
  assert.equal(result.specialty.status, 'UNRESOLVED');
  assert.equal(result.service.status, 'UNRESOLVED');
  assert.equal(result.branch.status, 'UNRESOLVED');
});

test('preserves same-scope catalog ambiguity', () => {
  const result = linker.link({
    text: 'هل تقدمون العناية',
    specialties: [], branches: [],
    services: [
      entity('service-a', 'العناية', { aliases: ['رعاية'] }),
      entity('service-b', 'العناية', { aliases: ['اهتمام'] }),
    ],
  });
  assert.equal(result.service.status, 'AMBIGUOUS');
  assert.deepEqual(result.service.candidates.map(({ id }) => id), [
    'service-a', 'service-b',
  ]);
});

function entity(id, name, extra = {}) {
  return { id, name, is_active: true, ...extra };
}
