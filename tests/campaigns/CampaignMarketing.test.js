'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MessageFactory = require('../../src/communication/factories/MessageFactory');

const base = {
  phone: '966500000000',
  patientName: 'منة',
  clinicId: '00000000-0000-0000-0000-000000000001',
  patientId: '00000000-0000-0000-0000-000000000002',
  campaignId: '00000000-0000-0000-0000-000000000003',
};

test('occasion campaign uses Arabic marketing template and patient name only', () => {
  const message = MessageFactory.build('eid_al_fitr', {
    ...base,
    messageType: 'eid_al_fitr',
  });
  assert.equal(message.template.name, 'eid_al_fitr');
  assert.equal(message.template.language, 'ar');
  assert.deepEqual(message.template.variables, { patientName: 'منة' });
});

test('special offer preserves Meta variable order', () => {
  const message = MessageFactory.build('special_offer', {
    ...base,
    messageType: 'special_offer',
    offerTitle: 'عرض الليزر',
    priceOrDiscount: '20%',
    validUntil: '30 سبتمبر 2026',
  });
  assert.deepEqual(Object.keys(message.template.variables), [
    'patientName',
    'offerTitle',
    'priceOrDiscount',
    'validUntil',
  ]);
});
