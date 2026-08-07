'use strict';

require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const AppointmentEvents = require(
  '../../src/modules/appointments/AppointmentEvents'
);
const AppointmentRepository = require(
  '../../src/modules/appointments/AppointmentRepository'
);
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);

const outboxTableSql = `
  CREATE TABLE IF NOT EXISTS geniusbot.outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz NULL,
    CONSTRAINT chk_outbox_events_payload_object
      CHECK (jsonb_typeof(payload) = 'object')
  )
`;

test('persists appointment audit and outbox records atomically', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is required for PostgreSQL transactional outbox tests');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(outboxTableSql);

    const auditInfrastructure = await client.query(`
      SELECT
        to_regprocedure('geniusbot.log_appointment_status_change()')
          AS audit_function,
        EXISTS (
          SELECT 1
          FROM pg_trigger AS trigger
          JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'geniusbot'
            AND relation.relname = 'appointments'
            AND trigger.tgname = 'trg_appointments_log_status_update'
            AND NOT trigger.tgisinternal
        ) AS has_audit_trigger
    `);
    const hasAuditFunction = Boolean(
      auditInfrastructure.rows[0].audit_function
    );
    if (hasAuditFunction && !auditInfrastructure.rows[0].has_audit_trigger) {
      await client.query(`
        CREATE TRIGGER trg_appointments_test_log_status_update
        AFTER UPDATE OF status ON geniusbot.appointments
        FOR EACH ROW
        EXECUTE FUNCTION geniusbot.log_appointment_status_change()
      `);
    }

    const appointmentResult = await client.query(`
      SELECT id, clinic_id, status
      FROM geniusbot.appointments
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE
    `);
    let appointment = appointmentResult.rows[0];
    if (!appointment) {
      const created = await client.query(`
        INSERT INTO geniusbot.appointments (
          clinic_id,
          branch_id,
          patient_id,
          service_id,
          doctor_id,
          room_id,
          conversation_id,
          appointment_start,
          appointment_end,
          payment_method_id,
          insurance_company_id,
          insurance_class_id,
          quoted_price,
          currency,
          status,
          source,
          notes
        )
        SELECT
          clinic_id,
          branch_id,
          patient_id,
          service_id,
          doctor_id,
          room_id,
          conversation_id,
          appointment_start,
          appointment_end,
          payment_method_id,
          insurance_company_id,
          insurance_class_id,
          quoted_price,
          currency,
          'pending',
          source,
          notes
        FROM geniusbot.appointments
        ORDER BY created_at
        LIMIT 1
        RETURNING id, clinic_id, status
      `);
      appointment = created.rows[0];
    }
    if (!appointment) {
      t.skip('An appointment fixture is required');
      return;
    }

    const repository = new AppointmentRepository(client);
    const service = new AppointmentService(repository);
    const countRows = async (table) => {
      const result = await client.query(
        `SELECT COUNT(*)::int AS count FROM geniusbot.${table} WHERE appointment_id = $1`,
        [appointment.id]
      );
      return result.rows[0].count;
    };

    const auditBefore = await countRows('appointment_status_logs');
    const outboxBeforeResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM geniusbot.outbox_events WHERE aggregate_id = $1',
      [appointment.id]
    );
    const outboxBefore = outboxBeforeResult.rows[0].count;

    const updated = await repository.updateStatus(
      appointment.clinic_id,
      appointment.id,
      'confirmed',
      'pending'
    );
    assert.deepEqual(updated, { id: appointment.id, status: 'confirmed' });

    assert.equal(
      await countRows('appointment_status_logs'),
      auditBefore + (hasAuditFunction ? 1 : 0)
    );
    const outboxResult = await client.query(
      `SELECT event_name, aggregate_type, aggregate_id, payload
       FROM geniusbot.outbox_events
       WHERE aggregate_id = $1
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [appointment.id]
    );
    assert.equal(outboxResult.rows.length, 1);
    assert.deepEqual(outboxResult.rows[0], {
      event_name: AppointmentEvents.STATUS_CHANGED,
      aggregate_type: 'appointment',
      aggregate_id: appointment.id,
      payload: {
        appointmentId: appointment.id,
        fromStatus: 'pending',
        toStatus: 'confirmed',
      },
    });

    const auditAfterTransition = await countRows('appointment_status_logs');
    const outboxAfterTransition = outboxBefore + 1;
    const noOp = await service.updateAppointmentStatus(
      appointment.clinic_id,
      appointment.id,
      'confirmed'
    );
    assert.equal(noOp.communication.status, 'not_required');
    assert.equal(await countRows('appointment_status_logs'), auditAfterTransition);
    assert.equal(
      (await client.query(
        'SELECT COUNT(*)::int AS count FROM geniusbot.outbox_events WHERE aggregate_id = $1',
        [appointment.id]
      )).rows[0].count,
      outboxAfterTransition
    );

    await assert.rejects(
      service.updateAppointmentStatus(
        appointment.clinic_id,
        appointment.id,
        'pending'
      ),
      /transition is not allowed/
    );
    assert.equal(await countRows('appointment_status_logs'), auditAfterTransition);

    assert.equal(
      await repository.updateStatus(
        appointment.clinic_id,
        appointment.id,
        'checked_in',
        'pending'
      ),
      null
    );
    assert.equal(
      (await client.query(
        'SELECT COUNT(*)::int AS count FROM geniusbot.outbox_events WHERE aggregate_id = $1',
        [appointment.id]
      )).rows[0].count,
      outboxAfterTransition
    );

    await client.query(`
      ALTER TABLE geniusbot.outbox_events
      ADD CONSTRAINT chk_outbox_events_test_reject_status_changed
      CHECK (event_name <> 'appointment.status_changed') NOT VALID
    `);
    await client.query('SAVEPOINT outbox_failure');
    await assert.rejects(
      repository.updateStatus(
        appointment.clinic_id,
        appointment.id,
        'checked_in',
        'confirmed'
      )
    );
    await client.query('ROLLBACK TO SAVEPOINT outbox_failure');

    const unchanged = await client.query(
      'SELECT status FROM geniusbot.appointments WHERE id = $1',
      [appointment.id]
    );
    assert.equal(unchanged.rows[0].status, 'confirmed');
    assert.equal(await countRows('appointment_status_logs'), auditAfterTransition);
    assert.equal(
      (await client.query(
        'SELECT COUNT(*)::int AS count FROM geniusbot.outbox_events WHERE aggregate_id = $1',
        [appointment.id]
      )).rows[0].count,
      outboxAfterTransition
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
