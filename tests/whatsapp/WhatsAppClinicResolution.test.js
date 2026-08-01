'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ClinicRepository = require('../../src/repositories/ClinicRepository');
const WhatsAppWebhookParser = require('../../src/channels/whatsapp/WhatsAppWebhookParser');

function clinic(overrides = {}) {
  return { id: 'clinic-1', is_active: true, ...overrides };
}

test('parser preserves Meta phone number ID and display number', () => {
  const parsed = WhatsAppWebhookParser.parse({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '1227991787058358', display_phone_number: '+966 56 111 1111' }, messages: [{ id: 'wamid-1', from: '966500000001', timestamp: '1785490000', type: 'text', text: { body: 'من معي؟' } }] } }] }] });
  assert.equal(parsed.metaPhoneNumberId, '1227991787058358');
  assert.equal(parsed.receiverPhone, '+966 56 111 1111');
});

test('resolves by stable phone number ID before display number', async () => {
  const calls = [];
  const repository = new ClinicRepository({ query: async (sql, params) => { calls.push({ sql, params }); return { rows: [clinic()] }; } });
  assert.equal((await repository.resolveWhatsAppClinic({ phoneNumberId: '1227991787058358', displayPhoneNumber: '+966561111111' })).id, 'clinic-1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /whatsapp_phone_number_id/);
});

test('falls back to normalized display number when stable ID is unknown', async () => {
  let call = 0;
  const repository = new ClinicRepository({ query: async (sql, params) => {
    call += 1;
    if (call === 1) return { rows: [] };
    assert.match(sql, /regexp_replace/);
    assert.deepEqual(params, ['966561111111']);
    return { rows: [clinic()] };
  } });
  assert.equal((await repository.resolveWhatsAppClinic({ phoneNumberId: '999999999999', displayPhoneNumber: '+966 56 111 1111' })).id, 'clinic-1');
});

test('unknown identifiers fail closed without cross-clinic fallback', async () => {
  const repository = new ClinicRepository({ query: async () => ({ rows: [] }) });
  assert.equal(await repository.resolveWhatsAppClinic({ phoneNumberId: '999999999999', displayPhoneNumber: '+966500000000' }), null);
});

test('inactive clinic is rejected by both lookup queries', async () => {
  const queries = [];
  const repository = new ClinicRepository({ query: async (sql) => { queries.push(sql); return { rows: [] }; } });
  assert.equal(await repository.resolveWhatsAppClinic({ phoneNumberId: '999999999999', displayPhoneNumber: '+966500000000' }), null);
  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => /is_active = TRUE/.test(sql)));
});

test('ambiguous stable or display identifiers are rejected', async () => {
  const duplicate = { rows: [clinic(), clinic({ id: 'clinic-2' })] };
  const stableRepository = new ClinicRepository({ query: async () => duplicate });
  await assert.rejects(stableRepository.resolveWhatsAppClinic({ phoneNumberId: '1227991787058358' }), { code: 'WHATSAPP_CLINIC_AMBIGUOUS' });
  let call = 0;
  const displayRepository = new ClinicRepository({ query: async () => (++call === 1 ? { rows: [] } : duplicate) });
  await assert.rejects(displayRepository.resolveWhatsAppClinic({ phoneNumberId: '999999999999', displayPhoneNumber: '+966561111111' }), { code: 'WHATSAPP_CLINIC_AMBIGUOUS' });
});
