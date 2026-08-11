'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);

const clinicId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function appointment(status = 'confirmed') {
  return {
    id: appointmentId,
    clinic_id: clinicId,
    status,
    notes: 'Patient requested morning appointment',
    cancellation_reason: null,
    updated_at: '2026-08-11T08:00:00.000Z',
  };
}

test('cancel uses the atomic foundation and cleans pending notifications', async () => {
  const calls = [];
  const repository = {
    findByIdAndClinic: async () => appointment(),
    applyAtomicChange: async (input) => {
      calls.push(input);
      return { appointment: appointment('cancelled') };
    },
  };
  let cleanups = 0;
  const service = new AppointmentService(repository, null, {
    cancelAppointmentNotifications: async () => { cleanups += 1; },
  });

  const result = await service.cancelAppointment(
    clinicId,
    appointmentId,
    ' Patient request ',
    actorId
  );

  assert.deepEqual(result, {
    id: appointmentId,
    status: 'cancelled',
    communication: {
      attempted: false,
      success: false,
      status: 'not_required',
    },
  });
  assert.equal(cleanups, 1);
  assert.equal(calls[0].operation, 'cancel');
  assert.equal(calls[0].expectedStatus, 'confirmed');
  assert.equal(calls[0].expectedUpdatedAt, '2026-08-11T08:00:00.000Z');
  assert.deepEqual(calls[0].patch, {
    status: 'cancelled',
    cancellation_reason: 'Patient request',
  });
  assert.equal(calls[0].reason, 'Patient request');
});

test('generic cancelled status delegates to the AM-02 cancellation path', async () => {
  const calls = [];
  let legacyWrites = 0;
  let cleanups = 0;
  const existing = appointment();
  const service = new AppointmentService({
    findByIdAndClinic: async () => existing,
    updateStatus: async () => {
      legacyWrites += 1;
      throw new Error('legacy updateStatus must not be called');
    },
    applyAtomicChange: async (input) => {
      calls.push(input);
      return { appointment: { ...existing, ...input.patch } };
    },
  }, null, {
    cancelAppointmentNotifications: async () => { cleanups += 1; },
  });

  const result = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'cancelled',
    ' Travel ',
    false,
    actorId
  );

  assert.equal(result.status, 'cancelled');
  assert.equal(legacyWrites, 0);
  assert.equal(cleanups, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'cancel');
  assert.equal(calls[0].reason, 'Travel');
  assert.deepEqual(calls[0].patch, {
    status: 'cancelled',
    cancellation_reason: 'Travel',
  });
  assert.equal(Object.hasOwn(calls[0].patch, 'notes'), false);
  assert.equal(existing.notes, 'Patient requested morning appointment');
});

test('dashboard-equivalent generic cancellation preserves notes with null reason', async () => {
  let patch;
  let cleanups = 0;
  const existing = appointment();
  const service = new AppointmentService({
    findByIdAndClinic: async () => existing,
    updateStatus: async () => {
      throw new Error('legacy updateStatus must not be called');
    },
    applyAtomicChange: async (input) => {
      patch = input.patch;
      return { appointment: { ...existing, ...patch } };
    },
  }, null, {
    cancelAppointmentNotifications: async () => { cleanups += 1; },
  });

  await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'cancelled',
    null,
    false,
    actorId
  );

  assert.deepEqual(patch, {
    status: 'cancelled',
    cancellation_reason: null,
  });
  assert.equal(existing.notes, 'Patient requested morning appointment');
  assert.equal(cleanups, 1);
});

test('repeated generic cancellation is idempotent without duplicate writes', async () => {
  let atomicWrites = 0;
  let legacyWrites = 0;
  let cleanups = 0;
  const existing = {
    ...appointment('cancelled'),
    cancellation_reason: 'Travel',
  };
  const service = new AppointmentService({
    findByIdAndClinic: async () => existing,
    updateStatus: async () => { legacyWrites += 1; },
    applyAtomicChange: async () => { atomicWrites += 1; },
  }, null, {
    cancelAppointmentNotifications: async () => { cleanups += 1; },
  });

  const result = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'cancelled',
    'Replacement reason',
    false,
    actorId
  );

  assert.equal(result.status, 'cancelled');
  assert.equal(atomicWrites, 0);
  assert.equal(legacyWrites, 0);
  assert.equal(cleanups, 0);
  assert.equal(existing.cancellation_reason, 'Travel');
  assert.equal(existing.notes, 'Patient requested morning appointment');
});

test('generic non-cancel status retains the legacy updateStatus path', async () => {
  const calls = [];
  const service = new AppointmentService({
    findByIdAndClinic: async () => appointment('pending'),
    updateStatus: async (...args) => {
      calls.push(args);
      return appointment('confirmed');
    },
    findPresentationById: async () => null,
  });

  const result = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'confirmed',
    null,
    false,
    actorId
  );

  assert.equal(result.status, 'confirmed');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    clinicId,
    appointmentId,
    'confirmed',
    'pending',
    null,
    false,
    actorId,
    null,
  ]);
});

test('cancel without a reason remains API-compatible', async () => {
  let patch;
  const service = new AppointmentService({
    findByIdAndClinic: async () => appointment('pending'),
    applyAtomicChange: async (input) => {
      patch = input.patch;
      return { appointment: appointment('cancelled') };
    },
  });
  await service.cancelAppointment(clinicId, appointmentId);
  assert.deepEqual(patch, {
    status: 'cancelled',
    cancellation_reason: null,
  });
});

test('cancel with a reason preserves existing appointment notes', async () => {
  let patch;
  const existing = appointment();
  const service = new AppointmentService({
    findByIdAndClinic: async () => existing,
    applyAtomicChange: async (input) => {
      patch = input.patch;
      return { appointment: { ...existing, ...patch } };
    },
  });

  await service.cancelAppointment(clinicId, appointmentId, 'Travel');

  assert.equal(patch.cancellation_reason, 'Travel');
  assert.equal(Object.hasOwn(patch, 'notes'), false);
  assert.equal(existing.notes, 'Patient requested morning appointment');
});

test('cancel without a reason preserves existing appointment notes', async () => {
  let patch;
  const existing = appointment();
  const service = new AppointmentService({
    findByIdAndClinic: async () => existing,
    applyAtomicChange: async (input) => {
      patch = input.patch;
      return { appointment: { ...existing, ...patch } };
    },
  });

  await service.cancelAppointment(clinicId, appointmentId, '   ');

  assert.equal(patch.cancellation_reason, null);
  assert.equal(Object.hasOwn(patch, 'notes'), false);
  assert.equal(existing.notes, 'Patient requested morning appointment');
});

test('repeated cancellation is idempotent with no writes or cleanup', async () => {
  let writes = 0;
  let cleanups = 0;
  const existing = {
    ...appointment('cancelled'),
    cancellation_reason: 'Travel',
  };
  const service = new AppointmentService({
    findByIdAndClinic: async () => existing,
    applyAtomicChange: async () => { writes += 1; },
  }, null, {
    cancelAppointmentNotifications: async () => { cleanups += 1; },
  });
  const result = await service.cancelAppointment(clinicId, appointmentId);
  assert.equal(result.status, 'cancelled');
  assert.equal(writes, 0);
  assert.equal(cleanups, 0);
  assert.equal(existing.notes, 'Patient requested morning appointment');
  assert.equal(existing.cancellation_reason, 'Travel');
});

test('completed appointment retains lifecycle rejection semantics', async () => {
  const service = new AppointmentService({
    findByIdAndClinic: async () => appointment('completed'),
  });
  await assert.rejects(
    service.cancelAppointment(clinicId, appointmentId),
    /transition is not allowed/
  );
});

test('notification cleanup failure does not roll back committed cancellation', async (t) => {
  t.mock.method(console, 'error', () => {});
  let committed = false;
  const service = new AppointmentService({
    findByIdAndClinic: async () => appointment(),
    applyAtomicChange: async () => {
      committed = true;
      return { appointment: appointment('cancelled') };
    },
  }, null, {
    cancelAppointmentNotifications: async () => {
      throw new Error('cleanup unavailable');
    },
  });
  const result = await service.cancelAppointment(clinicId, appointmentId);
  assert.equal(committed, true);
  assert.equal(result.status, 'cancelled');
});

test('concurrent cancellation resolves stale state as idempotent success', async () => {
  let reads = 0;
  const service = new AppointmentService({
    findByIdAndClinic: async () => {
      reads += 1;
      return reads === 1 ? appointment() : appointment('cancelled');
    },
    applyAtomicChange: async () => {
      const error = new Error('stale');
      error.code = 'APPOINTMENT_STALE';
      throw error;
    },
  });
  const result = await service.cancelAppointment(clinicId, appointmentId);
  assert.equal(result.status, 'cancelled');
  assert.equal(reads, 2);
});
