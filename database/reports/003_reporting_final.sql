-- ============================================================================
-- GeniusBot / Shaden
-- Migration: 003_reporting_final.sql
-- Purpose  : Final reporting layer for dashboard, appointments, patients,
--            doctors, conversations, revenue recovery, and financial KPIs.
-- Schema   : geniusbot
-- Requires : 001_ai_receptionist_core_final.sql
--            002_revenue_engine_final_v4.sql
-- Notes    :
--   1. Creates reporting views, read-only functions, and reporting indexes.
--   2. Does not create or modify operational business tables.
--   3. All daily boundaries use the clinic timezone.
--   4. Financial totals never mix currencies silently.
--   5. Safe to run more than once.
-- ============================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- ============================================================================
-- 0. PRE-FLIGHT VALIDATION
-- ============================================================================
DO $$
DECLARE
    required_table text;
    required_column record;
BEGIN
    FOREACH required_table IN ARRAY ARRAY[
        'clinics',
        'branches',
        'patients',
        'appointments',
        'services',
        'doctors',
        'rooms',
        'staff',
        'conversations',
        'messages',
        'transactions',
        'missed_calls',
        'booking_abandonments',
        'revenue_opportunities',
        'recovery_attempts',
        'revenue_conversions',
        'lookup_categories',
        'lookup_values'
    ]
    LOOP
        IF to_regclass(format('geniusbot.%I', required_table)) IS NULL THEN
            RAISE EXCEPTION
                'Required table geniusbot.% does not exist. Execute migrations 001 and 002 first.',
                required_table;
        END IF;
    END LOOP;

    FOR required_column IN
        SELECT *
        FROM (VALUES
            ('clinics', 'timezone'),
            ('appointments', 'appointment_start'),
            ('appointments', 'quoted_price'),
            ('appointments', 'currency'),
            ('missed_calls', 'status_id'),
            ('missed_calls', 'call_started_at'),
            ('revenue_opportunities', 'status_id'),
            ('revenue_opportunities', 'priority_id'),
            ('recovery_attempts', 'channel_id'),
            ('recovery_attempts', 'initiator_id'),
            ('recovery_attempts', 'status_id'),
            ('recovery_attempts', 'result_type_id'),
            ('revenue_conversions', 'conversion_type_id'),
            ('revenue_conversions', 'conversion_source_id')
        ) AS required_columns(table_name, column_name)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'geniusbot'
              AND table_name = required_column.table_name
              AND column_name = required_column.column_name
        ) THEN
            RAISE EXCEPTION
                'Required column geniusbot.%.% does not exist.',
                required_column.table_name,
                required_column.column_name;
        END IF;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- CONTROLLED RE-CREATION
-- Drop reporting functions first because some depend on reporting views.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS geniusbot.report_dashboard_summary(uuid, date, date);
DROP FUNCTION IF EXISTS geniusbot.report_dashboard_summary(uuid, date, date, varchar);
DROP FUNCTION IF EXISTS geniusbot.report_revenue_trend(uuid, date, date, text);
DROP FUNCTION IF EXISTS geniusbot.report_doctor_performance_range(uuid, date, date);
DROP FUNCTION IF EXISTS geniusbot.report_doctor_performance_range(uuid, date, date, varchar);
DROP FUNCTION IF EXISTS geniusbot.report_patient_activity(uuid, uuid);
DROP FUNCTION IF EXISTS geniusbot.report_patient_activity(uuid, uuid, varchar);

DROP VIEW IF EXISTS geniusbot.report_daily_clinic_kpis;
DROP VIEW IF EXISTS geniusbot.report_doctor_performance;
DROP VIEW IF EXISTS geniusbot.report_patient_summary;
DROP VIEW IF EXISTS geniusbot.report_revenue_conversion_facts;
DROP VIEW IF EXISTS geniusbot.report_recovery_attempt_facts;
DROP VIEW IF EXISTS geniusbot.report_revenue_opportunity_facts;
DROP VIEW IF EXISTS geniusbot.report_missed_call_facts;
DROP VIEW IF EXISTS geniusbot.report_conversation_facts;
DROP VIEW IF EXISTS geniusbot.report_appointment_facts;

-- ============================================================================
-- 1. APPOINTMENT FACTS
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_appointment_facts AS
SELECT
    a.id AS appointment_id,
    a.clinic_id,
    c.name AS clinic_name,
    c.timezone AS clinic_timezone,
    a.branch_id,
    b.name AS branch_name,
    a.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone,
    a.service_id,
    s.name AS service_name,
    a.doctor_id,
    d.full_name AS doctor_name,
    a.room_id,
    r.room_number,
    r.room_name,
    a.conversation_id,
    a.appointment_start,
    a.appointment_end,
    (a.appointment_start AT TIME ZONE c.timezone)::date AS appointment_local_date,
    (a.appointment_start AT TIME ZONE c.timezone)::time AS appointment_local_time,
    a.status,
    a.source,
    a.payment_method_id,
    a.insurance_company_id,
    a.insurance_class_id,
    a.quoted_price,
    a.currency,
    a.notes,
    a.created_at,
    a.updated_at
FROM geniusbot.appointments a
JOIN geniusbot.clinics c
  ON c.id = a.clinic_id
JOIN geniusbot.branches b
  ON b.id = a.branch_id
JOIN geniusbot.patients p
  ON p.id = a.patient_id
JOIN geniusbot.services s
  ON s.id = a.service_id
LEFT JOIN geniusbot.doctors d
  ON d.id = a.doctor_id
LEFT JOIN geniusbot.rooms r
  ON r.id = a.room_id;

-- ============================================================================
-- 2. CONVERSATION FACTS
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_conversation_facts AS
SELECT
    c.id AS conversation_id,
    c.clinic_id,
    cl.name AS clinic_name,
    cl.timezone AS clinic_timezone,
    c.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone,
    c.channel,
    c.status,
    c.assigned_to_staff_id,
    st.full_name AS assigned_staff_name,
    c.bot_enabled,
    c.current_state,
    c.handover_at,
    c.handover_reason,
    c.started_at,
    c.ended_at,
    (c.started_at AT TIME ZONE cl.timezone)::date AS started_local_date,
    COUNT(m.id) AS total_messages,
    COUNT(m.id) FILTER (WHERE m.sender_type = 'patient') AS patient_messages,
    COUNT(m.id) FILTER (WHERE m.sender_type = 'bot') AS bot_messages,
    COUNT(m.id) FILTER (WHERE m.sender_type = 'staff') AS staff_messages,
    COUNT(m.id) FILTER (WHERE m.sender_type = 'system') AS system_messages,
    MIN(m.created_at) AS first_message_at,
    MAX(m.created_at) AS last_message_at,
    MIN(m.created_at) FILTER (
        WHERE m.sender_type IN ('bot', 'staff')
    ) AS first_response_at,
    CASE
        WHEN MIN(m.created_at) FILTER (
            WHERE m.sender_type IN ('bot', 'staff')
        ) IS NULL THEN NULL
        ELSE EXTRACT(
            EPOCH FROM (
                MIN(m.created_at) FILTER (
                    WHERE m.sender_type IN ('bot', 'staff')
                ) - c.started_at
            )
        )::bigint
    END AS first_response_seconds
FROM geniusbot.conversations c
JOIN geniusbot.clinics cl
  ON cl.id = c.clinic_id
LEFT JOIN geniusbot.patients p
  ON p.id = c.patient_id
LEFT JOIN geniusbot.staff st
  ON st.id = c.assigned_to_staff_id
LEFT JOIN geniusbot.messages m
  ON m.conversation_id = c.id
GROUP BY
    c.id,
    c.clinic_id,
    cl.name,
    cl.timezone,
    c.patient_id,
    p.full_name,
    p.phone_number,
    c.channel,
    c.status,
    c.assigned_to_staff_id,
    st.full_name,
    c.bot_enabled,
    c.current_state,
    c.handover_at,
    c.handover_reason,
    c.started_at,
    c.ended_at;

-- ============================================================================
-- 3. MISSED CALL FACTS
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_missed_call_facts AS
SELECT
    mc.id AS missed_call_id,
    mc.clinic_id,
    c.name AS clinic_name,
    c.timezone AS clinic_timezone,
    mc.branch_id,
    b.name AS branch_name,
    mc.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone,
    mc.caller_phone,
    mc.caller_name,
    mc.conversation_id,
    mc.appointment_id,
    mc.provider_call_id,
    mc.called_at,
    (mc.called_at AT TIME ZONE c.timezone)::date AS called_local_date,
    mc.call_started_at,
    mc.call_ended_at,
    mc.duration_seconds,
    mc.recovery_status,
    lv.code AS recovery_status_code,
    lv.name_ar AS recovery_status_name_ar,
    lv.name_en AS recovery_status_name_en,
    mc.whatsapp_attempted_at,
    mc.customer_replied_at,
    mc.recovered_at,
    mc.failure_reason,
    mc.created_at,
    mc.updated_at,
    (mc.customer_replied_at IS NOT NULL) AS customer_replied,
    (mc.recovered_at IS NOT NULL OR mc.appointment_id IS NOT NULL) AS recovered
FROM geniusbot.missed_calls mc
JOIN geniusbot.clinics c
  ON c.id = mc.clinic_id
LEFT JOIN geniusbot.branches b
  ON b.id = mc.branch_id
LEFT JOIN geniusbot.patients p
  ON p.id = mc.patient_id
LEFT JOIN geniusbot.lookup_values lv
  ON lv.id = mc.status_id;

-- ============================================================================
-- 4. REVENUE OPPORTUNITY FACTS
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_revenue_opportunity_facts AS
SELECT
    ro.id AS opportunity_id,
    ro.clinic_id,
    c.name AS clinic_name,
    c.timezone AS clinic_timezone,
    ro.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone,
    ro.conversation_id,
    ro.appointment_id,
    ro.missed_call_id,
    ro.booking_abandonment_id,
    ro.source_type,
    ro.stage,
    status_value.code AS status_code,
    status_value.name_ar AS status_name_ar,
    status_value.name_en AS status_name_en,
    ro.priority,
    priority_value.code AS priority_code,
    priority_value.name_ar AS priority_name_ar,
    priority_value.name_en AS priority_name_en,
    ro.assigned_to_staff_id,
    st.full_name AS assigned_to_staff_name,
    ro.estimated_value,
    ro.recovered_value,
    ro.currency,
    ro.first_detected_at,
    (ro.first_detected_at AT TIME ZONE c.timezone)::date AS detected_local_date,
    ro.opened_at,
    ro.next_action_at,
    ro.converted_at,
    ro.closed_at,
    ro.lost_reason,
    ro.created_at,
    ro.updated_at,
    (
        ro.converted_at IS NOT NULL
        OR ro.stage IN ('booked', 'attended')
    ) AS is_converted,
    (
        ro.closed_at IS NULL
        AND ro.stage NOT IN ('lost', 'closed', 'attended')
    ) AS is_open,
    (
        ro.next_action_at IS NOT NULL
        AND ro.next_action_at < now()
        AND ro.closed_at IS NULL
    ) AS is_overdue
FROM geniusbot.revenue_opportunities ro
JOIN geniusbot.clinics c
  ON c.id = ro.clinic_id
LEFT JOIN geniusbot.patients p
  ON p.id = ro.patient_id
LEFT JOIN geniusbot.staff st
  ON st.id = ro.assigned_to_staff_id
LEFT JOIN geniusbot.lookup_values status_value
  ON status_value.id = ro.status_id
LEFT JOIN geniusbot.lookup_values priority_value
  ON priority_value.id = ro.priority_id;

-- ============================================================================
-- 5. RECOVERY ATTEMPT FACTS
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_recovery_attempt_facts AS
SELECT
    ra.id AS recovery_attempt_id,
    ra.clinic_id,
    c.name AS clinic_name,
    c.timezone AS clinic_timezone,
    ra.opportunity_id,
    COALESCE(ra.patient_id, ro.patient_id) AS patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone,
    ra.attempt_number,
    ra.attempt_type,
    ra.channel,
    channel_value.code AS channel_code,
    channel_value.name_ar AS channel_name_ar,
    channel_value.name_en AS channel_name_en,
    initiator_value.code AS initiator_code,
    initiator_value.name_ar AS initiator_name_ar,
    initiator_value.name_en AS initiator_name_en,
    ra.staff_id,
    st.full_name AS staff_name,
    ra.status,
    status_value.code AS status_code,
    status_value.name_ar AS status_name_ar,
    status_value.name_en AS status_name_en,
    result_value.code AS result_code,
    result_value.name_ar AS result_name_ar,
    result_value.name_en AS result_name_en,
    ra.scheduled_at,
    ra.attempted_at,
    ra.started_at,
    ra.finished_at,
    ra.replied_at,
    ra.duration_seconds,
    ra.failure_reason,
    ra.notes,
    ra.created_at,
    ra.updated_at,
    (ra.replied_at IS NOT NULL) AS received_reply,
    (
        status_value.code = 'COMPLETED'
        OR ra.status IN ('sent', 'delivered', 'replied')
    ) AS completed_successfully
FROM geniusbot.recovery_attempts ra
JOIN geniusbot.clinics c
  ON c.id = ra.clinic_id
JOIN geniusbot.revenue_opportunities ro
  ON ro.id = ra.opportunity_id
LEFT JOIN geniusbot.patients p
  ON p.id = COALESCE(ra.patient_id, ro.patient_id)
LEFT JOIN geniusbot.staff st
  ON st.id = ra.staff_id
LEFT JOIN geniusbot.lookup_values channel_value
  ON channel_value.id = ra.channel_id
LEFT JOIN geniusbot.lookup_values initiator_value
  ON initiator_value.id = ra.initiator_id
LEFT JOIN geniusbot.lookup_values status_value
  ON status_value.id = ra.status_id
LEFT JOIN geniusbot.lookup_values result_value
  ON result_value.id = ra.result_type_id;

-- ============================================================================
-- 6. REVENUE CONVERSION FACTS
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_revenue_conversion_facts AS
SELECT
    rc.id AS conversion_id,
    rc.opportunity_id,
    rc.clinic_id,
    c.name AS clinic_name,
    c.timezone AS clinic_timezone,
    rc.patient_id,
    p.full_name AS patient_name,
    p.phone_number AS patient_phone,
    rc.appointment_id,
    conversion_type.code AS conversion_type_code,
    conversion_type.name_ar AS conversion_type_name_ar,
    conversion_type.name_en AS conversion_type_name_en,
    conversion_source.code AS conversion_source_code,
    conversion_source.name_ar AS conversion_source_name_ar,
    conversion_source.name_en AS conversion_source_name_en,
    rc.estimated_revenue,
    rc.actual_revenue,
    rc.currency,
    rc.converted_at,
    (rc.converted_at AT TIME ZONE c.timezone)::date AS converted_local_date,
    rc.created_by_staff_id,
    st.full_name AS created_by_staff_name,
    rc.created_at,
    rc.updated_at
FROM geniusbot.revenue_conversions rc
JOIN geniusbot.clinics c
  ON c.id = rc.clinic_id
LEFT JOIN geniusbot.patients p
  ON p.id = rc.patient_id
LEFT JOIN geniusbot.staff st
  ON st.id = rc.created_by_staff_id
JOIN geniusbot.lookup_values conversion_type
  ON conversion_type.id = rc.conversion_type_id
JOIN geniusbot.lookup_values conversion_source
  ON conversion_source.id = rc.conversion_source_id;

-- ============================================================================
-- 7. PATIENT SUMMARY
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_patient_summary AS
SELECT
    p.id AS patient_id,
    p.clinic_id,
    p.full_name,
    p.phone_number,
    p.whatsapp_id,
    p.gender,
    p.birth_date,
    p.source,
    p.first_seen_at,
    p.last_seen_at,
    p.created_at,
    COALESCE(ap.total_appointments, 0) AS total_appointments,
    COALESCE(ap.completed_appointments, 0) AS completed_appointments,
    COALESCE(ap.cancelled_appointments, 0) AS cancelled_appointments,
    COALESCE(ap.no_show_appointments, 0) AS no_show_appointments,
    COALESCE(cv.total_conversations, 0) AS total_conversations,
    COALESCE(op.total_revenue_opportunities, 0) AS total_revenue_opportunities,
    COALESCE(rc.total_revenue_conversions, 0)::bigint AS total_revenue_conversions,
    COALESCE(rc.recovered_revenue_by_currency, '{}'::jsonb) AS recovered_revenue_by_currency,
    ap.last_appointment_at,
    ap.next_appointment_at
FROM geniusbot.patients p
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total_appointments,
        COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled_appointments,
        COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show_appointments,
        MAX(a.appointment_start) FILTER (
            WHERE a.appointment_start < now()
        ) AS last_appointment_at,
        MIN(a.appointment_start) FILTER (
            WHERE a.appointment_start >= now()
              AND a.status IN ('pending', 'confirmed')
        ) AS next_appointment_at
    FROM geniusbot.appointments a
    WHERE a.patient_id = p.id
) ap ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_conversations
    FROM geniusbot.conversations c
    WHERE c.patient_id = p.id
) cv ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_revenue_opportunities
    FROM geniusbot.revenue_opportunities ro
    WHERE ro.patient_id = p.id
) op ON true
LEFT JOIN LATERAL (
    SELECT
        SUM(x.conversion_count) AS total_revenue_conversions,
        jsonb_object_agg(x.currency, x.actual_revenue ORDER BY x.currency)
            AS recovered_revenue_by_currency
    FROM (
        SELECT
            rc.currency,
            COUNT(*) AS conversion_count,
            COALESCE(SUM(rc.actual_revenue), 0) AS actual_revenue
        FROM geniusbot.revenue_conversions rc
        WHERE rc.patient_id = p.id
        GROUP BY rc.currency
    ) x
) rc ON true;

-- ============================================================================
-- 8. DOCTOR PERFORMANCE
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_doctor_performance AS
SELECT
    d.id AS doctor_id,
    d.clinic_id,
    d.full_name AS doctor_name,
    d.title,
    d.is_active,
    COALESCE(ap.total_appointments, 0) AS total_appointments,
    COALESCE(ap.pending_appointments, 0) AS pending_appointments,
    COALESCE(ap.confirmed_appointments, 0) AS confirmed_appointments,
    COALESCE(ap.completed_appointments, 0) AS completed_appointments,
    COALESCE(ap.cancelled_appointments, 0) AS cancelled_appointments,
    COALESCE(ap.no_show_appointments, 0) AS no_show_appointments,
    COALESCE(fin.completed_quoted_value_by_currency, '{}'::jsonb)
        AS completed_quoted_value_by_currency,
    ap.last_appointment_at,
    ap.next_appointment_at
FROM geniusbot.doctors d
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total_appointments,
        COUNT(*) FILTER (WHERE a.status = 'pending') AS pending_appointments,
        COUNT(*) FILTER (WHERE a.status = 'confirmed') AS confirmed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled_appointments,
        COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show_appointments,
        MAX(a.appointment_start) FILTER (
            WHERE a.appointment_start < now()
        ) AS last_appointment_at,
        MIN(a.appointment_start) FILTER (
            WHERE a.appointment_start >= now()
              AND a.status IN ('pending', 'confirmed')
        ) AS next_appointment_at
    FROM geniusbot.appointments a
    WHERE a.doctor_id = d.id
) ap ON true
LEFT JOIN LATERAL (
    SELECT
        jsonb_object_agg(x.currency, x.completed_value ORDER BY x.currency)
            AS completed_quoted_value_by_currency
    FROM (
        SELECT
            a.currency,
            COALESCE(SUM(a.quoted_price), 0) AS completed_value
        FROM geniusbot.appointments a
        WHERE a.doctor_id = d.id
          AND a.status = 'completed'
        GROUP BY a.currency
    ) x
) fin ON true;

-- ============================================================================
-- 9. DAILY CLINIC KPIs
-- ============================================================================
CREATE OR REPLACE VIEW geniusbot.report_daily_clinic_kpis AS
WITH clinic_dates AS (
    SELECT
        a.clinic_id,
        (a.appointment_start AT TIME ZONE c.timezone)::date AS report_date
    FROM geniusbot.appointments a
    JOIN geniusbot.clinics c ON c.id = a.clinic_id

    UNION

    SELECT
        x.clinic_id,
        (x.started_at AT TIME ZONE c.timezone)::date
    FROM geniusbot.conversations x
    JOIN geniusbot.clinics c ON c.id = x.clinic_id

    UNION

    SELECT
        mc.clinic_id,
        (mc.called_at AT TIME ZONE c.timezone)::date
    FROM geniusbot.missed_calls mc
    JOIN geniusbot.clinics c ON c.id = mc.clinic_id

    UNION

    SELECT
        ro.clinic_id,
        (ro.first_detected_at AT TIME ZONE c.timezone)::date
    FROM geniusbot.revenue_opportunities ro
    JOIN geniusbot.clinics c ON c.id = ro.clinic_id

    UNION

    SELECT
        rc.clinic_id,
        (rc.converted_at AT TIME ZONE c.timezone)::date
    FROM geniusbot.revenue_conversions rc
    JOIN geniusbot.clinics c ON c.id = rc.clinic_id

    UNION

    SELECT
        p.clinic_id,
        (t.paid_at AT TIME ZONE c.timezone)::date
    FROM geniusbot.transactions t
    JOIN geniusbot.patients p ON p.id = t.patient_id
    JOIN geniusbot.clinics c ON c.id = p.clinic_id
    WHERE t.paid_at IS NOT NULL
),
appointment_metrics AS (
    SELECT
        a.clinic_id,
        (a.appointment_start AT TIME ZONE c.timezone)::date AS report_date,
        COUNT(*) AS total_appointments,
        COUNT(*) FILTER (WHERE a.status = 'pending') AS pending_appointments,
        COUNT(*) FILTER (WHERE a.status = 'confirmed') AS confirmed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_appointments,
        COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled_appointments,
        COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show_appointments
    FROM geniusbot.appointments a
    JOIN geniusbot.clinics c ON c.id = a.clinic_id
    GROUP BY a.clinic_id, (a.appointment_start AT TIME ZONE c.timezone)::date
),
conversation_metrics AS (
    SELECT
        x.clinic_id,
        (x.started_at AT TIME ZONE c.timezone)::date AS report_date,
        COUNT(*) AS conversations_started,
        COUNT(*) FILTER (WHERE x.handover_at IS NOT NULL) AS handed_over_conversations,
        COUNT(*) FILTER (WHERE x.bot_enabled = true) AS bot_enabled_conversations
    FROM geniusbot.conversations x
    JOIN geniusbot.clinics c ON c.id = x.clinic_id
    GROUP BY x.clinic_id, (x.started_at AT TIME ZONE c.timezone)::date
),
missed_call_metrics AS (
    SELECT
        mc.clinic_id,
        (mc.called_at AT TIME ZONE c.timezone)::date AS report_date,
        COUNT(*) AS missed_calls,
        COUNT(*) FILTER (WHERE mc.customer_replied_at IS NOT NULL) AS replied_missed_calls,
        COUNT(*) FILTER (
            WHERE mc.recovered_at IS NOT NULL OR mc.appointment_id IS NOT NULL
        ) AS recovered_missed_calls
    FROM geniusbot.missed_calls mc
    JOIN geniusbot.clinics c ON c.id = mc.clinic_id
    GROUP BY mc.clinic_id, (mc.called_at AT TIME ZONE c.timezone)::date
),
opportunity_cohort_metrics AS (
    SELECT
        ro.clinic_id,
        (ro.first_detected_at AT TIME ZONE c.timezone)::date AS report_date,
        COUNT(*) AS opportunities_detected,
        COUNT(rc.id) AS converted_opportunities
    FROM geniusbot.revenue_opportunities ro
    JOIN geniusbot.clinics c ON c.id = ro.clinic_id
    LEFT JOIN geniusbot.revenue_conversions rc
      ON rc.opportunity_id = ro.id
    GROUP BY ro.clinic_id, (ro.first_detected_at AT TIME ZONE c.timezone)::date
),
financial_metrics AS (
    SELECT
        x.clinic_id,
        x.report_date,
        jsonb_object_agg(x.currency, x.estimated_opportunity_value ORDER BY x.currency)
            FILTER (WHERE x.metric_type = 'opportunity') AS estimated_opportunity_value_by_currency,
        jsonb_object_agg(x.currency, x.actual_recovered_revenue ORDER BY x.currency)
            FILTER (WHERE x.metric_type = 'conversion') AS actual_recovered_revenue_by_currency,
        jsonb_object_agg(x.currency, x.paid_revenue ORDER BY x.currency)
            FILTER (WHERE x.metric_type = 'transaction') AS paid_revenue_by_currency
    FROM (
        SELECT
            ro.clinic_id,
            (ro.first_detected_at AT TIME ZONE c.timezone)::date AS report_date,
            ro.currency,
            'opportunity'::text AS metric_type,
            COALESCE(SUM(ro.estimated_value), 0) AS estimated_opportunity_value,
            NULL::numeric AS actual_recovered_revenue,
            NULL::numeric AS paid_revenue
        FROM geniusbot.revenue_opportunities ro
        JOIN geniusbot.clinics c ON c.id = ro.clinic_id
        GROUP BY ro.clinic_id,
                 (ro.first_detected_at AT TIME ZONE c.timezone)::date,
                 ro.currency

        UNION ALL

        SELECT
            rc.clinic_id,
            (rc.converted_at AT TIME ZONE c.timezone)::date,
            rc.currency,
            'conversion',
            NULL::numeric,
            COALESCE(SUM(rc.actual_revenue), 0),
            NULL::numeric
        FROM geniusbot.revenue_conversions rc
        JOIN geniusbot.clinics c ON c.id = rc.clinic_id
        GROUP BY rc.clinic_id,
                 (rc.converted_at AT TIME ZONE c.timezone)::date,
                 rc.currency

        UNION ALL

        SELECT
            p.clinic_id,
            (t.paid_at AT TIME ZONE c.timezone)::date,
            t.currency,
            'transaction',
            NULL::numeric,
            NULL::numeric,
            COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'paid'), 0)
        FROM geniusbot.transactions t
        JOIN geniusbot.patients p ON p.id = t.patient_id
        JOIN geniusbot.clinics c ON c.id = p.clinic_id
        WHERE t.paid_at IS NOT NULL
        GROUP BY p.clinic_id,
                 (t.paid_at AT TIME ZONE c.timezone)::date,
                 t.currency
    ) x
    GROUP BY x.clinic_id, x.report_date
)
SELECT
    cd.clinic_id,
    cd.report_date,
    COALESCE(am.total_appointments, 0) AS total_appointments,
    COALESCE(am.pending_appointments, 0) AS pending_appointments,
    COALESCE(am.confirmed_appointments, 0) AS confirmed_appointments,
    COALESCE(am.completed_appointments, 0) AS completed_appointments,
    COALESCE(am.cancelled_appointments, 0) AS cancelled_appointments,
    COALESCE(am.no_show_appointments, 0) AS no_show_appointments,
    COALESCE(cm.conversations_started, 0) AS conversations_started,
    COALESCE(cm.handed_over_conversations, 0) AS handed_over_conversations,
    COALESCE(cm.bot_enabled_conversations, 0) AS bot_enabled_conversations,
    COALESCE(mm.missed_calls, 0) AS missed_calls,
    COALESCE(mm.replied_missed_calls, 0) AS replied_missed_calls,
    COALESCE(mm.recovered_missed_calls, 0) AS recovered_missed_calls,
    COALESCE(ocm.opportunities_detected, 0) AS opportunities_detected,
    COALESCE(ocm.converted_opportunities, 0) AS converted_opportunities,
    COALESCE(fm.estimated_opportunity_value_by_currency, '{}'::jsonb)
        AS estimated_opportunity_value_by_currency,
    COALESCE(fm.actual_recovered_revenue_by_currency, '{}'::jsonb)
        AS actual_recovered_revenue_by_currency,
    COALESCE(fm.paid_revenue_by_currency, '{}'::jsonb)
        AS paid_revenue_by_currency,
    CASE
        WHEN COALESCE(mm.missed_calls, 0) = 0 THEN 0::numeric
        ELSE ROUND(
            COALESCE(mm.recovered_missed_calls, 0)::numeric
            / mm.missed_calls::numeric * 100,
            2
        )
    END AS missed_call_recovery_rate,
    CASE
        WHEN COALESCE(ocm.opportunities_detected, 0) = 0 THEN 0::numeric
        ELSE ROUND(
            COALESCE(ocm.converted_opportunities, 0)::numeric
            / ocm.opportunities_detected::numeric * 100,
            2
        )
    END AS opportunity_cohort_conversion_rate
FROM clinic_dates cd
LEFT JOIN appointment_metrics am
  ON am.clinic_id = cd.clinic_id
 AND am.report_date = cd.report_date
LEFT JOIN conversation_metrics cm
  ON cm.clinic_id = cd.clinic_id
 AND cm.report_date = cd.report_date
LEFT JOIN missed_call_metrics mm
  ON mm.clinic_id = cd.clinic_id
 AND mm.report_date = cd.report_date
LEFT JOIN opportunity_cohort_metrics ocm
  ON ocm.clinic_id = cd.clinic_id
 AND ocm.report_date = cd.report_date
LEFT JOIN financial_metrics fm
  ON fm.clinic_id = cd.clinic_id
 AND fm.report_date = cd.report_date;

-- ============================================================================
-- 10. DASHBOARD SUMMARY FUNCTION
-- ============================================================================
CREATE FUNCTION geniusbot.report_dashboard_summary(
    p_clinic_id uuid,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE,
    p_currency varchar DEFAULT 'SAR'
)
RETURNS TABLE (
    clinic_id uuid,
    date_from date,
    date_to date,
    currency varchar,
    total_appointments bigint,
    pending_appointments bigint,
    confirmed_appointments bigint,
    completed_appointments bigint,
    cancelled_appointments bigint,
    no_show_appointments bigint,
    total_conversations bigint,
    handed_over_conversations bigint,
    missed_calls bigint,
    recovered_missed_calls bigint,
    open_opportunities bigint,
    overdue_opportunities bigint,
    detected_opportunities bigint,
    converted_opportunities bigint,
    estimated_opportunity_value numeric,
    actual_recovered_revenue numeric,
    paid_revenue numeric,
    appointment_completion_rate numeric,
    missed_call_recovery_rate numeric,
    opportunity_cohort_conversion_rate numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_timezone text;
    v_start timestamptz;
    v_end timestamptz;
    v_currency varchar;
BEGIN
    IF p_clinic_id IS NULL THEN
        RAISE EXCEPTION 'p_clinic_id cannot be NULL.';
    END IF;

    IF p_date_from IS NULL OR p_date_to IS NULL THEN
        RAISE EXCEPTION 'Date range cannot contain NULL values.';
    END IF;

    IF p_date_to < p_date_from THEN
        RAISE EXCEPTION 'p_date_to must be greater than or equal to p_date_from.';
    END IF;

    v_currency := upper(trim(coalesce(p_currency, 'SAR')));

    IF v_currency !~ '^[A-Z]{3,10}$' THEN
        RAISE EXCEPTION 'Invalid currency code: %.', p_currency;
    END IF;

    SELECT c.timezone
      INTO v_timezone
      FROM geniusbot.clinics c
     WHERE c.id = p_clinic_id;

    IF v_timezone IS NULL THEN
        RAISE EXCEPTION 'Clinic % does not exist or has no timezone.', p_clinic_id;
    END IF;

    v_start := p_date_from::timestamp AT TIME ZONE v_timezone;
    v_end := (p_date_to + 1)::timestamp AT TIME ZONE v_timezone;

    RETURN QUERY
    WITH appointment_summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE a.status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE a.status = 'confirmed') AS confirmed,
            COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled,
            COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show
        FROM geniusbot.appointments a
        WHERE a.clinic_id = p_clinic_id
          AND a.appointment_start >= v_start
          AND a.appointment_start < v_end
    ),
    conversation_summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE c.handover_at IS NOT NULL) AS handed_over
        FROM geniusbot.conversations c
        WHERE c.clinic_id = p_clinic_id
          AND c.started_at >= v_start
          AND c.started_at < v_end
    ),
    missed_call_summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (
                WHERE mc.recovered_at IS NOT NULL OR mc.appointment_id IS NOT NULL
            ) AS recovered
        FROM geniusbot.missed_calls mc
        WHERE mc.clinic_id = p_clinic_id
          AND mc.called_at >= v_start
          AND mc.called_at < v_end
    ),
    opportunity_summary AS (
        SELECT
            COUNT(*) FILTER (
                WHERE ro.closed_at IS NULL
                  AND ro.stage NOT IN ('lost', 'closed', 'attended')
            ) AS open_count,
            COUNT(*) FILTER (
                WHERE ro.next_action_at IS NOT NULL
                  AND ro.next_action_at < now()
                  AND ro.closed_at IS NULL
            ) AS overdue_count,
            COUNT(*) AS detected_count,
            COUNT(rc.id) AS converted_count,
            COALESCE(
                SUM(ro.estimated_value) FILTER (WHERE ro.currency = v_currency),
                0
            ) AS estimated_value
        FROM geniusbot.revenue_opportunities ro
        LEFT JOIN geniusbot.revenue_conversions rc
          ON rc.opportunity_id = ro.id
        WHERE ro.clinic_id = p_clinic_id
          AND ro.first_detected_at >= v_start
          AND ro.first_detected_at < v_end
    ),
    conversion_summary AS (
        SELECT
            COALESCE(
                SUM(rc.actual_revenue) FILTER (WHERE rc.currency = v_currency),
                0
            ) AS actual_revenue
        FROM geniusbot.revenue_conversions rc
        WHERE rc.clinic_id = p_clinic_id
          AND rc.converted_at >= v_start
          AND rc.converted_at < v_end
    ),
    transaction_summary AS (
        SELECT
            COALESCE(
                SUM(t.amount) FILTER (
                    WHERE t.status = 'paid'
                      AND t.currency = v_currency
                ),
                0
            ) AS paid_revenue
        FROM geniusbot.transactions t
        JOIN geniusbot.patients p
          ON p.id = t.patient_id
        WHERE p.clinic_id = p_clinic_id
          AND t.paid_at >= v_start
          AND t.paid_at < v_end
    )
    SELECT
        p_clinic_id,
        p_date_from,
        p_date_to,
        v_currency,
        a.total,
        a.pending,
        a.confirmed,
        a.completed,
        a.cancelled,
        a.no_show,
        c.total,
        c.handed_over,
        mc.total,
        mc.recovered,
        o.open_count,
        o.overdue_count,
        o.detected_count,
        o.converted_count,
        o.estimated_value,
        cv.actual_revenue,
        tx.paid_revenue,
        CASE
            WHEN a.total = 0 THEN 0::numeric
            ELSE ROUND(a.completed::numeric / a.total::numeric * 100, 2)
        END,
        CASE
            WHEN mc.total = 0 THEN 0::numeric
            ELSE ROUND(mc.recovered::numeric / mc.total::numeric * 100, 2)
        END,
        CASE
            WHEN o.detected_count = 0 THEN 0::numeric
            ELSE ROUND(o.converted_count::numeric / o.detected_count::numeric * 100, 2)
        END
    FROM appointment_summary a
    CROSS JOIN conversation_summary c
    CROSS JOIN missed_call_summary mc
    CROSS JOIN opportunity_summary o
    CROSS JOIN conversion_summary cv
    CROSS JOIN transaction_summary tx;
END;
$$;

-- ============================================================================
-- 11. REVENUE TREND FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION geniusbot.report_revenue_trend(
    p_clinic_id uuid,
    p_date_from date,
    p_date_to date,
    p_granularity text DEFAULT 'day'
)
RETURNS TABLE (
    period_start date,
    currency varchar,
    opportunities bigint,
    conversions bigint,
    estimated_opportunity_value numeric,
    actual_recovered_revenue numeric,
    paid_revenue numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_unit text;
    v_timezone text;
    v_start timestamptz;
    v_end timestamptz;
BEGIN
    IF p_clinic_id IS NULL THEN
        RAISE EXCEPTION 'p_clinic_id cannot be NULL.';
    END IF;

    IF p_date_from IS NULL OR p_date_to IS NULL THEN
        RAISE EXCEPTION 'Date range cannot contain NULL values.';
    END IF;

    IF p_date_to < p_date_from THEN
        RAISE EXCEPTION 'p_date_to must be greater than or equal to p_date_from.';
    END IF;

    v_unit := lower(coalesce(p_granularity, 'day'));

    IF v_unit NOT IN ('day', 'week', 'month') THEN
        RAISE EXCEPTION
            'Unsupported granularity: %. Allowed values: day, week, month.',
            p_granularity;
    END IF;

    SELECT c.timezone
      INTO v_timezone
      FROM geniusbot.clinics c
     WHERE c.id = p_clinic_id;

    IF v_timezone IS NULL THEN
        RAISE EXCEPTION 'Clinic % does not exist or has no timezone.', p_clinic_id;
    END IF;

    v_start := p_date_from::timestamp AT TIME ZONE v_timezone;
    v_end := (p_date_to + 1)::timestamp AT TIME ZONE v_timezone;

    RETURN QUERY
    WITH opportunity_data AS (
        SELECT
            date_trunc(
                v_unit,
                ro.first_detected_at AT TIME ZONE v_timezone
            )::date AS period,
            ro.currency,
            COUNT(*) AS opportunity_count,
            COALESCE(SUM(ro.estimated_value), 0) AS estimated_value
        FROM geniusbot.revenue_opportunities ro
        WHERE ro.clinic_id = p_clinic_id
          AND ro.first_detected_at >= v_start
          AND ro.first_detected_at < v_end
        GROUP BY
            date_trunc(
                v_unit,
                ro.first_detected_at AT TIME ZONE v_timezone
            )::date,
            ro.currency
    ),
    conversion_data AS (
        SELECT
            date_trunc(
                v_unit,
                rc.converted_at AT TIME ZONE v_timezone
            )::date AS period,
            rc.currency,
            COUNT(*) AS conversion_count,
            COALESCE(SUM(rc.actual_revenue), 0) AS actual_revenue
        FROM geniusbot.revenue_conversions rc
        WHERE rc.clinic_id = p_clinic_id
          AND rc.converted_at >= v_start
          AND rc.converted_at < v_end
        GROUP BY
            date_trunc(
                v_unit,
                rc.converted_at AT TIME ZONE v_timezone
            )::date,
            rc.currency
    ),
    transaction_data AS (
        SELECT
            date_trunc(
                v_unit,
                t.paid_at AT TIME ZONE v_timezone
            )::date AS period,
            t.currency,
            COALESCE(SUM(t.amount), 0) AS revenue
        FROM geniusbot.transactions t
        JOIN geniusbot.patients p
          ON p.id = t.patient_id
        WHERE p.clinic_id = p_clinic_id
          AND t.status = 'paid'
          AND t.paid_at >= v_start
          AND t.paid_at < v_end
        GROUP BY
            date_trunc(
                v_unit,
                t.paid_at AT TIME ZONE v_timezone
            )::date,
            t.currency
    ),
    keys AS (
        SELECT period, currency FROM opportunity_data
        UNION
        SELECT period, currency FROM conversion_data
        UNION
        SELECT period, currency FROM transaction_data
    )
    SELECT
        k.period,
        k.currency::varchar,
        COALESCE(o.opportunity_count, 0),
        COALESCE(cv.conversion_count, 0),
        COALESCE(o.estimated_value, 0),
        COALESCE(cv.actual_revenue, 0),
        COALESCE(t.revenue, 0)
    FROM keys k
    LEFT JOIN opportunity_data o
      ON o.period = k.period
     AND o.currency = k.currency
    LEFT JOIN conversion_data cv
      ON cv.period = k.period
     AND cv.currency = k.currency
    LEFT JOIN transaction_data t
      ON t.period = k.period
     AND t.currency = k.currency
    ORDER BY k.period, k.currency;
END;
$$;

-- ============================================================================
-- 12. DOCTOR PERFORMANCE FUNCTION
-- ============================================================================
CREATE FUNCTION geniusbot.report_doctor_performance_range(
    p_clinic_id uuid,
    p_date_from date,
    p_date_to date,
    p_currency varchar DEFAULT 'SAR'
)
RETURNS TABLE (
    doctor_id uuid,
    doctor_name varchar,
    currency varchar,
    total_appointments bigint,
    completed_appointments bigint,
    cancelled_appointments bigint,
    no_show_appointments bigint,
    completed_quoted_value numeric,
    completion_rate numeric,
    no_show_rate numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_timezone text;
    v_start timestamptz;
    v_end timestamptz;
    v_currency varchar;
BEGIN
    IF p_clinic_id IS NULL THEN
        RAISE EXCEPTION 'p_clinic_id cannot be NULL.';
    END IF;

    IF p_date_from IS NULL OR p_date_to IS NULL THEN
        RAISE EXCEPTION 'Date range cannot contain NULL values.';
    END IF;

    IF p_date_to < p_date_from THEN
        RAISE EXCEPTION 'p_date_to must be greater than or equal to p_date_from.';
    END IF;

    v_currency := upper(trim(coalesce(p_currency, 'SAR')));

    IF v_currency !~ '^[A-Z]{3,10}$' THEN
        RAISE EXCEPTION 'Invalid currency code: %.', p_currency;
    END IF;

    SELECT c.timezone
      INTO v_timezone
      FROM geniusbot.clinics c
     WHERE c.id = p_clinic_id;

    IF v_timezone IS NULL THEN
        RAISE EXCEPTION 'Clinic % does not exist or has no timezone.', p_clinic_id;
    END IF;

    v_start := p_date_from::timestamp AT TIME ZONE v_timezone;
    v_end := (p_date_to + 1)::timestamp AT TIME ZONE v_timezone;

    RETURN QUERY
    SELECT
        d.id,
        d.full_name,
        v_currency,
        COUNT(a.id),
        COUNT(a.id) FILTER (WHERE a.status = 'completed'),
        COUNT(a.id) FILTER (WHERE a.status = 'cancelled'),
        COUNT(a.id) FILTER (WHERE a.status = 'no_show'),
        COALESCE(
            SUM(a.quoted_price) FILTER (
                WHERE a.status = 'completed'
                  AND a.currency = v_currency
            ),
            0
        ),
        CASE
            WHEN COUNT(a.id) = 0 THEN 0::numeric
            ELSE ROUND(
                COUNT(a.id) FILTER (WHERE a.status = 'completed')::numeric
                / COUNT(a.id)::numeric * 100,
                2
            )
        END,
        CASE
            WHEN COUNT(a.id) = 0 THEN 0::numeric
            ELSE ROUND(
                COUNT(a.id) FILTER (WHERE a.status = 'no_show')::numeric
                / COUNT(a.id)::numeric * 100,
                2
            )
        END
    FROM geniusbot.doctors d
    LEFT JOIN geniusbot.appointments a
      ON a.doctor_id = d.id
     AND a.appointment_start >= v_start
     AND a.appointment_start < v_end
    WHERE d.clinic_id = p_clinic_id
    GROUP BY d.id, d.full_name
    ORDER BY
        completed_quoted_value DESC,
        total_appointments DESC,
        d.full_name;
END;
$$;

-- ============================================================================
-- 13. PATIENT REPORT FUNCTION
-- ============================================================================
CREATE FUNCTION geniusbot.report_patient_activity(
    p_clinic_id uuid,
    p_patient_id uuid,
    p_currency varchar DEFAULT 'SAR'
)
RETURNS TABLE (
    patient_id uuid,
    full_name varchar,
    phone_number varchar,
    currency varchar,
    total_appointments bigint,
    completed_appointments bigint,
    cancelled_appointments bigint,
    no_show_appointments bigint,
    total_conversations bigint,
    total_opportunities bigint,
    total_conversions bigint,
    recovered_revenue numeric,
    last_appointment_at timestamptz,
    next_appointment_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_currency varchar;
BEGIN
    IF p_clinic_id IS NULL OR p_patient_id IS NULL THEN
        RAISE EXCEPTION 'Clinic and patient IDs cannot be NULL.';
    END IF;

    v_currency := upper(trim(coalesce(p_currency, 'SAR')));

    IF v_currency !~ '^[A-Z]{3,10}$' THEN
        RAISE EXCEPTION 'Invalid currency code: %.', p_currency;
    END IF;

    RETURN QUERY
    SELECT
        s.patient_id,
        s.full_name,
        s.phone_number,
        v_currency,
        s.total_appointments,
        s.completed_appointments,
        s.cancelled_appointments,
        s.no_show_appointments,
        s.total_conversations,
        s.total_revenue_opportunities,
        s.total_revenue_conversions,
        COALESCE(
            (s.recovered_revenue_by_currency ->> v_currency)::numeric,
            0
        ),
        s.last_appointment_at,
        s.next_appointment_at
    FROM geniusbot.report_patient_summary s
    WHERE s.clinic_id = p_clinic_id
      AND s.patient_id = p_patient_id;
END;
$$;

-- ============================================================================
-- 14. REPORTING INDEXES ON OPERATIONAL TABLES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_start_status
    ON geniusbot.appointments (clinic_id, appointment_start, status);

CREATE INDEX IF NOT EXISTS idx_conversations_clinic_started_at
    ON geniusbot.conversations (clinic_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
    ON geniusbot.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_patient_paid_at_status
    ON geniusbot.transactions (patient_id, paid_at, status);

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_clinic_detected_at
    ON geniusbot.revenue_opportunities (clinic_id, first_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_conversions_clinic_currency_converted
    ON geniusbot.revenue_conversions (clinic_id, currency, converted_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_opportunity_started_at
    ON geniusbot.recovery_attempts (opportunity_id, started_at DESC);

-- ============================================================================
-- 15. FINAL VALIDATION
-- ============================================================================
DO $$
DECLARE
    required_view text;
    required_function text;
BEGIN
    FOREACH required_view IN ARRAY ARRAY[
        'report_appointment_facts',
        'report_conversation_facts',
        'report_missed_call_facts',
        'report_revenue_opportunity_facts',
        'report_recovery_attempt_facts',
        'report_revenue_conversion_facts',
        'report_patient_summary',
        'report_doctor_performance',
        'report_daily_clinic_kpis'
    ]
    LOOP
        IF to_regclass(format('geniusbot.%I', required_view)) IS NULL THEN
            RAISE EXCEPTION 'Reporting view geniusbot.% was not created.', required_view;
        END IF;
    END LOOP;

    FOREACH required_function IN ARRAY ARRAY[
        'geniusbot.report_dashboard_summary(uuid,date,date,character varying)',
        'geniusbot.report_revenue_trend(uuid,date,date,text)',
        'geniusbot.report_doctor_performance_range(uuid,date,date,character varying)',
        'geniusbot.report_patient_activity(uuid,uuid,character varying)'
    ]
    LOOP
        IF to_regprocedure(required_function) IS NULL THEN
            RAISE EXCEPTION 'Reporting function % was not created.', required_function;
        END IF;
    END LOOP;
END;
$$;

COMMIT;
