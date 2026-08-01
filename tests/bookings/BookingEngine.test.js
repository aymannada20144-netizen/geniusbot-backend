'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const BookingEngine = require(
  '../../src/modules/bookings/BookingEngine'
);
const BookingResult = require(
  '../../src/contracts/shaden/BookingResult'
);

describe('BookingEngine', () => {
  test('validates constructor dependencies safely', () => {
    const service = { bookAppointment: async () => ({ success: false }) };
    assert.doesNotThrow(() => new BookingEngine({ bookingService: service }));
    assert.throws(
      () => new BookingEngine({
        bookingService: service,
        unknown: true,
      }),
      /BookingEngine received unsupported dependency: unknown/
    );
    assert.throws(
      () => new BookingEngine({ bookingService: {} }),
      /BookingEngine requires bookingService\.bookAppointment\(\)/
    );

    let getterCalls = 0;
    const dependencies = {};
    Object.defineProperty(dependencies, 'bookingService', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return service;
      },
    });
    assert.throws(
      () => new BookingEngine(dependencies),
      /BookingEngine does not accept accessor dependency: bookingService/
    );
    assert.equal(getterCalls, 0);
  });

  test('rejects commands that are not plain objects', async () => {
    const { engine } = harness();
    for (const input of [null, [], new Date(), 'booking']) {
      await assert.rejects(
        () => engine.execute(input),
        /BookingEngine command must be a plain object/
      );
    }
  });

  test('rejects unknown command fields and command accessors safely', async () => {
    const { engine } = harness();
    await assert.rejects(
      () => engine.execute({ ...completeCommand(), state: {} }),
      /BookingEngine received unsupported command field: state/
    );

    let getterCalls = 0;
    const command = {};
    Object.defineProperty(command, 'clinicId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'clinic-1';
      },
    });
    await assert.rejects(
      () => engine.execute(command),
      /BookingEngine does not accept accessor property: command\.clinicId/
    );
    assert.equal(getterCalls, 0);
  });

  test('enforces nested allowlists and rejects nested accessors', async () => {
    const { engine } = harness();
    const schemas = [
      ['service', 'id'],
      ['branch', 'id'],
      ['doctor', 'id'],
      ['availability', 'preferredStart'],
      ['patient', 'id'],
      ['appointment', 'paymentMethodId'],
    ];

    for (const [field, allowedField] of schemas) {
      const unknown = completeCommand();
      unknown[field] = { unsupported: true };
      await assert.rejects(
        () => engine.execute(unknown),
        new RegExp(`unsupported ${field} field: unsupported`)
      );

      let getterCalls = 0;
      const nested = {};
      Object.defineProperty(nested, allowedField, {
        enumerable: true,
        get() {
          getterCalls += 1;
          return 'unsafe';
        },
      });
      const accessor = completeCommand();
      accessor[field] = nested;
      await assert.rejects(
        () => engine.execute(accessor),
        new RegExp(`accessor property: ${field}\\.${allowedField}`)
      );
      assert.equal(getterCalls, 0);
    }

    await assert.rejects(
      () => engine.execute({
        ...completeCommand(),
        patient: {
          id: 'patient-1',
          phoneNumber: '+966500000001',
          fullName: 'Customer',
        },
      }),
      /patient\.id cannot be combined/
    );
  });

  for (const missingCase of [
    {
      name: 'missing_clinic',
      patch: { clinicId: null },
    },
    {
      name: 'missing_service',
      patch: { service: null },
    },
    {
      name: 'missing_branch',
      patch: { branch: null },
    },
    {
      name: 'missing_availability',
      patch: { availability: null },
    },
    {
      name: 'missing_patient',
      patch: { patient: null },
    },
    {
      name: 'missing_payment_method',
      patch: {
        appointment: { confirmed: true },
      },
    },
    {
      name: 'confirmation_required',
      patch: {
        appointment: {
          paymentMethodId: 'payment-1',
          confirmed: false,
        },
      },
    },
  ]) {
    test(`returns ${missingCase.name} without invoking bookingService`, async () => {
      const { engine, calls } = harness();
      const result = await engine.execute({
        ...completeCommand(),
        ...missingCase.patch,
      });
      assert.equal(result instanceof BookingResult, true);
      assert.equal(result.type, missingCase.name);
      assert.equal(result.status, 'requires_input');
      assert.equal(calls.length, 0);
    });
  }

  test('maps an existing patient to patient_id', async () => {
    const { engine, calls } = successfulHarness();
    await engine.execute(completeCommand());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].patient_id, 'patient-1');
    assert.equal('phone_number' in calls[0], false);
    assert.equal('full_name' in calls[0], false);
  });

  test('maps new patient data to phone_number and full_name', async () => {
    const { engine, calls } = successfulHarness();
    await engine.execute({
      ...completeCommand(),
      patient: {
        phoneNumber: '+966500000001',
        fullName: 'Customer Name',
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].phone_number, '+966500000001');
    assert.equal(calls[0].full_name, 'Customer Name');
    assert.equal('patient_id' in calls[0], false);
  });

  test('maps doctor.id to doctor_id', async () => {
    const { engine, calls } = successfulHarness();
    await engine.execute(completeCommand());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].doctor_id, 'doctor-1');
  });

  test('maps a successful service result to BookingResult', async () => {
    const serviceResult = successfulServiceResult();
    const { engine } = harness(async () => serviceResult);
    const result = await engine.execute(completeCommand());

    assert.equal(result instanceof BookingResult, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.type, 'booking_created');
    assert.equal(result.appointment.id, 100);
    assert.deepEqual(result.references, ['25DD4527']);
  });

  test('maps an unavailable result to unavailable status', async () => {
    const { engine } = harness(async () => ({
      success: false,
      reason: 'unavailable',
    }));
    const result = await engine.execute(completeCommand());
    assert.equal(result instanceof BookingResult, true);
    assert.equal(result.status, 'unavailable');
  });

  test('maps a rejected result to rejected status', async () => {
    const { engine } = harness(async () => ({
      success: false,
      reason: 'validation_failed',
    }));
    const result = await engine.execute(completeCommand());
    assert.equal(result instanceof BookingResult, true);
    assert.equal(result.status, 'rejected');
  });

  test('propagates infrastructure errors unchanged', async () => {
    const infrastructureError = new Error('Infrastructure failure');
    const { engine } = harness(async () => {
      throw infrastructureError;
    });
    await assert.rejects(
      () => engine.execute(completeCommand()),
      (error) => error === infrastructureError
    );
  });

  test('does not mutate command, nested objects, or service result', async () => {
    const command = completeCommand();
    const serviceResult = successfulServiceResult();
    const commandBefore = structuredClone(command);
    const serviceResultBefore = structuredClone(serviceResult);
    const { engine } = harness(async () => serviceResult);

    await engine.execute(command);

    assert.deepEqual(command, commandBefore);
    assert.deepEqual(serviceResult, serviceResultBefore);
    for (const value of Object.values(command)) {
      if (value && typeof value === 'object') {
        assert.equal(Object.isFrozen(value), false);
      }
    }
    assert.equal(Object.isFrozen(serviceResult), false);
    assert.equal(Object.isFrozen(serviceResult.appointment), false);
  });

  test('invokes bookAppointment exactly once for a complete command', async () => {
    const { engine, calls } = successfulHarness();
    await engine.execute(completeCommand());
    assert.equal(calls.length, 1);
  });

  test('has no dependency on src/services/shaden', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../src/modules/bookings/BookingEngine.js'
      ),
      'utf8'
    );
    assert.doesNotMatch(
      source.replace(/\\/g, '/'),
      /src\/services\/shaden|services\/shaden/
    );
  });
});

function harness(implementation = async () => ({
  success: false,
  reason: 'validation_failed',
})) {
  const calls = [];
  const bookingService = {
    async bookAppointment(input) {
      calls.push(input);
      return implementation(input);
    },
  };
  return {
    calls,
    engine: new BookingEngine({ bookingService }),
  };
}

function successfulHarness() {
  return harness(async () => successfulServiceResult());
}

function completeCommand() {
  return {
    clinicId: 'clinic-1',
    conversationId: 'conversation-1',
    channel: 'whatsapp',
    channelIdentity: '+966500000001',
    service: { id: 'service-1' },
    branch: { id: 'branch-1' },
    doctor: { id: 'doctor-1' },
    availability: {
      preferredStart: '2026-08-01T10:00:00.000Z',
    },
    patient: { id: 'patient-1' },
    appointment: {
      paymentMethodId: 'payment-1',
      confirmed: true,
    },
    metadata: { source: 'test' },
  };
}

function successfulServiceResult() {
  return {
    success: true,
    stage: 'appointment_created',
    clinic: {},
    service: {},
    patient: {},
    availability: {},
    assignment: {
      doctor_id: 17,
    },
    appointment: {
      id: 100,
      booking_reference: '25DD4527',
      status: 'pending',
    },
  };
}

