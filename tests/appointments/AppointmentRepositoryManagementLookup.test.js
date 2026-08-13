'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const AppointmentRepository = require(
  '../../src/modules/appointments/AppointmentRepository'
);

const IDS = {
  clinic: '00000000-0000-4000-8000-000000000001',
  otherClinic: '00000000-0000-4000-8000-000000000002',
  patient: '00000000-0000-4000-8000-000000000003',
  otherPatient: '00000000-0000-4000-8000-000000000004',
};

describe('AppointmentRepository management lookups', () => {
  test('finds a booking reference only within the requested clinic', async () => {
    let captured;
    const expected = {
      id: 'appointment-1',
      clinic_id: IDS.clinic,
      booking_reference: '25DD4527',
    };
    const repository = new AppointmentRepository({
      async query(sql, parameters) {
        captured = { sql, parameters };
        return { rows: [expected] };
      },
    });

    const result = await repository.findByBookingReference(
      IDS.clinic,
      '25DD4527'
    );

    assert.equal(result, expected);
    assert.match(captured.sql, /a\."clinic_id" = \$1/u);
    assert.match(captured.sql, /a\."booking_reference" = \$2/u);
    assert.deepEqual(captured.parameters, [IDS.clinic, '25DD4527']);
  });

  test('does not return a booking reference from another clinic', async () => {
    const rows = [{
      id: 'appointment-1',
      clinic_id: IDS.clinic,
      booking_reference: '25DD4527',
    }];
    const repository = new AppointmentRepository({
      async query(sql, parameters) {
        assert.match(sql, /a\."clinic_id" = \$1/u);
        return {
          rows: rows.filter((row) =>
            row.clinic_id === parameters[0] &&
            row.booking_reference === parameters[1]
          ),
        };
      },
    });

    const result = await repository.findByBookingReference(
      IDS.otherClinic,
      '25DD4527'
    );

    assert.equal(result, null);
  });

  test('returns all lifecycle-eligible management appointments for the same patient', async () => {
    let captured;
    const expected = [
      { id: 'appointment-1', patient_id: IDS.patient },
      { id: 'appointment-2', patient_id: IDS.patient },
    ];
    const repository = new AppointmentRepository({
      async query(sql, parameters) {
        captured = { sql, parameters };
        return { rows: expected };
      },
    });

    const result = await repository.findFutureForManagementByPatient(
      IDS.clinic,
      IDS.patient
    );

    assert.deepEqual(result, expected);
    assert.match(captured.sql, /a\."clinic_id" = \$1/u);
    assert.match(captured.sql, /a\."patient_id" = \$2/u);
    assert.doesNotMatch(
      captured.sql,
      /a\."appointment_(?:start|end)"\s*[<>]=?\s*NOW\(\)/u
    );
    assert.match(
      captured.sql,
      /a\."status" IN \('pending', 'confirmed', 'checked_in'\)/u
    );
    assert.doesNotMatch(captured.sql, /LIMIT\s+1/iu);
    assert.deepEqual(captured.parameters, [IDS.clinic, IDS.patient]);
  });

  test('patient-scoped lookup does not return another patient appointments', async () => {
    const rows = [
      { id: 'appointment-1', clinic_id: IDS.clinic, patient_id: IDS.patient },
      {
        id: 'appointment-2',
        clinic_id: IDS.clinic,
        patient_id: IDS.otherPatient,
      },
      {
        id: 'appointment-3',
        clinic_id: IDS.otherClinic,
        patient_id: IDS.patient,
      },
    ];
    const repository = new AppointmentRepository({
      async query(sql, parameters) {
        assert.match(sql, /a\."clinic_id" = \$1/u);
        assert.match(sql, /a\."patient_id" = \$2/u);
        return {
          rows: rows.filter((row) =>
            row.clinic_id === parameters[0] && row.patient_id === parameters[1]
          ),
        };
      },
    });

    const result = await repository.findFutureForManagementByPatient(
      IDS.clinic,
      IDS.patient
    );

    assert.deepEqual(result, [rows[0]]);
  });

  test('management eligibility has no temporal boundary and follows status scope', async () => {
    const now = new Date('2026-08-12T08:13:00.000Z');
    const rows = [
      appointment('future-confirmed', 'confirmed', '2026-08-19T08:00:00.000Z'),
      appointment('ongoing-confirmed', 'confirmed', '2026-08-12T08:00:00.000Z'),
      appointment('past-confirmed', 'confirmed', '2026-08-01T08:00:00.000Z'),
      appointment('checked-in', 'checked_in', '2026-08-12T07:00:00.000Z'),
      appointment('pending', 'pending', '2026-08-13T08:00:00.000Z'),
      appointment('cancelled', 'cancelled', '2026-08-19T08:00:00.000Z'),
      appointment('completed', 'completed', '2026-08-01T08:00:00.000Z'),
      appointment('no-show', 'no_show', '2026-08-01T08:00:00.000Z'),
      appointment('wrong-patient', 'confirmed', '2026-08-19T08:00:00.000Z', {
        patient_id: IDS.otherPatient,
      }),
      appointment('wrong-clinic', 'confirmed', '2026-08-19T08:00:00.000Z', {
        clinic_id: IDS.otherClinic,
      }),
    ];
    const repository = new AppointmentRepository(
      managementQueryDatabase(rows, now)
    );

    const result = await repository.findFutureForManagementByPatient(
      IDS.clinic,
      IDS.patient
    );

    assert.deepEqual(result.map(({ id }) => id), [
      'past-confirmed',
      'checked-in',
      'ongoing-confirmed',
      'pending',
      'future-confirmed',
    ]);
  });
});

function appointment(id, status, appointmentStart, overrides = {}) {
  return {
    id,
    clinic_id: IDS.clinic,
    patient_id: IDS.patient,
    status,
    appointment_start: appointmentStart,
    appointment_end: new Date(
      new Date(appointmentStart).getTime() + 20 * 60 * 1000
    ).toISOString(),
    ...overrides,
  };
}

function managementQueryDatabase(rows, now) {
  return {
    async query(sql, [clinicId, patientId]) {
      const eligibleStatuses = ['pending', 'confirmed', 'checked_in'];
      let selected = rows.filter((row) =>
        row.clinic_id === clinicId &&
        row.patient_id === patientId &&
        eligibleStatuses.includes(row.status)
      );
      if (/appointment_start"\s*>=\s*NOW\(\)/u.test(sql)) {
        selected = selected.filter((row) =>
          new Date(row.appointment_start) >= now
        );
      }
      if (/appointment_end"\s*>\s*NOW\(\)/u.test(sql)) {
        selected = selected.filter((row) =>
          new Date(row.appointment_end) > now
        );
      }
      return {
        rows: selected.sort((left, right) =>
          new Date(left.appointment_start) - new Date(right.appointment_start)
        ),
      };
    },
  };
}
