'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const BookingOrchestrator = require(
  '../../src/services/booking/BookingOrchestrator'
);

const IDS = Object.freeze({
  clinic: '00000000-0000-0000-0000-000000000001',
  service: '00000000-0000-0000-0000-000000000002',
  branch: '00000000-0000-0000-0000-000000000003',
  patient: '00000000-0000-0000-0000-000000000004',
  payment: '00000000-0000-0000-0000-000000000005',
  assignment: '00000000-0000-0000-0000-000000000006',
  doctor: '00000000-0000-0000-0000-000000000007',
  room: '00000000-0000-0000-0000-000000000008',
});

test('booking persists only the authoritative resolved price', async () => {
  let persisted;
  let priceLookup;
  const repositories = {
    clinics: {
      findById: async () => ({
        id: IDS.clinic,
        is_active: true,
        timezone: 'Asia/Riyadh',
      }),
    },
    services: {
      findActiveById: async () => ({
        id: IDS.service,
        is_booking_enabled: true,
        duration_minutes: 30,
        requires_doctor: true,
        requires_room: true,
      }),
    },
    patients: {
      findById: async () => ({
        id: IDS.patient,
        clinic_id: IDS.clinic,
        full_name: 'Test Patient',
        phone_number: '+966500000001',
        is_active: true,
      }),
    },
    serviceAssignments: {
      findAssignments: async () => [{
        id: IDS.assignment,
        doctor_id: IDS.doctor,
        room_id: IDS.room,
      }],
    },
    prices: {
      findResolutionContext: async () => ({
        clinic_id: IDS.clinic,
        clinic_is_active: true,
        clinic_timezone: 'Asia/Riyadh',
        service_id: IDS.service,
        service_clinic_id: IDS.clinic,
        service_is_active: true,
        payment_method_id: IDS.payment,
        payment_method_clinic_id: IDS.clinic,
        payment_method_is_active: true,
        payment_method_code: 'cash',
      }),
      findApplicablePrices: async (input) => {
        priceLookup = input;
        return [{
          id: 'price-1',
          price: '0.00',
          currency: 'SAR',
        }];
      },
    },
    appointments: {
      createAppointment: async (input) => {
        persisted = input;
        return { id: 'appointment-1', ...input };
      },
    },
  };
  const availabilityService = {
    checkAppointmentAvailability: async () => ({ available: true }),
  };

  const result = await new BookingOrchestrator(
    repositories,
    availabilityService
  ).bookAppointment({
    clinic_id: IDS.clinic,
    service_id: IDS.service,
    branch_id: IDS.branch,
    patient_id: IDS.patient,
    payment_method_id: IDS.payment,
    preferred_start: '2026-08-02T08:00:00.000Z',
    quoted_price: '9999.00',
    currency: 'USD',
    confirmed: true,
  });

  assert.equal(result.success, true);
  assert.equal(priceLookup.bookingDate, '2026-08-02');
  assert.equal(persisted.quoted_price, '0.00');
  assert.equal(persisted.currency, 'SAR');
  assert.equal(result.price.id, 'price-1');
});
