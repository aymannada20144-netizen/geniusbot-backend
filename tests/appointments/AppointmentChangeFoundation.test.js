'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const AppointmentEvents = require(
  '../../src/modules/appointments/AppointmentEvents'
);
const AppointmentRepository = require(
  '../../src/modules/appointments/AppointmentRepository'
);
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);
const mapPostgresError = require(
  '../../src/core/errors/postgresErrorMapper'
);

const clinicId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const doctorId = '33333333-3333-4333-8333-333333333333';
const replacementDoctorId = '44444444-4444-4444-8444-444444444444';
const updatedAt = '2026-08-11T08:00:00.000Z';

function baseAppointment() {
  return {
    id: appointmentId,
    clinic_id: clinicId,
    status: 'confirmed',
    appointment_start: '2026-08-15T14:00:00.000Z',
    appointment_end: '2026-08-15T14:30:00.000Z',
    service_id: '55555555-5555-4555-8555-555555555555',
    branch_id: '66666666-6666-4666-8666-666666666666',
    doctor_id: doctorId,
    room_id: '77777777-7777-4777-8777-777777777777',
    quoted_price: '100.00',
    currency: 'SAR',
    notes: 'Patient requested morning appointment',
    cancellation_reason: null,
    updated_at: updatedAt,
  };
}

function createTransactionalDb({ failAudit = false, failOutbox = false,
  slotConflict = false } = {}) {
  const committed = {
    appointment: baseAppointment(),
    audits: [],
    events: [],
  };

  return {
    committed,
    async query(sql) {
      if (/SELECT \*/.test(sql) && /"clinic_id" = \$1/.test(sql)) {
        return {
          rows: committed.appointment
            ? [structuredClone(committed.appointment)]
            : [],
        };
      }
      throw new Error(`Unexpected non-transactional SQL in test: ${sql}`);
    },
    async transaction(callback) {
      const working = structuredClone(committed);
      const client = {
        async query(sql, params) {
          if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
            return {
              rows: working.appointment ? [structuredClone(working.appointment)] : [],
            };
          }
          if (/pg_catalog\.set_config/.test(sql)) {
            return { rows: [{}] };
          }
          if (/UPDATE "geniusbot"\."appointments"/.test(sql)) {
            if (slotConflict) {
              const error = new Error('conflicting key value violates exclusion constraint');
              error.code = '23P01';
              error.constraint = 'excl_appointments_doctor_overlap';
              throw error;
            }
            const setSql = sql.slice(0, sql.indexOf('WHERE'));
            const setFields = [...setSql.matchAll(/"([a-z_]+)" = \$\d+/g)]
              .map((match) => match[1]);
            setFields.forEach((field, index) => {
              working.appointment[field] = params[index];
            });
            working.appointment.updated_at = '2026-08-11T09:00:00.000Z';
            return { rows: [working.appointment] };
          }
          if (/INSERT INTO geniusbot\.appointment_change_logs/.test(sql)) {
            if (failAudit) throw new Error('audit insert failed');
            working.audits.push({
              operation: params[2],
              changeTypes: params[3],
              before: params[4],
              after: params[5],
            });
            return {
              rows: [{
                id: '88888888-8888-4888-8888-888888888888',
                created_at: '2026-08-11T09:00:00.000Z',
              }],
            };
          }
          if (/INSERT INTO geniusbot\.outbox_events/.test(sql)) {
            if (failOutbox) throw new Error('outbox insert failed');
            working.events.push({
              name: params[0],
              appointmentId: params[1],
              payload: params[2],
            });
            return { rows: [] };
          }
          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
      };

      const result = await callback(client);
      committed.appointment = working.appointment;
      committed.audits = working.audits;
      committed.events = working.events;
      return result;
    },
  };
}

function command(overrides = {}) {
  return {
    clinicId,
    appointmentId,
    expected: { status: 'confirmed', updatedAt },
    operation: 'modify',
    changes: {},
    actor: { staffId: null, patientId: null, source: 'system' },
    metadata: {},
    ...overrides,
  };
}

test('normalizes the internal command and rejects server-derived fields', () => {
  const service = new AppointmentService({ applyAtomicChange: async () => {} });
  const normalized = service.normalizeChangeCommand(command({
    changes: { appointmentStart: '2026-08-16T16:00:00Z' },
  }));
  assert.equal(normalized.expected.updatedAt, updatedAt);
  assert.equal(normalized.changes.appointmentStart, '2026-08-16T16:00:00.000Z');
  assert.throws(
    () => service.normalizeChangeCommand(command({ changes: { roomId: doctorId } })),
    /roomId is not supported/
  );
});

test('semantic change derivation does not treat equal Date instances as changes', () => {
  const service = new AppointmentService({ applyAtomicChange: async () => {} });
  assert.deepEqual(
    service.deriveSemanticChangeTypes(
      { appointment_start: new Date('2026-08-15T14:00:00.000Z') },
      { appointment_start: new Date('2026-08-15T14:00:00.000Z') }
    ),
    []
  );
});

test('atomically updates appointment, audit, and appointment.changed outbox', async () => {
  const db = createTransactionalDb();
  const service = new AppointmentService(new AppointmentRepository(db));
  const result = await service.applyValidatedChange(
    command(),
    { doctor_id: replacementDoctorId }
  );

  assert.equal(result.appointment.doctor_id, replacementDoctorId);
  assert.deepEqual(result.event.changeTypes, ['provider']);
  assert.equal(db.committed.audits.length, 1);
  assert.equal(db.committed.events.length, 1);
  assert.equal(db.committed.events[0].name, AppointmentEvents.CHANGED);
  assert.deepEqual(Object.keys(result.event.before), ['doctor_id']);
  assert.deepEqual(Object.keys(result.event.after), ['doctor_id']);
});

test('atomic cancellation preserves both status and semantic outbox events', async () => {
  const db = createTransactionalDb();
  const repository = new AppointmentRepository(db);
  const result = await repository.applyAtomicChange({
    clinicId,
    appointmentId,
    expectedStatus: 'confirmed',
    expectedUpdatedAt: updatedAt,
    operation: 'cancel',
    patch: {
      status: 'cancelled',
      cancellation_reason: 'Patient request',
    },
    actor: { staffId: null, patientId: null, source: 'api' },
    reason: 'Patient request',
  });

  assert.equal(result.appointment.status, 'cancelled');
  assert.deepEqual(result.event.changeTypes, ['status']);
  assert.deepEqual(result.event.before, { status: 'confirmed' });
  assert.deepEqual(result.event.after, { status: 'cancelled' });
  assert.deepEqual(
    db.committed.events.map((event) => event.name),
    [AppointmentEvents.STATUS_CHANGED, AppointmentEvents.CHANGED]
  );
  assert.equal(db.committed.audits[0].operation, 'cancel');
});

test('generic cancelled status persists AM-02 audit and outbox atomically', async () => {
  const db = createTransactionalDb();
  let notificationCleanups = 0;
  const service = new AppointmentService(
    new AppointmentRepository(db),
    null,
    {
      cancelAppointmentNotifications: async () => {
        notificationCleanups += 1;
      },
    }
  );

  const result = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'cancelled',
    'Travel',
    false,
    null
  );

  assert.equal(result.status, 'cancelled');
  assert.equal(db.committed.appointment.status, 'cancelled');
  assert.equal(db.committed.appointment.cancellation_reason, 'Travel');
  assert.equal(
    db.committed.appointment.notes,
    'Patient requested morning appointment'
  );
  assert.equal(notificationCleanups, 1);
  assert.equal(db.committed.audits.length, 1);
  assert.equal(db.committed.audits[0].operation, 'cancel');
  assert.deepEqual(db.committed.audits[0].changeTypes, ['status']);
  assert.deepEqual(
    db.committed.events.map((event) => event.name),
    [AppointmentEvents.STATUS_CHANGED, AppointmentEvents.CHANGED]
  );
  assert.equal(db.committed.events[1].payload.reason, 'Travel');
});

for (const failure of ['audit', 'outbox']) {
  test(`atomic cancellation rolls back when ${failure} persistence fails`, async () => {
    const db = createTransactionalDb({
      failAudit: failure === 'audit',
      failOutbox: failure === 'outbox',
    });
    const repository = new AppointmentRepository(db);
    await assert.rejects(repository.applyAtomicChange({
      clinicId,
      appointmentId,
      operation: 'cancel',
      patch: {
        status: 'cancelled',
        cancellation_reason: 'Patient request',
      },
      actor: { source: 'api' },
      reason: 'Patient request',
    }));
    assert.equal(db.committed.appointment.status, 'confirmed');
    assert.equal(db.committed.audits.length, 0);
    assert.equal(db.committed.events.length, 0);
  });
}

for (const failure of ['audit', 'outbox']) {
  test(`${failure} failure rolls back appointment and all foundation writes`, async () => {
    const db = createTransactionalDb({
      failAudit: failure === 'audit',
      failOutbox: failure === 'outbox',
    });
    const repository = new AppointmentRepository(db);

    await assert.rejects(
      repository.applyAtomicChange({
        clinicId,
        appointmentId,
        expectedStatus: 'confirmed',
        expectedUpdatedAt: updatedAt,
        operation: 'modify',
        patch: { doctor_id: replacementDoctorId },
        actor: { staffId: null, patientId: null, source: 'system' },
      }),
      new RegExp(`${failure} insert failed`)
    );
    assert.equal(db.committed.appointment.doctor_id, doctorId);
    assert.equal(db.committed.audits.length, 0);
    assert.equal(db.committed.events.length, 0);
  });
}

test('stale expected status rejects before mutation, audit, or outbox', async () => {
  const db = createTransactionalDb();
  const repository = new AppointmentRepository(db);
  await assert.rejects(
    repository.applyAtomicChange({
      clinicId,
      appointmentId,
      expectedStatus: 'pending',
      operation: 'modify',
      patch: { doctor_id: replacementDoctorId },
      actor: { source: 'system' },
    }),
    (error) => error.code === 'APPOINTMENT_STALE'
  );
  assert.equal(db.committed.appointment.doctor_id, doctorId);
  assert.equal(db.committed.audits.length, 0);
  assert.equal(db.committed.events.length, 0);
});

test('missing and cross-clinic appointments use scoped domain errors', async () => {
  for (const scenario of ['missing', 'scope']) {
    const db = createTransactionalDb();
    if (scenario === 'missing') db.committed.appointment = null;
    const repository = new AppointmentRepository(db);
    await assert.rejects(
      repository.applyAtomicChange({
        clinicId: scenario === 'scope'
          ? '99999999-9999-4999-8999-999999999999'
          : clinicId,
        appointmentId,
        operation: 'modify',
        patch: { doctor_id: replacementDoctorId },
        actor: { source: 'system' },
      }),
      (error) => error.code === (
        scenario === 'missing'
          ? 'APPOINTMENT_NOT_FOUND'
          : 'APPOINTMENT_CLINIC_SCOPE_VIOLATION'
      )
    );
    assert.equal(db.committed.audits.length, 0);
    assert.equal(db.committed.events.length, 0);
  }
});

test('stale expected updatedAt rejects before mutation', async () => {
  const db = createTransactionalDb();
  const repository = new AppointmentRepository(db);
  await assert.rejects(
    repository.applyAtomicChange({
      clinicId,
      appointmentId,
      expectedUpdatedAt: '2026-08-11T07:00:00.000Z',
      operation: 'modify',
      patch: { doctor_id: replacementDoctorId },
      actor: { source: 'system' },
    }),
    (error) => error.code === 'APPOINTMENT_STALE'
  );
  assert.equal(db.committed.appointment.doctor_id, doctorId);
});

test('slot exclusion conflict maps safely and preserves original appointment', async () => {
  const db = createTransactionalDb({ slotConflict: true });
  const repository = new AppointmentRepository(db);
  await assert.rejects(
    repository.applyAtomicChange({
      clinicId,
      appointmentId,
      operation: 'reschedule',
      patch: {
        appointment_start: '2026-08-16T16:00:00.000Z',
        appointment_end: '2026-08-16T16:30:00.000Z',
      },
      actor: { source: 'system' },
    }),
    (error) => error.code === 'APPOINTMENT_SLOT_NO_LONGER_AVAILABLE'
  );
  assert.equal(
    db.committed.appointment.appointment_start,
    '2026-08-15T14:00:00.000Z'
  );
});

test('maps only known appointment exclusion constraints to slot conflicts', () => {
  for (const constraint of [
    'excl_appointments_doctor_overlap',
    'excl_appointments_room_overlap',
    'excl_appointments_patient_overlap',
  ]) {
    const mapped = mapPostgresError({ code: '23P01', constraint });
    assert.equal(mapped.code, 'APPOINTMENT_SLOT_NO_LONGER_AVAILABLE');
  }

  assert.equal(mapPostgresError({
    code: '23P01',
    constraint: 'excl_prices_active_period_overlap',
  }), null);
});

test('preserves an existing non-appointment PostgreSQL mapping', () => {
  const mapped = mapPostgresError({
    code: '23505',
    constraint: 'rooms_branch_id_room_number_key',
  });
  assert.equal(mapped.code, 'ROOM_NUMBER_DUPLICATE_IN_BRANCH');
});

test('derives multi-change audit types from locked before and updated after', async () => {
  const db = createTransactionalDb();
  const repository = new AppointmentRepository(db);
  await repository.applyAtomicChange({
    clinicId,
    appointmentId,
    operation: 'modify',
    patch: {
      doctor_id: replacementDoctorId,
      appointment_start: '2026-08-16T16:00:00.000Z',
      appointment_end: '2026-08-16T16:30:00.000Z',
    },
    actor: { source: 'api' },
  });
  assert.deepEqual(db.committed.audits[0].changeTypes, ['time', 'provider']);
  assert.deepEqual(db.committed.events[0].payload.changeTypes, ['time', 'provider']);
});

test('migration defines minimal non-destructive change audit infrastructure', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '../../database/migrations/020_appointment_change_logs.sql'
  ), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS geniusbot\.appointment_change_logs/);
  assert.match(migration, /before_state jsonb NOT NULL/);
  assert.match(migration, /after_state jsonb NOT NULL/);
  assert.match(migration, /appointment_id, created_at DESC/);
  assert.match(migration, /clinic_id, created_at DESC/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test('cancellation reason migration is nullable and does not rewrite notes', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '../../database/migrations/021_appointment_cancellation_reason.sql'
  ), 'utf8');
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS cancellation_reason text NULL/
  );
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS chk_appointments_cancellation_reason/
  );
  assert.doesNotMatch(migration, /UPDATE|DELETE FROM|TRUNCATE/i);
  assert.doesNotMatch(migration, /SET\s+notes|cancellation_reason\s*=\s*notes/i);
});
