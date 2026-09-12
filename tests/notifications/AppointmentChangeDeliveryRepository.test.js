'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const Repository = require('../../src/repositories/AppointmentChangeDeliveryRepository');

test('PostgreSQL receipt claim, backoff, sent deduplication and uncertainty using temporary tables',
  { skip: process.env.TEST_APPOINTMENT_CHANGE_DELIVERY_DB !== '1' }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE outbox_events (id uuid PRIMARY KEY) ON COMMIT DROP');
      const migration = fs.readFileSync(path.join(__dirname,
        '../../database/migrations/027_appointment_change_deliveries.sql'), 'utf8')
        .replace('BEGIN;', '').replace('COMMIT;', '').split('geniusbot.').join('pg_temp.')
        .replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE IF NOT EXISTS');
      await client.query(migration);
      const repo = new Repository({ query: (sql, args) => client.query(sql.split('geniusbot.').join('pg_temp.'), args) });
      const id = '11111111-1111-4111-8111-111111111111';
      await client.query('INSERT INTO pg_temp.outbox_events VALUES ($1)', [id]);
      assert.equal((await repo.claim(id)).attempts, 1); assert.equal(await repo.claim(id), null);
      await repo.markFailed(id, { uncertain: false, retryable: true, errorCode: 'RATE_LIMIT' });
      assert.equal(await repo.claim(id), null);
      await client.query("UPDATE pg_temp.appointment_change_deliveries SET retry_at = now() - interval '1 second'");
      assert.equal((await repo.claim(id)).attempts, 2);
      await repo.markSent(id, 'wamid.receipt'); assert.equal(await repo.claim(id), null);
      assert.equal((await repo.find(id)).wamid, 'wamid.receipt');
      const second = '22222222-2222-4222-8222-222222222222';
      await client.query('INSERT INTO pg_temp.outbox_events VALUES ($1)', [second]);
      await repo.claim(second);
      await repo.markFailed(second, { uncertain: true, retryable: true, errorCode: 'TIMEOUT' });
      assert.equal((await repo.find(second)).retryable, false); assert.equal(await repo.claim(second), null);
    } finally { await client.query('ROLLBACK'); await client.end(); }
  });
