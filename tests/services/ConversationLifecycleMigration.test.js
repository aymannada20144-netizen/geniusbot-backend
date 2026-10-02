'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(
  __dirname,
  '../../database/migrations/030_conversation_lifecycle.sql'
), 'utf8');

test('lifecycle migration makes only patient inserts advance customer activity', () => {
  assert.match(source, /IF NEW\.sender_type = 'patient' THEN/u);
  assert.match(source, /SET last_customer_activity_at = NEW\.created_at/u);
  assert.match(source, /AFTER INSERT ON geniusbot\.messages/u);
});

test('lifecycle migration retains history and enforces one open channel identity only', () => {
  assert.match(source, /closed_reason = 'inactivity_timeout'/u);
  assert.match(source, /UNIQUE INDEX IF NOT EXISTS uq_conversations_open_channel_identity/u);
  assert.match(source, /\(clinic_id, channel, channel_identity\)/u);
  assert.doesNotMatch(source, /\(clinic_id, channel, patient_id\)/u);
  assert.match(source, /'open', 'closed', 'archived'/u);
  assert.doesNotMatch(source, /'pending'|\s'resolved'/u);
});
