'use strict';

require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { Pool } = require('pg');
const AppointmentEvents = require(
  '../../src/modules/appointments/AppointmentEvents'
);
const AppointmentRepository = require(
  '../../src/modules/appointments/AppointmentRepository'
);

test('persists cancellation status audit, change audit, and both outbox events', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is required for transactional cancellation tests');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const migration = fs.readFileSync(path.join(
      __dirname,
      '../../database/migrations/020_appointment_change_logs.sql'
    ), 'utf8')
      .replace(/^\s*BEGIN;\s*/i, '')
      .replace(/\s*COMMIT;\s*$/i, '');
    await client.query(migration);
    const cancellationReasonMigration = fs.readFileSync(path.join(
      __dirname,
      '../../database/migrations/021_appointment_cancellation_reason.sql'
    ), 'utf8')
      .replace(/^\s*BEGIN;\s*/i, '')
      .replace(/\s*COMMIT;\s*$/i, '');
    await client.query(cancellationReasonMigration);
    const column = (await client.query(`
      SELECT is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'geniusbot'
        AND table_name = 'appointments'
        AND column_name = 'cancellation_reason'
    `)).rows[0];
    assert.deepEqual(column, { is_nullable: 'YES', data_type: 'text' });
    const fixture = (await client.query(`
      SELECT *
      FROM geniusbot.appointments
      WHERE status IN ('pending', 'confirmed', 'checked_in')
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE
    `)).rows[0];
    if (!fixture) {
      t.skip('A cancellable appointment fixture is required');
      return;
    }

    const count = async (table) => Number((await client.query(
      `SELECT COUNT(*) AS count
         FROM geniusbot.${table}
        WHERE appointment_id = $1`,
      [fixture.id]
    )).rows[0].count);
    const statusAuditBefore = await count('appointment_status_logs');
    const changeAuditBefore = await count('appointment_change_logs');
    const outboxBefore = Number((await client.query(
      `SELECT COUNT(*) AS count
         FROM geniusbot.outbox_events
        WHERE aggregate_id = $1`,
      [fixture.id]
    )).rows[0].count);

    const repository = new AppointmentRepository({
      transaction: async (callback) => callback(client),
    });
    const result = await repository.applyAtomicChange({
      clinicId: fixture.clinic_id,
      appointmentId: fixture.id,
      expectedStatus: fixture.status,
      expectedUpdatedAt: new Date(fixture.updated_at).toISOString(),
      operation: 'cancel',
      patch: {
        status: 'cancelled',
        cancellation_reason: 'AM-02 transactional test',
      },
      actor: { staffId: null, patientId: null, source: 'system' },
      reason: 'AM-02 transactional test',
    });

    assert.equal(result.appointment.status, 'cancelled');
    assert.equal(
      result.appointment.cancellation_reason,
      'AM-02 transactional test'
    );
    assert.equal(result.appointment.notes, fixture.notes);
    const withoutReason = (await client.query(`
      UPDATE geniusbot.appointments
      SET cancellation_reason = NULL
      WHERE id = $1
      RETURNING status, notes, cancellation_reason
    `, [fixture.id])).rows[0];
    assert.equal(withoutReason.status, 'cancelled');
    assert.equal(withoutReason.cancellation_reason, null);
    assert.equal(withoutReason.notes, fixture.notes);
    assert.equal(await count('appointment_status_logs'), statusAuditBefore + 1);
    assert.equal(await count('appointment_change_logs'), changeAuditBefore + 1);
    assert.equal(Number((await client.query(
      `SELECT COUNT(*) AS count
         FROM geniusbot.outbox_events
        WHERE aggregate_id = $1`,
      [fixture.id]
    )).rows[0].count), outboxBefore + 2);
    const events = (await client.query(
      `SELECT event_name, payload
         FROM geniusbot.outbox_events
        WHERE aggregate_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 2`,
      [fixture.id]
    )).rows;
    assert.deepEqual(
      new Set(events.map(({ event_name: name }) => name)),
      new Set([AppointmentEvents.STATUS_CHANGED, AppointmentEvents.CHANGED])
    );
    const changed = events.find(({ event_name: name }) => (
      name === AppointmentEvents.CHANGED
    ));
    assert.equal(changed.payload.operation, 'cancel');
    assert.deepEqual(changed.payload.changeTypes, ['status']);
    assert.equal(changed.payload.reason, 'AM-02 transactional test');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
