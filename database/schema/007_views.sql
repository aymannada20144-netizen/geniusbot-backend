-- ============================================================================
-- GeniusBot Database
-- File: database/schema/007_views.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, pg_catalog;

-- ============================================================================
-- ACTIVE CLINICS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_clinics AS
SELECT
    c.id,
    c.name,
    c.timezone,
    c.default_language,
    c.created_at,
    c.updated_at
FROM geniusbot.clinics AS c
WHERE c.is_active = true;

COMMENT ON VIEW geniusbot.v_active_clinics IS
    'Active clinics available in the GeniusBot platform.';

-- ============================================================================
-- ACTIVE BRANCHES
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_branches AS
SELECT
    b.id,
    b.clinic_id,
    c.name AS clinic_name,
    b.name,
    b.address,
    b.phone_number,
    b.is_active,
    b.created_at,
    b.updated_at
FROM geniusbot.branches AS b
JOIN geniusbot.clinics AS c
  ON c.id = b.clinic_id
WHERE b.is_active = true
  AND c.is_active = true;

COMMENT ON VIEW geniusbot.v_active_branches IS
    'Active clinic branches with clinic information.';

-- ============================================================================
-- BRANCH SCHEDULE
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_branch_schedule AS
SELECT
    bwh.id,
    bwh.branch_id,
    b.clinic_id,
    c.name AS clinic_name,
    b.name AS branch_name,
    bwh.day_of_week,
    CASE bwh.day_of_week
        WHEN 0 THEN 'sunday'
        WHEN 1 THEN 'monday'
        WHEN 2 THEN 'tuesday'
        WHEN 3 THEN 'wednesday'
        WHEN 4 THEN 'thursday'
        WHEN 5 THEN 'friday'
        WHEN 6 THEN 'saturday'
    END AS day_name,
    bwh.opening_time,
    bwh.closing_time,
    bwh.is_closed,
    bwh.created_at,
    bwh.updated_at
FROM geniusbot.branch_working_hours AS bwh
JOIN geniusbot.branches AS b
  ON b.id = bwh.branch_id
JOIN geniusbot.clinics AS c
  ON c.id = b.clinic_id;

COMMENT ON VIEW geniusbot.v_branch_schedule IS
    'Weekly working schedule for every clinic branch.';

-- ============================================================================
-- ACTIVE SERVICES
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_services AS
SELECT
    s.id,
    s.clinic_id,
    c.name AS clinic_name,
    s.specialty_id,
    sp.name AS specialty_name,
    s.name,
    s.description,
    s.duration_minutes,
    s.buffer_before_minutes,
    s.buffer_after_minutes,
    s.requires_doctor,
    s.requires_room,
    s.is_booking_enabled,
    s.display_order,
    s.created_at,
    s.updated_at
FROM geniusbot.services AS s
JOIN geniusbot.clinics AS c
  ON c.id = s.clinic_id
LEFT JOIN geniusbot.specialties AS sp
  ON sp.id = s.specialty_id
WHERE s.is_active = true
  AND c.is_active = true;

COMMENT ON VIEW geniusbot.v_active_services IS
    'Active clinic services with specialty and booking configuration.';

-- ============================================================================
-- ACTIVE DOCTORS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_doctors AS
SELECT
    d.id,
    d.clinic_id,
    c.name AS clinic_name,
    d.full_name,
    d.phone_number,
    d.email,
    d.license_number,
    d.bio,
    d.created_at,
    d.updated_at
FROM geniusbot.doctors AS d
JOIN geniusbot.clinics AS c
  ON c.id = d.clinic_id
WHERE d.is_active = true
  AND c.is_active = true;

COMMENT ON VIEW geniusbot.v_active_doctors IS
    'Active doctors with their clinic information.';

-- ============================================================================
-- DOCTOR SPECIALTIES
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_doctor_specialties AS
SELECT
    d.id AS doctor_id,
    d.clinic_id,
    d.full_name AS doctor_name,
    s.id AS specialty_id,
    s.name AS specialty_name
FROM geniusbot.doctor_specialties AS ds
JOIN geniusbot.doctors AS d
  ON d.id = ds.doctor_id
JOIN geniusbot.specialties AS s
  ON s.id = ds.specialty_id
WHERE d.is_active = true
  AND s.is_active = true;

COMMENT ON VIEW geniusbot.v_doctor_specialties IS
    'Active doctor-to-specialty relationships.';

-- ============================================================================
-- DOCTOR SCHEDULE
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_doctor_schedule AS
SELECT
    dwh.id,
    dwh.doctor_id,
    d.full_name AS doctor_name,
    d.clinic_id,
    dwh.branch_id,
    b.name AS branch_name,
    dwh.day_of_week,
    CASE dwh.day_of_week
        WHEN 0 THEN 'sunday'
        WHEN 1 THEN 'monday'
        WHEN 2 THEN 'tuesday'
        WHEN 3 THEN 'wednesday'
        WHEN 4 THEN 'thursday'
        WHEN 5 THEN 'friday'
        WHEN 6 THEN 'saturday'
    END AS day_name,
    dwh.start_time,
    dwh.end_time,
    dwh.is_active,
    dwh.created_at,
    dwh.updated_at
FROM geniusbot.doctor_working_hours AS dwh
JOIN geniusbot.doctors AS d
  ON d.id = dwh.doctor_id
JOIN geniusbot.branches AS b
  ON b.id = dwh.branch_id
WHERE d.is_active = true
  AND b.is_active = true;

COMMENT ON VIEW geniusbot.v_doctor_schedule IS
    'Weekly doctor working schedules by branch.';

-- ============================================================================
-- ACTIVE ROOMS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_rooms AS
SELECT
    r.id,
    r.branch_id,
    b.clinic_id,
    b.name AS branch_name,
    r.name,
    r.description,
    r.capacity,
    r.created_at,
    r.updated_at
FROM geniusbot.rooms AS r
JOIN geniusbot.branches AS b
  ON b.id = r.branch_id
WHERE r.is_active = true
  AND b.is_active = true;

COMMENT ON VIEW geniusbot.v_active_rooms IS
    'Active rooms with branch and clinic ownership.';

-- ============================================================================
-- SERVICE ASSIGNMENTS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_service_assignments AS
SELECT
    sa.id,
    sa.clinic_id,
    sa.branch_id,
    b.name AS branch_name,
    sa.service_id,
    s.name AS service_name,
    sa.doctor_id,
    d.full_name AS doctor_name,
    sa.room_id,
    r.name AS room_name,
    sa.is_default,
    sa.created_at,
    sa.updated_at
FROM geniusbot.service_assignments AS sa
JOIN geniusbot.branches AS b
  ON b.id = sa.branch_id
JOIN geniusbot.services AS s
  ON s.id = sa.service_id
LEFT JOIN geniusbot.doctors AS d
  ON d.id = sa.doctor_id
LEFT JOIN geniusbot.rooms AS r
  ON r.id = sa.room_id
WHERE sa.is_active = true
  AND b.is_active = true
  AND s.is_active = true
  AND (
      sa.doctor_id IS NULL
      OR d.is_active = true
  )
  AND (
      sa.room_id IS NULL
      OR r.is_active = true
  );

COMMENT ON VIEW geniusbot.v_active_service_assignments IS
    'Active service assignments connecting branches, services, doctors and rooms.';

-- ============================================================================
-- ACTIVE PAYMENT METHODS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_payment_methods AS
SELECT
    pm.id,
    pm.clinic_id,
    c.name AS clinic_name,
    pm.name,
    pm.code AS payment_method_code,
    pm.created_at,
    pm.updated_at
FROM geniusbot.payment_methods AS pm
JOIN geniusbot.clinics AS c
  ON c.id = pm.clinic_id
WHERE pm.is_active = true
  AND c.is_active = true;

COMMENT ON VIEW geniusbot.v_active_payment_methods IS
    'Active payment methods for each clinic.';

-- ============================================================================
-- ACCEPTED INSURANCE CLASSES
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_accepted_insurance_classes AS
SELECT
    ic.id AS insurance_company_id,
    ic.clinic_id,
    ic.name AS insurance_company_name,
    cls.id AS insurance_class_id,
    cls.class_name AS insurance_class_name,
    ic.created_at AS insurance_company_created_at,
    cls.created_at AS insurance_class_created_at
FROM geniusbot.insurance_companies AS ic
JOIN geniusbot.insurance_classes AS cls
  ON cls.insurance_company_id = ic.id
WHERE ic.is_active = true
  AND cls.is_accepted = true;

COMMENT ON VIEW geniusbot.v_accepted_insurance_classes IS
    'Accepted insurance companies and classes by clinic.';

-- ============================================================================
-- CURRENT SERVICE PRICES
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.vw_current_service_prices AS
SELECT
    p.id,
    p.clinic_id,
    p.service_id,
    s.name AS service_name,
    p.payment_method_id,
    pm.name AS payment_method_name,
    pm.code AS payment_method_code,
    p.insurance_company_id,
    ic.name AS insurance_company_name,
    p.insurance_class_id,
    cls.class_name AS insurance_class_name,
    p.price,
    p.currency,
    p.valid_from,
    p.valid_to,
    p.created_at,
    p.updated_at
FROM geniusbot.prices AS p
JOIN geniusbot.services AS s
  ON s.id = p.service_id
JOIN geniusbot.payment_methods AS pm
  ON pm.id = p.payment_method_id
LEFT JOIN geniusbot.insurance_companies AS ic
  ON ic.id = p.insurance_company_id
LEFT JOIN geniusbot.insurance_classes AS cls
  ON cls.id = p.insurance_class_id
WHERE p.is_active = true
  AND p.valid_from <= CURRENT_DATE
  AND (
      p.valid_to IS NULL
      OR p.valid_to >= CURRENT_DATE
  );

COMMENT ON VIEW geniusbot.vw_current_service_prices IS
    'Active service prices whose validity period includes the current date.';

-- ============================================================================
-- PATIENT SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_patient_summary AS
SELECT
    p.id,
    p.clinic_id,
    p.full_name,
    p.phone_number,
    p.whatsapp_id,
    p.email,
    p.gender,
    p.date_of_birth,
    p.last_seen_at,
    COUNT(a.id) AS total_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'pending'
    ) AS pending_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'confirmed'
    ) AS confirmed_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'completed'
    ) AS completed_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'cancelled'
    ) AS cancelled_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'no_show'
    ) AS no_show_appointments,
    MAX(a.appointment_start) FILTER (
        WHERE a.status = 'completed'
    ) AS last_completed_appointment,
    MIN(a.appointment_start) FILTER (
        WHERE a.status IN ('pending', 'confirmed')
          AND a.appointment_start >= CURRENT_TIMESTAMP
    ) AS next_appointment,
    p.created_at,
    p.updated_at
FROM geniusbot.patients AS p
LEFT JOIN geniusbot.appointments AS a
  ON a.patient_id = p.id
 AND a.clinic_id = p.clinic_id
GROUP BY
    p.id,
    p.clinic_id,
    p.full_name,
    p.phone_number,
    p.whatsapp_id,
    p.email,
    p.gender,
    p.date_of_birth,
    p.last_seen_at,
    p.created_at,
    p.updated_at;

COMMENT ON VIEW geniusbot.v_patient_summary IS
    'Patient information with appointment history and next appointment.';

-- ============================================================================
-- APPOINTMENT DETAILS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_appointment_details AS
SELECT
    a.id,
    a.clinic_id,
    c.name AS clinic_name,
    a.branch_id,
    b.name AS branch_name,
    a.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone_number,
    p.whatsapp_id AS patient_whatsapp_id,
    a.service_id,
    s.name AS service_name,
    s.duration_minutes AS service_duration_minutes,
    a.doctor_id,
    d.full_name AS doctor_name,
    a.room_id,
    r.name AS room_name,
    a.payment_method_id,
    pm.name AS payment_method_name,
    a.insurance_company_id,
    ic.name AS insurance_company_name,
    a.insurance_class_id,
    cls.class_name AS insurance_class_name,
    a.conversation_id,
    a.appointment_start,
    a.appointment_end,
    a.status,
    a.source,
    a.notes,
    a.cancellation_reason,
    a.created_at,
    a.updated_at
FROM geniusbot.appointments AS a
JOIN geniusbot.clinics AS c
  ON c.id = a.clinic_id
JOIN geniusbot.branches AS b
  ON b.id = a.branch_id
JOIN geniusbot.patients AS p
  ON p.id = a.patient_id
JOIN geniusbot.services AS s
  ON s.id = a.service_id
LEFT JOIN geniusbot.doctors AS d
  ON d.id = a.doctor_id
LEFT JOIN geniusbot.rooms AS r
  ON r.id = a.room_id
LEFT JOIN geniusbot.payment_methods AS pm
  ON pm.id = a.payment_method_id
LEFT JOIN geniusbot.insurance_companies AS ic
  ON ic.id = a.insurance_company_id
LEFT JOIN geniusbot.insurance_classes AS cls
  ON cls.id = a.insurance_class_id;

COMMENT ON VIEW geniusbot.v_appointment_details IS
    'Complete appointment details for booking, dashboard and reporting use cases.';

-- ============================================================================
-- ACTIVE APPOINTMENTS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_active_appointments AS
SELECT
    ad.*
FROM geniusbot.v_appointment_details AS ad
WHERE ad.status IN ('pending', 'confirmed');

COMMENT ON VIEW geniusbot.v_active_appointments IS
    'Pending and confirmed appointments that occupy doctor, room and patient availability.';

-- ============================================================================
-- UPCOMING APPOINTMENTS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_upcoming_appointments AS
SELECT
    ad.*
FROM geniusbot.v_appointment_details AS ad
WHERE ad.status IN ('pending', 'confirmed', 'checked_in')
  AND ad.appointment_start >= CURRENT_TIMESTAMP;

COMMENT ON VIEW geniusbot.v_upcoming_appointments IS
    'Upcoming pending, confirmed, and checked-in appointments.';

-- ============================================================================
-- TODAY SCHEDULE
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_today_schedule AS
SELECT
    ad.*
FROM geniusbot.v_appointment_details AS ad
JOIN geniusbot.clinics AS c
  ON c.id = ad.clinic_id
WHERE ad.status IN ('pending', 'confirmed', 'checked_in')
  AND (
      ad.appointment_start
      AT TIME ZONE c.timezone
  )::date = (
      CURRENT_TIMESTAMP
      AT TIME ZONE c.timezone
  )::date;

COMMENT ON VIEW geniusbot.v_today_schedule IS
    'Current-day pending, confirmed, and checked-in appointments based on each clinic timezone.';

-- ============================================================================
-- APPOINTMENT STATUS HISTORY
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_appointment_status_history AS
SELECT
    asl.id,
    asl.appointment_id,
    a.clinic_id,
    a.patient_id,
    p.full_name AS patient_name,
    asl.old_status,
    asl.new_status,
    asl.changed_by_staff_id,
    st.full_name AS changed_by_staff_name,
    asl.notes,
    asl.created_at
FROM geniusbot.appointment_status_logs AS asl
JOIN geniusbot.appointments AS a
  ON a.id = asl.appointment_id
JOIN geniusbot.patients AS p
  ON p.id = a.patient_id
LEFT JOIN geniusbot.staff AS st
  ON st.id = asl.changed_by_staff_id;

COMMENT ON VIEW geniusbot.v_appointment_status_history IS
    'Appointment status audit history with patient and staff information.';

-- ============================================================================
-- DASHBOARD APPOINTMENT STATISTICS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_dashboard_appointment_stats AS
SELECT
    c.id AS clinic_id,
    COUNT(a.id) AS total_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'pending'
    ) AS pending_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'confirmed'
    ) AS confirmed_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'checked_in'
    ) AS checked_in_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'completed'
    ) AS completed_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'cancelled'
    ) AS cancelled_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'no_show'
    ) AS no_show_appointments,
    COUNT(a.id) FILTER (
        WHERE (
            a.appointment_start
            AT TIME ZONE c.timezone
        )::date = (
            CURRENT_TIMESTAMP
            AT TIME ZONE c.timezone
        )::date
    ) AS today_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status IN ('pending', 'confirmed')
          AND a.appointment_start >= CURRENT_TIMESTAMP
          AND a.appointment_start
              < CURRENT_TIMESTAMP + INTERVAL '7 days'
    ) AS upcoming_7_days
FROM geniusbot.clinics AS c
LEFT JOIN geniusbot.appointments AS a
  ON a.clinic_id = c.id
GROUP BY
    c.id;

COMMENT ON VIEW geniusbot.v_dashboard_appointment_stats IS
    'Aggregated appointment statistics used by the clinic dashboard.';

-- ============================================================================
-- DOCTOR APPOINTMENT STATISTICS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_doctor_appointment_stats AS
SELECT
    d.id AS doctor_id,
    d.clinic_id,
    d.full_name AS doctor_name,
    COUNT(a.id) AS total_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'pending'
    ) AS pending_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'confirmed'
    ) AS confirmed_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'checked_in'
    ) AS checked_in_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'completed'
    ) AS completed_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'cancelled'
    ) AS cancelled_appointments,
    COUNT(a.id) FILTER (
        WHERE a.status = 'no_show'
    ) AS no_show_appointments,
    MIN(a.appointment_start) FILTER (
        WHERE a.status IN ('pending', 'confirmed')
          AND a.appointment_start >= CURRENT_TIMESTAMP
    ) AS next_appointment
FROM geniusbot.doctors AS d
LEFT JOIN geniusbot.appointments AS a
  ON a.doctor_id = d.id
 AND a.clinic_id = d.clinic_id
GROUP BY
    d.id,
    d.clinic_id,
    d.full_name;

COMMENT ON VIEW geniusbot.v_doctor_appointment_stats IS
    'Appointment statistics grouped by doctor.';

-- ============================================================================
-- FINANCIAL TRANSACTIONS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_financial_transactions AS
SELECT
    t.id,
    t.clinic_id,
    c.name AS clinic_name,
    t.appointment_id,
    t.patient_id,
    p.full_name AS patient_name,
    t.payment_method_id,
    pm.name AS payment_method_name,
    pm.code AS payment_method_code,
    t.amount,
    t.currency,
    t.status,
    t.payment_gateway,
    t.gateway_transaction_id,
    t.created_at,
    t.updated_at
FROM geniusbot.transactions AS t
JOIN geniusbot.clinics AS c
  ON c.id = t.clinic_id
JOIN geniusbot.patients AS p
  ON p.id = t.patient_id
JOIN geniusbot.payment_methods AS pm
  ON pm.id = t.payment_method_id;

COMMENT ON VIEW geniusbot.v_financial_transactions IS
    'Detailed clinic financial transactions with patient and payment method information.';

-- ============================================================================
-- FINANCIAL SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_financial_summary AS
SELECT
    c.id AS clinic_id,
    COUNT(t.id) AS total_transactions,
    COUNT(t.id) FILTER (
        WHERE t.status = 'paid'
    ) AS paid_transactions,
    COUNT(t.id) FILTER (
        WHERE t.status = 'pending'
    ) AS pending_transactions,
    COUNT(t.id) FILTER (
        WHERE t.status = 'failed'
    ) AS failed_transactions,
    COUNT(t.id) FILTER (
        WHERE t.status IN ('refunded', 'partially_refunded')
    ) AS refunded_transactions,
    COALESCE(
        SUM(t.amount) FILTER (
            WHERE t.status = 'paid'
        ),
        0
    ) AS total_paid_amount,
    COALESCE(
        SUM(t.amount) FILTER (
            WHERE t.status = 'pending'
        ),
        0
    ) AS total_pending_amount,
    COALESCE(
        SUM(t.amount) FILTER (
            WHERE t.status IN ('refunded', 'partially_refunded')
        ),
        0
    ) AS total_refunded_amount,
    COALESCE(
        SUM(t.amount) FILTER (
            WHERE t.status = 'paid'
              AND (
                  t.created_at
                  AT TIME ZONE c.timezone
              )::date = (
                  CURRENT_TIMESTAMP
                  AT TIME ZONE c.timezone
              )::date
        ),
        0
    ) AS today_paid_amount,
    COALESCE(
        SUM(t.amount) FILTER (
            WHERE t.status = 'paid'
              AND date_trunc(
                  'month',
                  t.created_at AT TIME ZONE c.timezone
              ) = date_trunc(
                  'month',
                  CURRENT_TIMESTAMP AT TIME ZONE c.timezone
              )
        ),
        0
    ) AS current_month_paid_amount
FROM geniusbot.clinics AS c
LEFT JOIN geniusbot.transactions AS t
  ON t.clinic_id = c.id
GROUP BY
    c.id;

COMMENT ON VIEW geniusbot.v_financial_summary IS
    'Clinic-level financial summary for dashboard reporting.';

-- ============================================================================
-- WAITLIST DETAILS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_waitlist_details AS
SELECT
    w.id,
    w.clinic_id,
    c.name AS clinic_name,
    w.branch_id,
    b.name AS branch_name,
    w.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone_number,
    w.service_id,
    s.name AS service_name,
    w.doctor_id,
    d.full_name AS doctor_name,
    w.preferred_date,
    w.preferred_start_time,
    w.preferred_end_time,
    w.status,
    w.notes,
    w.created_at,
    w.updated_at
FROM geniusbot.waitlist AS w
JOIN geniusbot.clinics AS c
  ON c.id = w.clinic_id
JOIN geniusbot.branches AS b
  ON b.id = w.branch_id
JOIN geniusbot.patients AS p
  ON p.id = w.patient_id
JOIN geniusbot.services AS s
  ON s.id = w.service_id
LEFT JOIN geniusbot.doctors AS d
  ON d.id = w.doctor_id;

COMMENT ON VIEW geniusbot.v_waitlist_details IS
    'Detailed waitlist records with patient, service, branch and doctor information.';

-- ============================================================================
-- PENDING REMINDERS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_pending_appointment_reminders AS
SELECT
    ar.id,
    ar.appointment_id,
    a.clinic_id,
    a.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone_number,
    p.whatsapp_id AS patient_whatsapp_id,
    ar.reminder_type,
    ar.scheduled_at,
    ar.status,
    ar.created_at,
    ar.updated_at
FROM geniusbot.appointment_reminders AS ar
JOIN geniusbot.appointments AS a
  ON a.id = ar.appointment_id
JOIN geniusbot.patients AS p
  ON p.id = a.patient_id
WHERE ar.status = 'pending'
  AND ar.scheduled_at <= CURRENT_TIMESTAMP
  AND a.status IN ('pending', 'confirmed');

COMMENT ON VIEW geniusbot.v_pending_appointment_reminders IS
    'Due appointment reminders that are eligible for processing.';

-- ============================================================================
-- OPEN CONVERSATIONS
-- ============================================================================

CREATE OR REPLACE VIEW geniusbot.v_open_conversations AS
SELECT
    conv.id,
    conv.clinic_id,
    c.name AS clinic_name,
    conv.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone_number,
    conv.assigned_to_staff_id,
    st.full_name AS assigned_staff_name,
    conv.channel,
    conv.status,
    conv.started_at,
    conv.created_at,
    conv.updated_at
FROM geniusbot.conversations AS conv
JOIN geniusbot.clinics AS c
  ON c.id = conv.clinic_id
LEFT JOIN geniusbot.patients AS p
  ON p.id = conv.patient_id
LEFT JOIN geniusbot.staff AS st
  ON st.id = conv.assigned_to_staff_id
WHERE conv.status IN ('open', 'pending');

COMMENT ON VIEW geniusbot.v_open_conversations IS
    'Open and pending patient conversations requiring bot or staff handling.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $validation$
DECLARE
    v_expected_views constant text[] := ARRAY[
        'v_active_clinics',
        'v_active_branches',
        'v_branch_schedule',
        'v_active_services',
        'v_active_doctors',
        'v_doctor_specialties',
        'v_doctor_schedule',
        'v_active_rooms',
        'v_active_service_assignments',
        'v_active_payment_methods',
        'v_accepted_insurance_classes',
        'vw_current_service_prices',
        'v_patient_summary',
        'v_appointment_details',
        'v_active_appointments',
        'v_upcoming_appointments',
        'v_today_schedule',
        'v_appointment_status_history',
        'v_dashboard_appointment_stats',
        'v_doctor_appointment_stats',
        'v_financial_transactions',
        'v_financial_summary',
        'v_waitlist_details',
        'v_pending_appointment_reminders',
        'v_open_conversations'
    ];

    v_view_name text;
    v_missing_views text[] := ARRAY[]::text[];
    v_invalid_views text[] := ARRAY[]::text[];
    v_external_dependencies text[] := ARRAY[]::text[];
BEGIN
    FOREACH v_view_name IN ARRAY v_expected_views
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_class AS c
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = c.relnamespace
             WHERE n.nspname = 'geniusbot'
               AND c.relname = v_view_name
               AND c.relkind = 'v'
        ) THEN
            v_missing_views :=
                pg_catalog.array_append(
                    v_missing_views,
                    v_view_name
                );
        END IF;
    END LOOP;

    SELECT pg_catalog.array_agg(
               view_name
               ORDER BY view_name
           )
      INTO v_invalid_views
      FROM (
          SELECT
              v.table_name AS view_name
          FROM information_schema.views AS v
          WHERE v.table_schema = 'geniusbot'
            AND v.table_name = ANY(v_expected_views)
            AND v.view_definition IS NULL
      ) AS invalid;

    SELECT pg_catalog.array_agg(
               DISTINCT dependent_view
               ORDER BY dependent_view
           )
      INTO v_external_dependencies
      FROM (
          SELECT
              dependent_class.relname AS dependent_view,
              source_namespace.nspname AS source_schema
          FROM pg_catalog.pg_rewrite AS rewrite_rule
          JOIN pg_catalog.pg_class AS dependent_class
            ON dependent_class.oid = rewrite_rule.ev_class
          JOIN pg_catalog.pg_namespace AS dependent_namespace
            ON dependent_namespace.oid = dependent_class.relnamespace
          JOIN pg_catalog.pg_depend AS dependency
            ON dependency.objid = rewrite_rule.oid
          JOIN pg_catalog.pg_class AS source_class
            ON source_class.oid = dependency.refobjid
          JOIN pg_catalog.pg_namespace AS source_namespace
            ON source_namespace.oid = source_class.relnamespace
          WHERE dependent_namespace.nspname = 'geniusbot'
            AND dependent_class.relname = ANY(v_expected_views)
            AND dependent_class.relkind = 'v'
            AND source_class.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND source_namespace.nspname NOT IN (
                'geniusbot',
                'pg_catalog',
                'information_schema'
            )
      ) AS dependencies;

    IF pg_catalog.cardinality(v_missing_views) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: missing views: %',
            pg_catalog.array_to_string(
                v_missing_views,
                ', '
            );
    END IF;

    IF pg_catalog.cardinality(v_invalid_views) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: invalid views: %',
            pg_catalog.array_to_string(
                v_invalid_views,
                ', '
            );
    END IF;

    IF pg_catalog.cardinality(v_external_dependencies) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: views have dependencies outside schema "geniusbot": %',
            pg_catalog.array_to_string(
                v_external_dependencies,
                ', '
            );
    END IF;

    RAISE NOTICE
        'Validation successful: all % required views exist in schema "geniusbot" and contain no external application-schema dependencies.',
        pg_catalog.cardinality(v_expected_views);
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
