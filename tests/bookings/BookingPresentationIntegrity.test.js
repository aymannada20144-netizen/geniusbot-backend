'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const BookingEngine = require('../../src/modules/bookings/BookingEngine');
const AppointmentRepository = require('../../src/modules/appointments/AppointmentRepository');

const IDS = {
  clinic: '00000000-0000-4000-8000-000000000001',
  service: '00000000-0000-4000-8000-000000000002',
  branch: '00000000-0000-4000-8000-000000000003',
  patient: '00000000-0000-4000-8000-000000000004',
  payment: '00000000-0000-4000-8000-000000000005',
  company: '00000000-0000-4000-8000-000000000006',
  insuranceClass: '00000000-0000-4000-8000-000000000007',
  appointment: '00000000-0000-4000-8000-000000000008',
};

describe('persisted booking presentation integrity', () => {
  test('BookingEngine passes verified insurance identifiers into the persisted booking input', async () => {
    let persisted;
    const engine = new BookingEngine({
      bookingService: {
        async bookAppointment(input) {
          persisted = input;
          return {
            success: true,
            appointment: {
              id: IDS.appointment,
              booking_reference: '25DD4527',
              status: 'pending',
              insurance_company_id: IDS.company,
              insurance_class_id: IDS.insuranceClass,
            },
          };
        },
      },
    });
    const result = await engine.execute({
      clinicId: IDS.clinic,
      conversationId: null,
      channel: 'whatsapp',
      channelIdentity: '+966500000001',
      service: { id: IDS.service },
      branch: { id: IDS.branch },
      doctor: null,
      availability: { preferredStart: '2026-08-05T08:00:00.000Z' },
      patient: { id: IDS.patient },
      appointment: { paymentMethodId: IDS.payment, confirmed: true },
      metadata: { insuranceCompanyId: IDS.company, insuranceClassId: IDS.insuranceClass },
    });
    assert.equal(persisted.insurance_company_id, IDS.company);
    assert.equal(persisted.insurance_class_id, IDS.insuranceClass);
    assert.equal(result.appointment.status, 'pending');
    assert.deepEqual(result.references, ['25DD4527']);
  });

  test('appointment presentation query returns official reference and persisted insurance names', async () => {
    let query;
    const repository = new AppointmentRepository({
      async query(sql, parameters) {
        query = { sql, parameters };
        return { rows: [{ booking_reference: '25DD4527', insurance_company_name: 'بوبا', insurance_class_name: 'A' }] };
      },
    });
    const row = await repository.findPresentationById(IDS.clinic, IDS.appointment);
    assert.equal(row.booking_reference, '25DD4527');
    assert.equal(row.insurance_company_name, 'بوبا');
    assert.equal(row.insurance_class_name, 'A');
    assert.match(query.sql, /insurance_companies/u);
    assert.match(query.sql, /insurance_classes/u);
    assert.deepEqual(query.parameters, [IDS.clinic, IDS.appointment]);
  });

  test('migration creates a persisted public reference independent from the internal UUID', () => {
    const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/015_appointment_booking_reference.sql'), 'utf8');
    assert.match(migration, /ADD COLUMN IF NOT EXISTS booking_reference varchar\(8\)/u);
    assert.match(migration, /SET DEFAULT geniusbot\.generate_appointment_booking_reference\(\)/u);
    assert.match(migration, /SET NOT NULL/u);
    assert.match(migration, /UNIQUE INDEX/u);
    assert.doesNotMatch(migration, /substring\s*\(\s*id|substr\s*\(\s*id/iu);
  });
});

