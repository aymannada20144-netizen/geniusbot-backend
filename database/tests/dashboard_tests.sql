/*
===============================================================================
File: database/tests/dashboard_tests.sql
Project: GeniusBot Backend
Schema: geniusbot
Purpose: Dashboard database integration tests
Version: 2.0

Execution:
    psql -v ON_ERROR_STOP=1 -f database/tests/dashboard_tests.sql

Behavior:
    - Creates isolated dashboard test data.
    - Tests appointment statistics and today's schedule queries.
    - Tests clinic isolation.
    - Rolls back all inserted data after completion.
===============================================================================
*/

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO geniusbot, public;
SET LOCAL TIME ZONE 'Asia/Riyadh';

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
        RAISE EXCEPTION 'DASHBOARD TEST FAILED: %', failure_message;
    END IF;
END;
$$;

-- ============================================================================
-- Fixed Test Identifiers
-- ============================================================================

-- Primary clinic:
-- 91000000-0000-0000-0000-000000000001

-- Secondary clinic:
-- 91000000-0000-0000-0000-000000000002

-- Primary branch:
-- 91000000-0000-0000-0000-000000000101

-- Secondary branch:
-- 91000000-0000-0000-0000-000000000102

-- Service:
-- 91000000-0000-0000-0000-000000000201

-- Secondary service:
-- 91000000-0000-0000-0000-000000000202

-- Doctor:
-- 91000000-0000-0000-0000-000000000301

-- Secondary doctor:
-- 91000000-0000-0000-0000-000000000302

-- Room:
-- 91000000-0000-0000-0000-000000000401

-- Secondary room:
-- 91000000-0000-0000-0000-000000000402

-- Patients:
-- 91000000-0000-0000-0000-000000000501
-- 91000000-0000-0000-0000-000000000502
-- 91000000-0000-0000-0000-000000000503

-- Secondary patient:
-- 91000000-0000-0000-0000-000000000504

-- ============================================================================
-- 1. Create Test Clinics
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
VALUES
    (
        '91000000-0000-0000-0000-000000000001',
        'GeniusBot Dashboard Test Clinic',
        '+966500001001',
        '+966500001002',
        'Asia/Riyadh',
        'ar',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000002',
        'GeniusBot Secondary Dashboard Clinic',
        '+966500001003',
        '+966500001004',
        'Asia/Riyadh',
        'ar',
        true
    );

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.clinics
        WHERE id IN (
            '91000000-0000-0000-0000-000000000001',
            '91000000-0000-0000-0000-000000000002'
        )
    ) = 2,
    'Dashboard test clinics were not created.'
);

-- ============================================================================
-- 2. Create Test Branches
-- ============================================================================

INSERT INTO geniusbot.branches (
    id,
    clinic_id,
    name,
    address,
    timezone,
    is_active
)
VALUES
    (
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000001',
        'Dashboard Main Branch',
        'Riyadh',
        'Asia/Riyadh',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000102',
        '91000000-0000-0000-0000-000000000002',
        'Dashboard Secondary Branch',
        'Jeddah',
        'Asia/Riyadh',
        true
    );

-- ============================================================================
-- 3. Create Test Services
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
VALUES
    (
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000001',
        'Dashboard Test Consultation',
        'Primary dashboard test service.',
        30,
        true,
        true,
        true,
        true,
        1
    ),
    (
        '91000000-0000-0000-0000-000000000202',
        '91000000-0000-0000-0000-000000000002',
        'Secondary Dashboard Consultation',
        'Secondary dashboard test service.',
        30,
        true,
        true,
        true,
        true,
        1
    );

-- ============================================================================
-- 4. Create Test Doctors
-- ============================================================================

INSERT INTO geniusbot.doctors (
    id,
    clinic_id,
    full_name,
    title,
    gender,
    is_active
)
VALUES
    (
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000001',
        'Dr. Dashboard Test',
        'د.',
        'female',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000302',
        '91000000-0000-0000-0000-000000000002',
        'Dr. Secondary Dashboard',
        'د.',
        'male',
        true
    );

-- ============================================================================
-- 5. Create Test Rooms
-- ============================================================================

INSERT INTO geniusbot.rooms (
    id,
    branch_id,
    room_number,
    room_name,
    room_type,
    is_active
)
VALUES
    (
        '91000000-0000-0000-0000-000000000401',
        '91000000-0000-0000-0000-000000000101',
        'DASH-01',
        'Dashboard Test Room',
        'consultation',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000402',
        '91000000-0000-0000-0000-000000000102',
        'DASH-02',
        'Secondary Dashboard Room',
        'consultation',
        true
    );

-- ============================================================================
-- 6. Create Test Patients
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
        '91000000-0000-0000-0000-000000000501',
        '91000000-0000-0000-0000-000000000001',
        'Dashboard Patient One',
        '+966500001011',
        'whatsapp_direct',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000502',
        '91000000-0000-0000-0000-000000000001',
        'Dashboard Patient Two',
        '+966500001012',
        'google',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000503',
        '91000000-0000-0000-0000-000000000001',
        'Dashboard Patient Three',
        '+966500001013',
        'referral',
        true
    ),
    (
        '91000000-0000-0000-0000-000000000504',
        '91000000-0000-0000-0000-000000000002',
        'Secondary Dashboard Patient',
        '+966500001014',
        'walk_in',
        true
    );

-- ============================================================================
-- 7. Create Primary Clinic Appointments
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
    quoted_price,
    currency,
    status,
    source,
    notes
)
VALUES
    (
        '91000000-0000-0000-0000-000000000701',
        '91000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000501',
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000401',
        CURRENT_DATE + TIME '09:00',
        CURRENT_DATE + TIME '09:30',
        200.00,
        'SAR',
        'pending',
        'whatsapp_direct',
        'Today pending dashboard appointment.'
    ),
    (
        '91000000-0000-0000-0000-000000000702',
        '91000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000502',
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000401',
        CURRENT_DATE + TIME '10:00',
        CURRENT_DATE + TIME '10:30',
        200.00,
        'SAR',
        'confirmed',
        'google',
        'Today confirmed dashboard appointment.'
    ),
    (
        '91000000-0000-0000-0000-000000000703',
        '91000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000503',
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000401',
        CURRENT_DATE + TIME '11:00',
        CURRENT_DATE + TIME '11:30',
        200.00,
        'SAR',
        'completed',
        'referral',
        'Today completed dashboard appointment.'
    ),
    (
        '91000000-0000-0000-0000-000000000704',
        '91000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000501',
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000401',
        CURRENT_DATE + INTERVAL '1 day' + TIME '12:00',
        CURRENT_DATE + INTERVAL '1 day' + TIME '12:30',
        200.00,
        'SAR',
        'confirmed',
        'whatsapp_direct',
        'Tomorrow confirmed dashboard appointment.'
    ),
    (
        '91000000-0000-0000-0000-000000000705',
        '91000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000502',
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000401',
        CURRENT_DATE - INTERVAL '1 day' + TIME '13:00',
        CURRENT_DATE - INTERVAL '1 day' + TIME '13:30',
        200.00,
        'SAR',
        'cancelled',
        'google',
        'Yesterday cancelled dashboard appointment.'
    ),
    (
        '91000000-0000-0000-0000-000000000706',
        '91000000-0000-0000-0000-000000000001',
        '91000000-0000-0000-0000-000000000101',
        '91000000-0000-0000-0000-000000000503',
        '91000000-0000-0000-0000-000000000201',
        '91000000-0000-0000-0000-000000000301',
        '91000000-0000-0000-0000-000000000401',
        CURRENT_DATE - INTERVAL '2 days' + TIME '14:00',
        CURRENT_DATE - INTERVAL '2 days' + TIME '14:30',
        200.00,
        'SAR',
        'no_show',
        'referral',
        'Past no-show dashboard appointment.'
    );

-- ============================================================================
-- 8. Create Secondary Clinic Appointment
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
    quoted_price,
    currency,
    status,
    source
)
VALUES (
    '91000000-0000-0000-0000-000000000707',
    '91000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000102',
    '91000000-0000-0000-0000-000000000504',
    '91000000-0000-0000-0000-000000000202',
    '91000000-0000-0000-0000-000000000302',
    '91000000-0000-0000-0000-000000000402',
    CURRENT_DATE + TIME '15:00',
    CURRENT_DATE + TIME '15:30',
    300.00,
    'SAR',
    'confirmed',
    'walk_in'
);

-- ============================================================================
-- 9. Total Appointment Statistics
-- ============================================================================

DO $$
DECLARE
    stats_record record;
BEGIN
    SELECT
        COUNT(*) AS total_appointments,
        COUNT(*) FILTER (
            WHERE status = 'pending'
        ) AS pending_appointments,
        COUNT(*) FILTER (
            WHERE status = 'confirmed'
        ) AS confirmed_appointments,
        COUNT(*) FILTER (
            WHERE status = 'completed'
        ) AS completed_appointments,
        COUNT(*) FILTER (
            WHERE status = 'cancelled'
        ) AS cancelled_appointments,
        COUNT(*) FILTER (
            WHERE status = 'no_show'
        ) AS no_show_appointments
    INTO stats_record
    FROM geniusbot.appointments
    WHERE clinic_id = '91000000-0000-0000-0000-000000000001';

    PERFORM pg_temp.assert_true(
        stats_record.total_appointments = 6,
        'Total appointment count must equal 6.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.pending_appointments = 1,
        'Pending appointment count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.confirmed_appointments = 2,
        'Confirmed appointment count must equal 2.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.completed_appointments = 1,
        'Completed appointment count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.cancelled_appointments = 1,
        'Cancelled appointment count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.no_show_appointments = 1,
        'No-show appointment count must equal 1.'
    );
END;
$$;

-- ============================================================================
-- 10. Today Appointment Statistics
-- ============================================================================

DO $$
DECLARE
    stats_record record;
BEGIN
    SELECT
        COUNT(*) AS today_total,
        COUNT(*) FILTER (
            WHERE status = 'pending'
        ) AS pending_appointments,
        COUNT(*) FILTER (
            WHERE status = 'confirmed'
        ) AS confirmed_appointments,
        COUNT(*) FILTER (
            WHERE status = 'completed'
        ) AS completed_appointments
    INTO stats_record
    FROM geniusbot.appointments
    WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
      AND appointment_start >= CURRENT_DATE
      AND appointment_start < CURRENT_DATE + INTERVAL '1 day';

    PERFORM pg_temp.assert_true(
        stats_record.today_total = 3,
        'Today total appointment count must equal 3.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.pending_appointments = 1,
        'Today pending appointment count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.confirmed_appointments = 1,
        'Today confirmed appointment count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        stats_record.completed_appointments = 1,
        'Today completed appointment count must equal 1.'
    );
END;
$$;

-- ============================================================================
-- 11. Dashboard Today Schedule
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.patients p
            ON p.id = a.patient_id
        INNER JOIN geniusbot.services s
            ON s.id = a.service_id
        INNER JOIN geniusbot.branches b
            ON b.id = a.branch_id
        LEFT JOIN geniusbot.doctors d
            ON d.id = a.doctor_id
        LEFT JOIN geniusbot.rooms r
            ON r.id = a.room_id
        WHERE a.clinic_id = '91000000-0000-0000-0000-000000000001'
          AND a.appointment_start >= CURRENT_DATE
          AND a.appointment_start < CURRENT_DATE + INTERVAL '1 day'
          AND a.status IN ('pending', 'confirmed')
    ) = 2,
    'Today schedule must contain only two pending or confirmed appointments.'
);

-- ============================================================================
-- 12. Today Schedule Excludes Terminal Statuses
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        WHERE a.clinic_id = '91000000-0000-0000-0000-000000000001'
          AND a.appointment_start >= CURRENT_DATE
          AND a.appointment_start < CURRENT_DATE + INTERVAL '1 day'
          AND a.status IN ('completed', 'cancelled', 'no_show', 'rescheduled')
          AND a.id IN (
              SELECT scheduled_appointment.id
              FROM geniusbot.appointments scheduled_appointment
              WHERE scheduled_appointment.clinic_id =
                    '91000000-0000-0000-0000-000000000001'
                AND scheduled_appointment.appointment_start >= CURRENT_DATE
                AND scheduled_appointment.appointment_start <
                    CURRENT_DATE + INTERVAL '1 day'
                AND scheduled_appointment.status IN ('pending', 'confirmed')
          )
    ),
    'Today schedule contains a terminal appointment status.'
);

-- ============================================================================
-- 13. Today Schedule Ordering
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT ARRAY_AGG(
            schedule.id
            ORDER BY schedule.appointment_start ASC
        )
        FROM (
            SELECT
                a.id,
                a.appointment_start
            FROM geniusbot.appointments a
            WHERE a.clinic_id =
                  '91000000-0000-0000-0000-000000000001'
              AND a.appointment_start >= CURRENT_DATE
              AND a.appointment_start <
                  CURRENT_DATE + INTERVAL '1 day'
              AND a.status IN ('pending', 'confirmed')
        ) schedule
    ) = ARRAY[
        '91000000-0000-0000-0000-000000000701'::uuid,
        '91000000-0000-0000-0000-000000000702'::uuid
    ],
    'Today schedule is not ordered by appointment start time.'
);

-- ============================================================================
-- 14. Upcoming Seven Days
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND appointment_start >= CURRENT_DATE
          AND appointment_start < CURRENT_DATE + INTERVAL '7 days'
    ) = 4,
    'Upcoming seven-day count must equal 4.'
);

-- ============================================================================
-- 15. Upcoming Active Appointments
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND appointment_start >= CURRENT_DATE
          AND appointment_start < CURRENT_DATE + INTERVAL '7 days'
          AND status IN ('pending', 'confirmed')
    ) = 3,
    'Upcoming active appointment count must equal 3.'
);

-- ============================================================================
-- 16. Status Grouping
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(DISTINCT status)
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
    ) = 5,
    'Dashboard status grouping must contain five statuses.'
);

-- ============================================================================
-- 17. Doctor Today Workload
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(a.id)
        FROM geniusbot.doctors d
        LEFT JOIN geniusbot.appointments a
            ON a.doctor_id = d.id
           AND a.appointment_start >= CURRENT_DATE
           AND a.appointment_start <
               CURRENT_DATE + INTERVAL '1 day'
           AND a.status IN ('pending', 'confirmed')
        WHERE d.clinic_id =
              '91000000-0000-0000-0000-000000000001'
          AND d.id =
              '91000000-0000-0000-0000-000000000301'
    ) = 2,
    'Doctor today workload must equal 2 active appointments.'
);

-- ============================================================================
-- 18. Room Today Utilization
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(a.id)
        FROM geniusbot.rooms r
        INNER JOIN geniusbot.branches b
            ON b.id = r.branch_id
        LEFT JOIN geniusbot.appointments a
            ON a.room_id = r.id
           AND a.appointment_start >= CURRENT_DATE
           AND a.appointment_start <
               CURRENT_DATE + INTERVAL '1 day'
           AND a.status IN ('pending', 'confirmed')
        WHERE b.clinic_id =
              '91000000-0000-0000-0000-000000000001'
          AND r.id =
              '91000000-0000-0000-0000-000000000401'
    ) = 2,
    'Room today utilization must equal 2 active appointments.'
);

-- ============================================================================
-- 19. Branch Appointment Statistics
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(a.id)
        FROM geniusbot.branches b
        LEFT JOIN geniusbot.appointments a
            ON a.branch_id = b.id
           AND a.clinic_id = b.clinic_id
        WHERE b.clinic_id =
              '91000000-0000-0000-0000-000000000001'
          AND b.id =
              '91000000-0000-0000-0000-000000000101'
    ) = 6,
    'Primary branch appointment count must equal 6.'
);

-- ============================================================================
-- 20. Service Appointment Statistics
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(a.id)
        FROM geniusbot.services s
        LEFT JOIN geniusbot.appointments a
            ON a.service_id = s.id
           AND a.clinic_id = s.clinic_id
        WHERE s.clinic_id =
              '91000000-0000-0000-0000-000000000001'
          AND s.id =
              '91000000-0000-0000-0000-000000000201'
    ) = 6,
    'Primary service appointment count must equal 6.'
);

-- ============================================================================
-- 21. Patient Count
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.patients
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
    ) = 3,
    'Primary clinic patient count must equal 3.'
);

-- ============================================================================
-- 22. Active Doctor Count
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.doctors
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND is_active = true
    ) = 1,
    'Primary clinic active doctor count must equal 1.'
);

-- ============================================================================
-- 23. Active Service Count
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.services
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND is_active = true
          AND is_booking_enabled = true
    ) = 1,
    'Primary clinic active service count must equal 1.'
);

-- ============================================================================
-- 24. Active Branch Count
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.branches
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND is_active = true
    ) = 1,
    'Primary clinic active branch count must equal 1.'
);

-- ============================================================================
-- 25. Dashboard KPI Summary
-- ============================================================================

DO $$
DECLARE
    kpi_record record;
BEGIN
    SELECT
        (
            SELECT COUNT(*)
            FROM geniusbot.patients
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
        ) AS patients,

        (
            SELECT COUNT(*)
            FROM geniusbot.doctors
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
              AND is_active = true
        ) AS doctors,

        (
            SELECT COUNT(*)
            FROM geniusbot.services
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
              AND is_active = true
        ) AS services,

        (
            SELECT COUNT(*)
            FROM geniusbot.branches
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
              AND is_active = true
        ) AS branches,

        (
            SELECT COUNT(*)
            FROM geniusbot.appointments
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
              AND appointment_start >= CURRENT_DATE
              AND appointment_start <
                  CURRENT_DATE + INTERVAL '1 day'
        ) AS today_appointments,

        (
            SELECT COUNT(*)
            FROM geniusbot.appointments
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
              AND status = 'pending'
        ) AS pending_appointments
    INTO kpi_record;

    PERFORM pg_temp.assert_true(
        kpi_record.patients = 3,
        'Dashboard KPI patient count must equal 3.'
    );

    PERFORM pg_temp.assert_true(
        kpi_record.doctors = 1,
        'Dashboard KPI doctor count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        kpi_record.services = 1,
        'Dashboard KPI service count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        kpi_record.branches = 1,
        'Dashboard KPI branch count must equal 1.'
    );

    PERFORM pg_temp.assert_true(
        kpi_record.today_appointments = 3,
        'Dashboard KPI today appointment count must equal 3.'
    );

    PERFORM pg_temp.assert_true(
        kpi_record.pending_appointments = 1,
        'Dashboard KPI pending appointment count must equal 1.'
    );
END;
$$;

-- ============================================================================
-- 26. Clinic Isolation For Appointment Statistics
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
    ) = 6,
    'Primary clinic statistics include another clinic''s appointment.'
);

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(*)
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000002'
    ) = 1,
    'Secondary clinic appointment count must equal 1.'
);

-- ============================================================================
-- 27. Clinic Isolation For Today Schedule
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND id = '91000000-0000-0000-0000-000000000707'
    ),
    'Secondary clinic appointment leaked into the primary clinic dashboard.'
);

-- ============================================================================
-- 28. Joined Schedule Data
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.appointments a
        INNER JOIN geniusbot.patients p
            ON p.id = a.patient_id
        INNER JOIN geniusbot.services s
            ON s.id = a.service_id
        INNER JOIN geniusbot.branches b
            ON b.id = a.branch_id
        LEFT JOIN geniusbot.doctors d
            ON d.id = a.doctor_id
        LEFT JOIN geniusbot.rooms r
            ON r.id = a.room_id
        WHERE a.id = '91000000-0000-0000-0000-000000000701'
          AND p.full_name = 'Dashboard Patient One'
          AND s.name = 'Dashboard Test Consultation'
          AND d.full_name = 'Dr. Dashboard Test'
          AND r.room_number = 'DASH-01'
          AND b.name = 'Dashboard Main Branch'
    ),
    'Today schedule joined data is incomplete or incorrect.'
);

-- ============================================================================
-- 29. Daily Trend
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COUNT(DISTINCT appointment_start::date)
        FROM geniusbot.appointments
        WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
          AND appointment_start >= CURRENT_DATE - INTERVAL '30 days'
    ) = 4,
    'Daily trend must contain four appointment dates.'
);

-- ============================================================================
-- 30. Monthly Trend
-- ============================================================================

SELECT pg_temp.assert_true(
    (
        SELECT COALESCE(
            SUM(monthly_count),
            0
        )
        FROM (
            SELECT
                DATE_TRUNC(
                    'month',
                    appointment_start
                )::date AS appointment_month,
                COUNT(*) AS monthly_count
            FROM geniusbot.appointments
            WHERE clinic_id =
                  '91000000-0000-0000-0000-000000000001'
            GROUP BY DATE_TRUNC('month', appointment_start)
        ) monthly_statistics
    ) = 6,
    'Monthly trend total must equal 6.'
);

-- ============================================================================
-- 31. Today Schedule Integrity
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.v_appointment_integrity_issues
        WHERE appointment_id IN (
            '91000000-0000-0000-0000-000000000701',
            '91000000-0000-0000-0000-000000000702',
            '91000000-0000-0000-0000-000000000703',
            '91000000-0000-0000-0000-000000000704',
            '91000000-0000-0000-0000-000000000705',
            '91000000-0000-0000-0000-000000000706',
            '91000000-0000-0000-0000-000000000707'
        )
    ),
    'Dashboard test appointments contain tenant-integrity issues.'
);

-- ============================================================================
-- 32. Final Dashboard Result Summary
-- ============================================================================

DO $$
DECLARE
    primary_total integer;
    primary_today integer;
    primary_today_schedule integer;
    primary_upcoming integer;
BEGIN
    SELECT COUNT(*)
    INTO primary_total
    FROM geniusbot.appointments
    WHERE clinic_id = '91000000-0000-0000-0000-000000000001';

    SELECT COUNT(*)
    INTO primary_today
    FROM geniusbot.appointments
    WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
      AND appointment_start >= CURRENT_DATE
      AND appointment_start < CURRENT_DATE + INTERVAL '1 day';

    SELECT COUNT(*)
    INTO primary_today_schedule
    FROM geniusbot.appointments
    WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
      AND appointment_start >= CURRENT_DATE
      AND appointment_start < CURRENT_DATE + INTERVAL '1 day'
      AND status IN ('pending', 'confirmed');

    SELECT COUNT(*)
    INTO primary_upcoming
    FROM geniusbot.appointments
    WHERE clinic_id = '91000000-0000-0000-0000-000000000001'
      AND appointment_start >= CURRENT_DATE
      AND appointment_start < CURRENT_DATE + INTERVAL '7 days';

    PERFORM pg_temp.assert_true(
        primary_total = 6,
        'Final total appointment count is incorrect.'
    );

    PERFORM pg_temp.assert_true(
        primary_today = 3,
        'Final today appointment count is incorrect.'
    );

    PERFORM pg_temp.assert_true(
        primary_today_schedule = 2,
        'Final today schedule count is incorrect.'
    );

    PERFORM pg_temp.assert_true(
        primary_upcoming = 4,
        'Final upcoming seven-day count is incorrect.'
    );
END;
$$;

-- ============================================================================
-- Success
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'GeniusBot dashboard database tests passed successfully.';
    RAISE NOTICE 'All dashboard test data will now be rolled back.';
    RAISE NOTICE '===============================================================';
END;
$$;

ROLLBACK;