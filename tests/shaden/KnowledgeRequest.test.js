'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createKnowledgeRequest,
} = require('../../src/contracts/shaden/KnowledgeRequest');

test('KnowledgeRequest', async (t) => {
  await t.test('creates a safe default request', () => {
    const result = createKnowledgeRequest();

    assert.equal(result.version, 1);
    assert.equal(result.type, 'none');
    assert.equal(result.source, 'none');
    assert.equal(result.allowGeneralModelKnowledge, false);
    assert.equal(result.required, false);
    assert.deepEqual(result.keywords, []);
  });

  await t.test('routes medical knowledge only to approved knowledge base', () => {
    const result = createKnowledgeRequest({
      type: 'medical_faq',
      clinicId: 'clinic-1',
      serviceId: 'service-1',
      query: 'هل الليزر يسبب ألم؟',
      keywords: ['ليزر', 'ألم'],
      required: true,
    });

    assert.equal(result.type, 'medical_faq');
    assert.equal(result.source, 'knowledge_base');
    assert.equal(result.allowGeneralModelKnowledge, false);
    assert.equal(result.required, true);
  });

  await t.test('routes availability only to booking engine', () => {
    const result = createKnowledgeRequest({
      type: 'availability',
      clinicId: 'clinic-1',
      serviceId: 'service-1',
    });

    assert.equal(result.source, 'booking_engine');
    assert.equal(result.allowGeneralModelKnowledge, false);
  });

  await t.test('routes appointment details only to appointment service', () => {
    const result = createKnowledgeRequest({
      type: 'appointment_details',
      clinicId: 'clinic-1',
      appointmentId: 'appointment-1',
    });

    assert.equal(result.source, 'appointment_service');
  });

  await t.test('does not allow caller to override the authoritative source', () => {
    const result = createKnowledgeRequest({
      type: 'medical_faq',
      source: 'appointment_service',
    });

    assert.equal(result.source, 'knowledge_base');
  });

  await t.test('rejects unsupported knowledge types safely', () => {
    const result = createKnowledgeRequest({
      type: 'internet_medical_search',
      query: 'anything',
    });

    assert.equal(result.type, 'none');
    assert.equal(result.source, 'none');
    assert.equal(result.allowGeneralModelKnowledge, false);
  });

  await t.test('normalizes keywords safely', () => {
    const result = createKnowledgeRequest({
      type: 'service_faq',
      keywords: ['ليزر', 'ليزر', '', null, 'جلسة'],
    });

    assert.deepEqual(result.keywords, ['ليزر', 'جلسة']);
  });

  await t.test('returns immutable structures', () => {
    const result = createKnowledgeRequest({
      type: 'clinic_policy',
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.keywords), true);
  });
});