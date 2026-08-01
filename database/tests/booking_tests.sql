/*
===============================================================================
File: database/tests/booking_tests.sql
Project: GeniusBot Backend
Schema: geniusbot
Purpose: Booking database integration tests
Version: 2.0

Execution:
    psql -v ON_ERROR_STOP=1 -f database/tests/booking_tests.sql

Notes:
    - All test records are created inside one transaction.
    - The transaction is rolled back at the end.
    - No permanent data is inserted.
===============================================================================
*/

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- ============================================================================
-- Test Helper
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
    condition boolean,
    failure_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF condition IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'BOOKING TEST FAILED: %', failure_message;
    END IF;
END;
$$;

-- ============================================================================
-- Fixed Test Identifiers
-- ============================================================================

-- Clinic
-- 90000000-0000-0000-0000-000000000001

-- Branch
-- 90000000-0000-0000-0000-000000000101

-- Service
-- 90000000-0000-0000-0000-000000000201

-- Doctor
-- 90000000-0000-0000-0000-000000000301

-- Room
-- 90000000-0000-0000-0000-000000000401

-- Patient 1
-- 90000000-0000-0000-0000-000000000501

-- Patient 2
-- 90000000-0000-0000-0000-000000000502

-- Service Assignment
-- 90000000-0000-0000-0000-000000000601

-- Appointment 1
-- 90000000-0000-0000-0000-000000000701

-- Appointment 2
-- 90000000-0000-0000-0000-000000000702

-- Payment Method
-- 90000000-0000-0000-0000-000000000801

-- ============================================================================
-- 1. Create Test Clinic
-- ============================================================================

INSERT INTO geniusbot.clinics (
    id,
    name,
    whatsapp_number,
    phone,
    timezone,
    default_language,
    is_active
)
VALUES (
    '90000000-0000-0000-0000-000000000001',
    'GeniusBot Booking Test Clinic',
    '+966500000901',
    '+966500000902',
    'Asia/Riyadh',
    'ar',
    true
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.clinics
        WHERE id = '90000000-0000-0000-0000-000000000001'
          AND is_active = true
    ),
    'Test clinic was not created.'
);

-- ============================================================================
-- 2. Create Test Branch
-- ============================================================================

INSERT INTO geniusbot.branches (
    id,
    clinic_id,
    name,
    city,
    address,
    timezone,
    is_active
)
VALUES (
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000001',
    'Booking Test Branch',
    'Riyadh',
    'Riyadh',
    'Asia/Riyadh',
    true
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.branches
        WHERE id = '90000000-0000-0000-0000-000000000101'
          AND clinic_id = '90000000-0000-0000-0000-000000000001'
    ),
    'Test branch was not created or is linked to the wrong clinic.'
);

-- ============================================================================
-- 3. Create Branch Working Hours
-- ============================================================================

INSERT INTO geniusbot.branch_working_hours (
    branch_id,
    day_of_week,
    opens_at,
    closes_at,
    is_closed
)
VALUES
    (
        '90000000-0000-0000-0000-000000000101',
        0,
        '09:00',
        '21:00',
        false
    ),
    (
        '90000000-0000-0000-0000-000000000101',
        1,
        '09:00',
        '21:00',
        false
    ),
    (
        '90000000-0000-0000-0000-000000000101',
        2,
        '09:00',
        '21:00',
        false
    ),
    (
        '90000000-0000-0000-0000-000000000101',
        3,
        '09:00',
        '21:00',
        false
    ),
    (
        '90000000-0000-0000-0000-000000000101',
        4,
        '09:00',
        '21:00',
        false
    ),
    (
        '90000000-0000-0000-0000-000000000101',
        5,
        NULL,
        NULL,
        true
    ),
    (
        '90000000-0000-0000-0000-000000000101',
        6,
        '09:00',
        '21:00',
        false
    );

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.branch_working_hours
        WHERE branch_id = '90000000-0000-0000-0000-000000000101'
    ) = 7,
    'The test branch does not have seven working-hour records.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.branch_working_hours
        WHERE branch_id = '90000000-0000-0000-0000-000000000101'
          AND day_of_week = 5
          AND is_closed = true
          AND opens_at IS NULL
          AND closes_at IS NULL
    ),
    'Friday closure was not stored correctly.'
);

-- ============================================================================
-- 4. Create Test Service
-- ============================================================================

INSERT INTO geniusbot.services (
    id,
    clinic_id,
    name,
    description,
    duration_minutes,
    requires_doctor,
    requires_room,
    is_booking_enabled,
    is_active,
    display_order
)
VALUES (
    '90000000-0000-0000-0000-000000000201',
    '90000000-0000-0000-0000-000000000001',
    'Booking Test Consultation',
    'Service used by database booking tests.',
    30,
    true,
    true,
    true,
    true,
    1
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.services
        WHERE id = '90000000-0000-0000-0000-000000000201'
          AND duration_minutes = 30
          AND requires_doctor = true
          AND requires_room = true
          AND is_booking_enabled = true
    ),
    'Test service was not created correctly.'
);

-- ============================================================================
-- 5. Create Test Doctor
-- ============================================================================

INSERT INTO geniusbot.doctors (
    id,
    clinic_id,
    full_name,
    title,
    gender,
    is_active
)
VALUES (
    '90000000-0000-0000-0000-000000000301',
    '90000000-0000-0000-0000-000000000001',
    'Dr. Booking Test',
    'د.',
    'female',
    true
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.doctors
        WHERE id = '90000000-0000-0000-0000-000000000301'
          AND clinic_id = '90000000-0000-0000-0000-000000000001'
          AND is_active = true
    ),
    'Test doctor was not created correctly.'
);

-- ============================================================================
-- 6. Create Doctor Working Hours
-- ============================================================================

INSERT INTO geniusbot.doctor_working_hours (
    doctor_id,
    branch_id,
    day_of_week,
    start_time,
    end_time,
    is_active
)
VALUES
    (
        '90000000-0000-0000-0000-000000000301',
        '90000000-0000-0000-0000-000000000101',
        0,
        '10:00',
        '18:00',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000301',
        '90000000-0000-0000-0000-000000000101',
        1,
        '10:00',
        '18:00',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000301',
        '90000000-0000-0000-0000-000000000101',
        2,
        '10:00',
        '18:00',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000301',
        '90000000-0000-0000-0000-000000000101',
        3,
        '10:00',
        '18:00',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000301',
        '90000000-0000-0000-0000-000000000101',
        4,
        '10:00',
        '18:00',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000301',
        '90000000-0000-0000-0000-000000000101',
        6,
        '10:00',
        '18:00',
        true
    );

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.doctor_working_hours
        WHERE doctor_id = '90000000-0000-0000-0000-000000000301'
          AND is_active = true
    ) = 6,
    'Doctor working hours were not inserted correctly.'
);

-- ============================================================================
-- 7. Create Test Room
-- ============================================================================

INSERT INTO geniusbot.rooms (
    id,
    branch_id,
    room_number,
    room_name,
    room_type,
    is_active
)
VALUES (
    '90000000-0000-0000-0000-000000000401',
    '90000000-0000-0000-0000-000000000101',
    'TEST-01',
    'Booking Test Room',
    'consultation',
    true
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.rooms
        WHERE id = '90000000-0000-0000-0000-000000000401'
          AND branch_id = '90000000-0000-0000-0000-000000000101'
          AND is_active = true
    ),
    'Test room was not created correctly.'
);

-- ============================================================================
-- 8. Create Test Patients
-- ============================================================================

INSERT INTO geniusbot.patients (
    id,
    clinic_id,
    full_name,
    phone_number,
    source,
    is_active
)
VALUES
    (
        '90000000-0000-0000-0000-000000000501',
        '90000000-0000-0000-0000-000000000001',
        'Booking Test Patient One',
        '+966500000911',
        'whatsapp_direct',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000502',
        '90000000-0000-0000-0000-000000000001',
        'Booking Test Patient Two',
        '+966500000912',
        'google',
        true
    );

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.patients
        WHERE clinic_id = '90000000-0000-0000-0000-000000000001'
          AND id IN (
              '90000000-0000-0000-0000-000000000501',
              '90000000-0000-0000-0000-000000000502'
          )
    ) = 2,
    'Test patients were not created correctly.'
);

-- ============================================================================
-- 9. Duplicate Patient Phone Must Be Rejected
-- ============================================================================

DO $$
DECLARE
    duplicate_rejected boolean := false;
BEGIN
    BEGIN
        INSERT INTO geniusbot.patients (
            clinic_id,
            full_name,
            phone_number,
            source
        )
        VALUES (
            '90000000-0000-0000-0000-000000000001',
            'Duplicate Booking Test Patient',
            '+966500000911',
            'unknown'
        );
    EXCEPTION
        WHEN unique_violation THEN
            duplicate_rejected := true;
    END;

    PERFORM pg_temp.assert_true(
        duplicate_rejected,
        'Duplicate patient phone was not rejected.'
    );
END;
$$;

-- ============================================================================
-- 10. Create Service Assignment
-- ============================================================================

INSERT INTO geniusbot.service_assignments (
    id,
    clinic_id,
    branch_id,
    service_id,
    doctor_id,
    room_id,
    is_default,
    is_active
)
VALUES (
    '90000000-0000-0000-0000-000000000601',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000201',
    '90000000-0000-0000-0000-000000000301',
    '90000000-0000-0000-0000-000000000401',
    true,
    true
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments
        WHERE id = '90000000-0000-0000-0000-000000000601'
          AND clinic_id = '90000000-0000-0000-0000-000000000001'
          AND branch_id = '90000000-0000-0000-0000-000000000101'
          AND service_id = '90000000-0000-0000-0000-000000000201'
          AND doctor_id = '90000000-0000-0000-0000-000000000301'
          AND room_id = '90000000-0000-0000-0000-000000000401'
          AND is_default = true
          AND is_active = true
    ),
    'Service assignment was not created correctly.'
);

-- ============================================================================
-- 11. Create Payment Method
-- ============================================================================

INSERT INTO geniusbot.payment_methods (
    id,
    clinic_id,
    name,
    code,
    is_active
)
VALUES (
    '90000000-0000-0000-0000-000000000801',
    '90000000-0000-0000-0000-000000000001',
    'Cash',
    'cash_test',
    true
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.payment_methods
        WHERE id = '90000000-0000-0000-0000-000000000801'
          AND clinic_id = '90000000-0000-0000-0000-000000000001'
          AND is_active = true
    ),
    'Test payment method was not created.'
);

-- ============================================================================
-- 12. Valid Service Assignment Resolution
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments sa
        INNER JOIN geniusbot.services s
            ON s.id = sa.service_id
        INNER JOIN geniusbot.doctors d
            ON d.id = sa.doctor_id
        INNER JOIN geniusbot.rooms r
            ON r.id = sa.room_id
        INNER JOIN geniusbot.branches b
            ON b.id = sa.branch_id
        WHERE sa.clinic_id = '90000000-0000-0000-0000-000000000001'
          AND sa.branch_id = '90000000-0000-0000-0000-000000000101'
          AND sa.service_id = '90000000-0000-0000-0000-000000000201'
          AND sa.is_active = true
          AND s.is_active = true
          AND s.is_booking_enabled = true
          AND d.is_active = true
          AND r.is_active = true
          AND b.is_active = true
    ),
    'The booking resources could not be resolved from service assignments.'
);

-- ============================================================================
-- 13. Successful Appointment Creation
-- ============================================================================

INSERT INTO geniusbot.appointments (
    id,
    clinic_id,
    branch_id,
    patient_id,
    service_id,
    doctor_id,
    room_id,
    appointment_start,
    appointment_end,
    payment_method_id,
    quoted_price,
    currency,
    status,
    source,
    notes
)
VALUES (
    '90000000-0000-0000-0000-000000000701',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000501',
    '90000000-0000-0000-0000-000000000201',
    '90000000-0000-0000-0000-000000000301',
    '90000000-0000-0000-0000-000000000401',
    '2030-07-01 10:00:00+03',
    '2030-07-01 10:30:00+03',
    '90000000-0000-0000-0000-000000000801',
    200.00,
    'SAR',
    'pending',
    'whatsapp_direct',
    'Database booking integration test.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE id = '90000000-0000-0000-0000-000000000701'
          AND status = 'pending'
          AND appointment_end - appointment_start = INTERVAL '30 minutes'
    ),
    'Valid appointment was not created correctly.'
);

-- ============================================================================
-- 14. Appointment Relationship Validation
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.clinics c
            ON c.id = a.clinic_id
        INNER JOIN geniusbot.branches b
            ON b.id = a.branch_id
        INNER JOIN geniusbot.patients p
            ON p.id = a.patient_id
        INNER JOIN geniusbot.services s
            ON s.id = a.service_id
        INNER JOIN geniusbot.doctors d
            ON d.id = a.doctor_id
        INNER JOIN geniusbot.rooms r
            ON r.id = a.room_id
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
          AND c.id = '90000000-0000-0000-0000-000000000001'
          AND b.clinic_id = a.clinic_id
          AND p.clinic_id = a.clinic_id
          AND s.clinic_id = a.clinic_id
          AND d.clinic_id = a.clinic_id
    ),
    'Appointment relationships are invalid.'
);

-- ============================================================================
-- 15. Appointment Duration Must Match Service Duration
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.services s
            ON s.id = a.service_id
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
          AND EXTRACT(
              EPOCH FROM (
                  a.appointment_end - a.appointment_start
              )
          ) / 60 = s.duration_minutes
    ),
    'Appointment duration does not match the service duration.'
);

-- ============================================================================
-- 16. Appointment Must Be Inside Branch Working Hours
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.branch_working_hours bwh
            ON bwh.branch_id = a.branch_id
           AND bwh.day_of_week = EXTRACT(
               DOW FROM a.appointment_start
           )::integer
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
          AND bwh.is_closed = false
          AND a.appointment_start::time >= bwh.opens_at
          AND a.appointment_end::time <= bwh.closes_at
    ),
    'Appointment is outside branch working hours.'
);

-- ============================================================================
-- 17. Appointment Must Be Inside Doctor Working Hours
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.doctor_working_hours dwh
            ON dwh.doctor_id = a.doctor_id
           AND dwh.branch_id = a.branch_id
           AND dwh.day_of_week = EXTRACT(
               DOW FROM a.appointment_start
           )::integer
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
          AND dwh.is_active = true
          AND a.appointment_start::time >= dwh.start_time
          AND a.appointment_end::time <= dwh.end_time
    ),
    'Appointment is outside doctor working hours.'
);

-- ============================================================================
-- 18. Appointment Must Not Conflict With Clinic Holiday
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.clinic_holidays ch
            ON ch.clinic_id = a.clinic_id
           AND (
                ch.branch_id IS NULL
                OR ch.branch_id = a.branch_id
           )
           AND ch.holiday_date = a.appointment_start::date
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
          AND (
                ch.is_closed = true
                OR a.appointment_start::time < ch.opens_at
                OR a.appointment_end::time > ch.closes_at
              )
    ),
    'Appointment conflicts with a clinic holiday.'
);

-- ============================================================================
-- 19. Appointment Must Not Conflict With Doctor Time Off
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.doctor_time_off dto
            ON dto.doctor_id = a.doctor_id
           AND tstzrange(
               dto.start_datetime,
               dto.end_datetime,
               '[)'
           ) && tstzrange(
               a.appointment_start,
               a.appointment_end,
               '[)'
           )
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
    ),
    'Appointment conflicts with doctor time off.'
);

-- ============================================================================
-- 20. Appointment Must Not Conflict With Room Time Off
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.room_time_off rto
            ON rto.room_id = a.room_id
           AND tstzrange(
               rto.start_datetime,
               rto.end_datetime,
               '[)'
           ) && tstzrange(
               a.appointment_start,
               a.appointment_end,
               '[)'
           )
        WHERE a.id = '90000000-0000-0000-0000-000000000701'
    ),
    'Appointment conflicts with room time off.'
);

-- ============================================================================
-- 21. Invalid Appointment Duration Must Be Rejected
-- ============================================================================

DO $$
DECLARE
    invalid_duration_rejected boolean := false;
BEGIN
    BEGIN
        INSERT INTO geniusbot.appointments (
            clinic_id,
            branch_id,
            patient_id,
            service_id,
            doctor_id,
            room_id,
            appointment_start,
            appointment_end,
            status,
            source
        )
        VALUES (
            '90000000-0000-0000-0000-000000000001',
            '90000000-0000-0000-0000-000000000101',
            '90000000-0000-0000-0000-000000000502',
            '90000000-0000-0000-0000-000000000201',
            '90000000-0000-0000-0000-000000000301',
            '90000000-0000-0000-0000-000000000401',
            '2030-07-01 11:00:00+03',
            '2030-07-01 10:30:00+03',
            'pending',
            'unknown'
        );
    EXCEPTION
        WHEN check_violation THEN
            invalid_duration_rejected := true;
    END;

    PERFORM pg_temp.assert_true(
        invalid_duration_rejected,
        'Appointment with end time before start time was not rejected.'
    );
END;
$$;

-- ============================================================================
-- 22. Invalid Appointment Status Must Be Rejected
-- ============================================================================

DO $$
DECLARE
    invalid_status_rejected boolean := false;
BEGIN
    BEGIN
        INSERT INTO geniusbot.appointments (
            clinic_id,
            branch_id,
            patient_id,
            service_id,
            doctor_id,
            room_id,
            appointment_start,
            appointment_end,
            status,
            source
        )
        VALUES (
            '90000000-0000-0000-0000-000000000001',
            '90000000-0000-0000-0000-000000000101',
            '90000000-0000-0000-0000-000000000502',
            '90000000-0000-0000-0000-000000000201',
            '90000000-0000-0000-0000-000000000301',
            '90000000-0000-0000-0000-000000000401',
            '2030-07-01 12:00:00+03',
            '2030-07-01 12:30:00+03',
            'invalid_status',
            'unknown'
        );
    EXCEPTION
        WHEN check_violation THEN
            invalid_status_rejected := true;
    END;

    PERFORM pg_temp.assert_true(
        invalid_status_rejected,
        'Invalid appointment status was not rejected.'
    );
END;
$$;

-- ============================================================================
-- 23. Invalid Appointment Source Must Be Rejected
-- ============================================================================

DO $$
DECLARE
    invalid_source_rejected boolean := false;
BEGIN
    BEGIN
        INSERT INTO geniusbot.appointments (
            clinic_id,
            branch_id,
            patient_id,
            service_id,
            doctor_id,
            room_id,
            appointment_start,
            appointment_end,
            status,
            source
        )
        VALUES (
            '90000000-0000-0000-0000-000000000001',
            '90000000-0000-0000-0000-000000000101',
            '90000000-0000-0000-0000-000000000502',
            '90000000-0000-0000-0000-000000000201',
            '90000000-0000-0000-0000-000000000301',
            '90000000-0000-0000-0000-000000000401',
            '2030-07-01 13:00:00+03',
            '2030-07-01 13:30:00+03',
            'pending',
            'invalid_source'
        );
    EXCEPTION
        WHEN check_violation THEN
            invalid_source_rejected := true;
    END;

    PERFORM pg_temp.assert_true(
        invalid_source_rejected,
        'Invalid appointment source was not rejected.'
    );
END;
$$;

-- ============================================================================
-- 24. Missing Patient Foreign Key Must Be Rejected
-- ============================================================================

DO $$
DECLARE
    missing_patient_rejected boolean := false;
BEGIN
    BEGIN
        INSERT INTO geniusbot.appointments (
            clinic_id,
            branch_id,
            patient_id,
            service_id,
            doctor_id,
            room_id,
            appointment_start,
            appointment_end,
            status,
            source
        )
        VALUES (
            '90000000-0000-0000-0000-000000000001',
            '90000000-0000-0000-0000-000000000101',
            '99999999-9999-9999-9999-999999999999',
            '90000000-0000-0000-0000-000000000201',
            '90000000-0000-0000-0000-000000000301',
            '90000000-0000-0000-0000-000000000401',
            '2030-07-01 14:00:00+03',
            '2030-07-01 14:30:00+03',
            'pending',
            'unknown'
        );
    EXCEPTION
        WHEN foreign_key_violation THEN
            missing_patient_rejected := true;
    END;

    PERFORM pg_temp.assert_true(
        missing_patient_rejected,
        'Appointment with a missing patient was not rejected.'
    );
END;
$$;

-- ============================================================================
-- 25. Doctor Conflict Detection Query
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        WHERE a.doctor_id = '90000000-0000-0000-0000-000000000301'
          AND a.status IN ('pending', 'confirmed')
          AND tstzrange(
              a.appointment_start,
              a.appointment_end,
              '[)'
          ) && tstzrange(
              '2030-07-01 10:15:00+03'::timestamptz,
              '2030-07-01 10:45:00+03'::timestamptz,
              '[)'
          )
    ),
    'Doctor conflict detection did not identify an overlapping appointment.'
);

-- ============================================================================
-- 26. Room Conflict Detection Query
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        WHERE a.room_id = '90000000-0000-0000-0000-000000000401'
          AND a.status IN ('pending', 'confirmed')
          AND tstzrange(
              a.appointment_start,
              a.appointment_end,
              '[)'
          ) && tstzrange(
              '2030-07-01 10:15:00+03'::timestamptz,
              '2030-07-01 10:45:00+03'::timestamptz,
              '[)'
          )
    ),
    'Room conflict detection did not identify an overlapping appointment.'
);

-- ============================================================================
-- 27. Patient Conflict Detection Query
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        WHERE a.patient_id = '90000000-0000-0000-0000-000000000501'
          AND a.status IN ('pending', 'confirmed')
          AND tstzrange(
              a.appointment_start,
              a.appointment_end,
              '[)'
          ) && tstzrange(
              '2030-07-01 10:15:00+03'::timestamptz,
              '2030-07-01 10:45:00+03'::timestamptz,
              '[)'
          )
    ),
    'Patient conflict detection did not identify an overlapping appointment.'
);

-- ============================================================================
-- 28. Adjacent Appointment Must Not Be Considered Overlapping
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        WHERE a.doctor_id = '90000000-0000-0000-0000-000000000301'
          AND a.status IN ('pending', 'confirmed')
          AND tstzrange(
              a.appointment_start,
              a.appointment_end,
              '[)'
          ) && tstzrange(
              '2030-07-01 10:30:00+03'::timestamptz,
              '2030-07-01 11:00:00+03'::timestamptz,
              '[)'
          )
    ),
    'Adjacent appointment was incorrectly detected as overlapping.'
);

-- ============================================================================
-- 29. Create Non-Overlapping Appointment
-- ============================================================================

INSERT INTO geniusbot.appointments (
    id,
    clinic_id,
    branch_id,
    patient_id,
    service_id,
    doctor_id,
    room_id,
    appointment_start,
    appointment_end,
    payment_method_id,
    quoted_price,
    currency,
    status,
    source
)
VALUES (
    '90000000-0000-0000-0000-000000000702',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000502',
    '90000000-0000-0000-0000-000000000201',
    '90000000-0000-0000-0000-000000000301',
    '90000000-0000-0000-0000-000000000401',
    '2030-07-01 10:30:00+03',
    '2030-07-01 11:00:00+03',
    '90000000-0000-0000-0000-000000000801',
    200.00,
    'SAR',
    'confirmed',
    'google'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE id = '90000000-0000-0000-0000-000000000702'
          AND status = 'confirmed'
    ),
    'Adjacent non-overlapping appointment was not created.'
);

-- ============================================================================
-- 30. Appointment Status Update
-- ============================================================================

UPDATE geniusbot.appointments
SET
    status = 'confirmed',
    updated_at = now()
WHERE id = '90000000-0000-0000-0000-000000000701'
  AND status = 'pending';

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE id = '90000000-0000-0000-0000-000000000701'
          AND status = 'confirmed'
    ),
    'Appointment status was not updated from pending to confirmed.'
);

-- ============================================================================
-- 31. Appointment Status Log
-- ============================================================================

INSERT INTO geniusbot.appointment_status_logs (
    appointment_id,
    old_status,
    new_status,
    notes
)
VALUES (
    '90000000-0000-0000-0000-000000000701',
    'pending',
    'confirmed',
    'Booking database test status transition.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointment_status_logs
        WHERE appointment_id = '90000000-0000-0000-0000-000000000701'
          AND old_status = 'pending'
          AND new_status = 'confirmed'
    ),
    'Appointment status log was not created.'
);

-- ============================================================================
-- 32. Upcoming Appointment Query
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '90000000-0000-0000-0000-000000000001'
          AND patient_id = '90000000-0000-0000-0000-000000000501'
          AND appointment_start >= now()
          AND status IN ('pending', 'confirmed')
    ) = 1,
    'Upcoming appointment query returned an unexpected result.'
);

-- ============================================================================
-- 33. Appointment Tenant Integrity View
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.v_appointment_integrity_issues
        WHERE appointment_id IN (
            '90000000-0000-0000-0000-000000000701',
            '90000000-0000-0000-0000-000000000702'
        )
    ),
    'Test appointments contain tenant-integrity issues.'
);

-- ============================================================================
-- 34. Booking Result Summary
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '90000000-0000-0000-0000-000000000001'
    ) = 2,
    'Unexpected number of test appointments.'
);

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '90000000-0000-0000-0000-000000000001'
          AND status = 'confirmed'
    ) = 2,
    'Unexpected number of confirmed test appointments.'
);

-- ============================================================================
-- Success
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'GeniusBot booking database tests passed successfully.';
    RAISE NOTICE 'All test data will now be rolled back.';
    RAISE NOTICE '===============================================================';
END;
$$;

ROLLBACK;
