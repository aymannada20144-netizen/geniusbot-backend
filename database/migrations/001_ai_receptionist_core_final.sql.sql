-- ============================================================================
-- GeniusBot / Shaden
-- Migration: 001_ai_receptionist_core_final.sql
-- Purpose  : Revenue recovery, conversion tracking, abandoned booking recovery,
--            and patient reactivation.
-- Schema   : geniusbot
-- Notes    :
--   1. Does not modify or recreate any approved existing table.
--   2. Safe to run more than once.
--   3. Requires the existing geniusbot core schema.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT VALIDATION
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    required_table text;
BEGIN
    FOREACH required_table IN ARRAY ARRAY[
        'clinics',
        'branches',
        'patients',
        'conversations',
        'appointments',
        'services',
        'staff'
    ]
    LOOP
        IF to_regclass(format('geniusbot.%I', required_table)) IS NULL THEN
            RAISE EXCEPTION 'Required table geniusbot.% does not exist.', required_table;
        END IF;
    END LOOP;

    IF to_regprocedure('geniusbot.set_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'Required function geniusbot.set_updated_at() does not exist.';
    END IF;
END;
$$;

-- ============================================================================
-- 1. MISSED CALLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.missed_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    clinic_id uuid NOT NULL,
    branch_id uuid,

    caller_phone varchar(50) NOT NULL,
    patient_id uuid,
    conversation_id uuid,
    appointment_id uuid,

    provider_call_id text,
    called_at timestamp with time zone NOT NULL,

    recovery_status text NOT NULL DEFAULT 'pending',

    whatsapp_attempted_at timestamp with time zone,
    customer_replied_at timestamp with time zone,
    recovered_at timestamp with time zone,

    failure_reason text,
    raw_payload jsonb,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT missed_calls_recovery_status_check
        CHECK (
            recovery_status IN (
                'pending',
                'contacted',
                'replied',
                'booked',
                'failed',
                'ignored'
            )
        ),

    CONSTRAINT missed_calls_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT missed_calls_branch_id_fkey
        FOREIGN KEY (branch_id)
        REFERENCES geniusbot.branches(id)
        ON DELETE SET NULL,

    CONSTRAINT missed_calls_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE SET NULL,

    CONSTRAINT missed_calls_conversation_id_fkey
        FOREIGN KEY (conversation_id)
        REFERENCES geniusbot.conversations(id)
        ON DELETE SET NULL,

    CONSTRAINT missed_calls_appointment_id_fkey
        FOREIGN KEY (appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,

    CONSTRAINT missed_calls_recovered_at_check
        CHECK (recovered_at IS NULL OR recovered_at >= called_at),

    CONSTRAINT missed_calls_customer_replied_at_check
        CHECK (customer_replied_at IS NULL OR customer_replied_at >= called_at),

    CONSTRAINT missed_calls_whatsapp_attempted_at_check
        CHECK (whatsapp_attempted_at IS NULL OR whatsapp_attempted_at >= called_at)
);

CREATE INDEX IF NOT EXISTS idx_missed_calls_clinic_called_at
    ON geniusbot.missed_calls (clinic_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_missed_calls_recovery_status
    ON geniusbot.missed_calls (clinic_id, recovery_status);

CREATE INDEX IF NOT EXISTS idx_missed_calls_caller_phone
    ON geniusbot.missed_calls (clinic_id, caller_phone);

CREATE UNIQUE INDEX IF NOT EXISTS uq_missed_calls_provider_call_id
    ON geniusbot.missed_calls (clinic_id, provider_call_id)
    WHERE provider_call_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_missed_calls_updated_at ON geniusbot.missed_calls;
CREATE TRIGGER set_missed_calls_updated_at
    BEFORE UPDATE ON geniusbot.missed_calls
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 2. ABANDONED BOOKINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.booking_abandonments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    clinic_id uuid NOT NULL,
    patient_id uuid,
    conversation_id uuid NOT NULL,
    service_id uuid,
    doctor_id uuid,
    branch_id uuid,

    abandoned_state varchar(100) NOT NULL,
    collected_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    abandoned_at timestamp with time zone NOT NULL DEFAULT now(),

    recovery_status text NOT NULL DEFAULT 'pending',
    recovery_due_at timestamp with time zone,
    recovered_at timestamp with time zone,
    resulting_appointment_id uuid,
    failure_reason text,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT booking_abandonments_recovery_status_check
        CHECK (
            recovery_status IN (
                'pending',
                'scheduled',
                'contacted',
                'replied',
                'recovered',
                'failed',
                'cancelled'
            )
        ),

    CONSTRAINT booking_abandonments_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT booking_abandonments_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE SET NULL,

    CONSTRAINT booking_abandonments_conversation_id_fkey
        FOREIGN KEY (conversation_id)
        REFERENCES geniusbot.conversations(id)
        ON DELETE CASCADE,

    CONSTRAINT booking_abandonments_service_id_fkey
        FOREIGN KEY (service_id)
        REFERENCES geniusbot.services(id)
        ON DELETE SET NULL,

    CONSTRAINT booking_abandonments_doctor_id_fkey
        FOREIGN KEY (doctor_id)
        REFERENCES geniusbot.doctors(id)
        ON DELETE SET NULL,

    CONSTRAINT booking_abandonments_branch_id_fkey
        FOREIGN KEY (branch_id)
        REFERENCES geniusbot.branches(id)
        ON DELETE SET NULL,

    CONSTRAINT booking_abandonments_resulting_appointment_id_fkey
        FOREIGN KEY (resulting_appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,

    CONSTRAINT booking_abandonments_recovered_at_check
        CHECK (recovered_at IS NULL OR recovered_at >= abandoned_at)
);

CREATE INDEX IF NOT EXISTS idx_booking_abandonments_due
    ON geniusbot.booking_abandonments (clinic_id, recovery_status, recovery_due_at)
    WHERE recovery_status IN ('pending', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_booking_abandonments_conversation
    ON geniusbot.booking_abandonments (conversation_id, abandoned_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_abandonments_patient
    ON geniusbot.booking_abandonments (clinic_id, patient_id, abandoned_at DESC)
    WHERE patient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_abandonments_active_conversation
    ON geniusbot.booking_abandonments (conversation_id)
    WHERE recovery_status IN ('pending', 'scheduled', 'contacted', 'replied');

DROP TRIGGER IF EXISTS set_booking_abandonments_updated_at ON geniusbot.booking_abandonments;
CREATE TRIGGER set_booking_abandonments_updated_at
    BEFORE UPDATE ON geniusbot.booking_abandonments
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 3. REACTIVATION CAMPAIGNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.reactivation_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    clinic_id uuid NOT NULL,
    name varchar(255) NOT NULL,
    description text,

    campaign_type text NOT NULL DEFAULT 'inactive_patient',
    segment_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
    message_template_key varchar(100),

    status text NOT NULL DEFAULT 'draft',
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,

    created_by_staff_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT reactivation_campaigns_campaign_type_check
        CHECK (
            campaign_type IN (
                'inactive_patient',
                'service_due',
                'no_show_recovery',
                'cancelled_appointment',
                'custom'
            )
        ),

    CONSTRAINT reactivation_campaigns_status_check
        CHECK (
            status IN (
                'draft',
                'scheduled',
                'running',
                'paused',
                'completed',
                'cancelled'
            )
        ),

    CONSTRAINT reactivation_campaigns_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT reactivation_campaigns_created_by_staff_id_fkey
        FOREIGN KEY (created_by_staff_id)
        REFERENCES geniusbot.staff(id)
        ON DELETE SET NULL,

    CONSTRAINT reactivation_campaigns_started_at_check
        CHECK (started_at IS NULL OR scheduled_at IS NULL OR started_at >= scheduled_at),

    CONSTRAINT reactivation_campaigns_completed_at_check
        CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_reactivation_campaigns_status
    ON geniusbot.reactivation_campaigns (clinic_id, status, scheduled_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reactivation_campaigns_name
    ON geniusbot.reactivation_campaigns (clinic_id, name);

DROP TRIGGER IF EXISTS set_reactivation_campaigns_updated_at ON geniusbot.reactivation_campaigns;
CREATE TRIGGER set_reactivation_campaigns_updated_at
    BEFORE UPDATE ON geniusbot.reactivation_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 4. REVENUE OPPORTUNITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.revenue_opportunities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    clinic_id uuid NOT NULL,
    patient_id uuid,
    conversation_id uuid,
    appointment_id uuid,

    missed_call_id uuid,
    booking_abandonment_id uuid,

    source_type text NOT NULL,
    stage text NOT NULL DEFAULT 'new',
    priority text NOT NULL DEFAULT 'normal',

    estimated_value numeric(12, 2),
    recovered_value numeric(12, 2),
    currency varchar(10) NOT NULL DEFAULT 'SAR',

    first_detected_at timestamp with time zone NOT NULL DEFAULT now(),
    next_action_at timestamp with time zone,
    converted_at timestamp with time zone,
    closed_at timestamp with time zone,
    lost_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT revenue_opportunities_source_type_check
        CHECK (
            source_type IN (
                'missed_call',
                'unanswered_message',
                'abandoned_booking',
                'no_show',
                'cancelled_appointment',
                'inactive_patient',
                'manual'
            )
        ),

    CONSTRAINT revenue_opportunities_stage_check
        CHECK (
            stage IN (
                'new',
                'contact_pending',
                'contacted',
                'engaged',
                'booking_started',
                'booked',
                'attended',
                'lost',
                'closed'
            )
        ),

    CONSTRAINT revenue_opportunities_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    CONSTRAINT revenue_opportunities_estimated_value_check
        CHECK (estimated_value IS NULL OR estimated_value >= 0),

    CONSTRAINT revenue_opportunities_recovered_value_check
        CHECK (recovered_value IS NULL OR recovered_value >= 0),

    CONSTRAINT revenue_opportunities_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT revenue_opportunities_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE SET NULL,

    CONSTRAINT revenue_opportunities_conversation_id_fkey
        FOREIGN KEY (conversation_id)
        REFERENCES geniusbot.conversations(id)
        ON DELETE SET NULL,

    CONSTRAINT revenue_opportunities_appointment_id_fkey
        FOREIGN KEY (appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,

    CONSTRAINT revenue_opportunities_missed_call_id_fkey
        FOREIGN KEY (missed_call_id)
        REFERENCES geniusbot.missed_calls(id)
        ON DELETE SET NULL,

    CONSTRAINT revenue_opportunities_booking_abandonment_id_fkey
        FOREIGN KEY (booking_abandonment_id)
        REFERENCES geniusbot.booking_abandonments(id)
        ON DELETE SET NULL,

    CONSTRAINT revenue_opportunities_source_reference_check
        CHECK (
            (source_type = 'missed_call' AND missed_call_id IS NOT NULL)
            OR
            (source_type = 'abandoned_booking' AND booking_abandonment_id IS NOT NULL)
            OR
            (source_type NOT IN ('missed_call', 'abandoned_booking'))
        ),

    CONSTRAINT revenue_opportunities_converted_at_check
        CHECK (converted_at IS NULL OR converted_at >= first_detected_at),

    CONSTRAINT revenue_opportunities_closed_at_check
        CHECK (closed_at IS NULL OR closed_at >= first_detected_at)
);

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_pipeline
    ON geniusbot.revenue_opportunities (clinic_id, stage, priority, next_action_at);

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_patient
    ON geniusbot.revenue_opportunities (clinic_id, patient_id, first_detected_at DESC)
    WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_conversion
    ON geniusbot.revenue_opportunities (clinic_id, converted_at DESC)
    WHERE converted_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_opportunities_missed_call
    ON geniusbot.revenue_opportunities (missed_call_id)
    WHERE missed_call_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_opportunities_booking_abandonment
    ON geniusbot.revenue_opportunities (booking_abandonment_id)
    WHERE booking_abandonment_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_revenue_opportunities_updated_at ON geniusbot.revenue_opportunities;
CREATE TRIGGER set_revenue_opportunities_updated_at
    BEFORE UPDATE ON geniusbot.revenue_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 5. REACTIVATION TARGETS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.reactivation_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    campaign_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    opportunity_id uuid,

    eligibility_reason text,
    last_appointment_id uuid,
    last_visit_at timestamp with time zone,

    status text NOT NULL DEFAULT 'pending',
    scheduled_at timestamp with time zone,
    contacted_at timestamp with time zone,
    replied_at timestamp with time zone,
    converted_at timestamp with time zone,
    resulting_appointment_id uuid,
    exclusion_reason text,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT reactivation_targets_status_check
        CHECK (
            status IN (
                'pending',
                'scheduled',
                'contacted',
                'replied',
                'converted',
                'not_interested',
                'unreachable',
                'excluded',
                'cancelled'
            )
        ),

    CONSTRAINT reactivation_targets_campaign_id_fkey
        FOREIGN KEY (campaign_id)
        REFERENCES geniusbot.reactivation_campaigns(id)
        ON DELETE CASCADE,

    CONSTRAINT reactivation_targets_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT reactivation_targets_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE CASCADE,

    CONSTRAINT reactivation_targets_opportunity_id_fkey
        FOREIGN KEY (opportunity_id)
        REFERENCES geniusbot.revenue_opportunities(id)
        ON DELETE SET NULL,

    CONSTRAINT reactivation_targets_last_appointment_id_fkey
        FOREIGN KEY (last_appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,

    CONSTRAINT reactivation_targets_resulting_appointment_id_fkey
        FOREIGN KEY (resulting_appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,

    CONSTRAINT reactivation_targets_replied_at_check
        CHECK (replied_at IS NULL OR contacted_at IS NULL OR replied_at >= contacted_at),

    CONSTRAINT reactivation_targets_converted_at_check
        CHECK (converted_at IS NULL OR contacted_at IS NULL OR converted_at >= contacted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reactivation_targets_campaign_patient
    ON geniusbot.reactivation_targets (campaign_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_reactivation_targets_due
    ON geniusbot.reactivation_targets (campaign_id, status, scheduled_at)
    WHERE status IN ('pending', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_reactivation_targets_patient
    ON geniusbot.reactivation_targets (clinic_id, patient_id, created_at DESC);

DROP TRIGGER IF EXISTS set_reactivation_targets_updated_at ON geniusbot.reactivation_targets;
CREATE TRIGGER set_reactivation_targets_updated_at
    BEFORE UPDATE ON geniusbot.reactivation_targets
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 6. RECOVERY ATTEMPTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.recovery_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    clinic_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    conversation_id uuid,
    notification_log_id uuid,

    attempt_number integer NOT NULL,
    channel varchar(50) NOT NULL DEFAULT 'whatsapp',
    attempt_type text NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',

    scheduled_at timestamp with time zone,
    attempted_at timestamp with time zone,
    replied_at timestamp with time zone,

    provider_message_id text,
    failure_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT recovery_attempts_attempt_number_check
        CHECK (attempt_number > 0),

    CONSTRAINT recovery_attempts_channel_check
        CHECK (channel IN ('whatsapp', 'sms', 'email', 'phone', 'dashboard')),

    CONSTRAINT recovery_attempts_attempt_type_check
        CHECK (
            attempt_type IN (
                'missed_call_recovery',
                'unanswered_message_followup',
                'abandoned_booking_followup',
                'no_show_recovery',
                'cancelled_appointment_recovery',
                'patient_reactivation',
                'manual_followup'
            )
        ),

    CONSTRAINT recovery_attempts_status_check
        CHECK (
            status IN (
                'scheduled',
                'processing',
                'sent',
                'delivered',
                'replied',
                'failed',
                'cancelled'
            )
        ),

    CONSTRAINT recovery_attempts_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT recovery_attempts_opportunity_id_fkey
        FOREIGN KEY (opportunity_id)
        REFERENCES geniusbot.revenue_opportunities(id)
        ON DELETE CASCADE,

    CONSTRAINT recovery_attempts_conversation_id_fkey
        FOREIGN KEY (conversation_id)
        REFERENCES geniusbot.conversations(id)
        ON DELETE SET NULL,

    CONSTRAINT recovery_attempts_notification_log_id_fkey
        FOREIGN KEY (notification_log_id)
        REFERENCES geniusbot.notification_logs(id)
        ON DELETE SET NULL,

    CONSTRAINT recovery_attempts_attempted_at_check
        CHECK (attempted_at IS NULL OR scheduled_at IS NULL OR attempted_at >= scheduled_at),

    CONSTRAINT recovery_attempts_replied_at_check
        CHECK (replied_at IS NULL OR attempted_at IS NULL OR replied_at >= attempted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_attempts_opportunity_number
    ON geniusbot.recovery_attempts (opportunity_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_due
    ON geniusbot.recovery_attempts (clinic_id, status, scheduled_at)
    WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_provider_message
    ON geniusbot.recovery_attempts (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_recovery_attempts_updated_at ON geniusbot.recovery_attempts;
CREATE TRIGGER set_recovery_attempts_updated_at
    BEFORE UPDATE ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 7. OPPORTUNITY EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.opportunity_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    clinic_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    patient_id uuid,
    conversation_id uuid,
    appointment_id uuid,
    recovery_attempt_id uuid,

    event_type text NOT NULL,
    previous_stage text,
    new_stage text,
    event_value numeric(12, 2),
    currency varchar(10) NOT NULL DEFAULT 'SAR',
    event_data jsonb NOT NULL DEFAULT '{}'::jsonb,

    occurred_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT opportunity_events_event_type_check
        CHECK (
            event_type IN (
                'detected',
                'contact_scheduled',
                'contact_attempted',
                'message_sent',
                'message_delivered',
                'customer_replied',
                'booking_started',
                'booking_abandoned',
                'appointment_booked',
                'appointment_confirmed',
                'appointment_rescheduled',
                'appointment_cancelled',
                'appointment_no_show',
                'appointment_attended',
                'revenue_recovered',
                'lost',
                'closed'
            )
        ),

    CONSTRAINT opportunity_events_previous_stage_check
        CHECK (
            previous_stage IS NULL OR previous_stage IN (
                'new',
                'contact_pending',
                'contacted',
                'engaged',
                'booking_started',
                'booked',
                'attended',
                'lost',
                'closed'
            )
        ),

    CONSTRAINT opportunity_events_new_stage_check
        CHECK (
            new_stage IS NULL OR new_stage IN (
                'new',
                'contact_pending',
                'contacted',
                'engaged',
                'booking_started',
                'booked',
                'attended',
                'lost',
                'closed'
            )
        ),

    CONSTRAINT opportunity_events_event_value_check
        CHECK (event_value IS NULL OR event_value >= 0),

    CONSTRAINT opportunity_events_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE CASCADE,

    CONSTRAINT opportunity_events_opportunity_id_fkey
        FOREIGN KEY (opportunity_id)
        REFERENCES geniusbot.revenue_opportunities(id)
        ON DELETE CASCADE,

    CONSTRAINT opportunity_events_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE SET NULL,

    CONSTRAINT opportunity_events_conversation_id_fkey
        FOREIGN KEY (conversation_id)
        REFERENCES geniusbot.conversations(id)
        ON DELETE SET NULL,

    CONSTRAINT opportunity_events_appointment_id_fkey
        FOREIGN KEY (appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,

    CONSTRAINT opportunity_events_recovery_attempt_id_fkey
        FOREIGN KEY (recovery_attempt_id)
        REFERENCES geniusbot.recovery_attempts(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunity_events_timeline
    ON geniusbot.opportunity_events (opportunity_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS idx_opportunity_events_roi
    ON geniusbot.opportunity_events (clinic_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_events_appointment
    ON geniusbot.opportunity_events (appointment_id, occurred_at DESC)
    WHERE appointment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- DOCUMENTATION COMMENTS
-- ---------------------------------------------------------------------------
COMMENT ON TABLE geniusbot.missed_calls IS
    'Inbound missed calls and their WhatsApp recovery outcome.';

COMMENT ON TABLE geniusbot.booking_abandonments IS
    'Booking flows started but not completed, including captured state for recovery.';

COMMENT ON TABLE geniusbot.reactivation_campaigns IS
    'Campaign definitions for re-engaging inactive, no-show, or cancelled patients.';

COMMENT ON TABLE geniusbot.revenue_opportunities IS
    'Unified revenue opportunity pipeline for missed calls, abandoned bookings, no-shows, cancellations, and reactivation.';

COMMENT ON TABLE geniusbot.reactivation_targets IS
    'Patients selected for a reactivation campaign and their individual outcomes.';

COMMENT ON TABLE geniusbot.recovery_attempts IS
    'Each scheduled or executed contact attempt made to recover a revenue opportunity.';

COMMENT ON TABLE geniusbot.opportunity_events IS
    'Immutable event timeline used to measure opportunity conversion and recovered revenue.';

-- ---------------------------------------------------------------------------
-- FINAL VALIDATION
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    required_new_table text;
BEGIN
    FOREACH required_new_table IN ARRAY ARRAY[
        'missed_calls',
        'booking_abandonments',
        'reactivation_campaigns',
        'revenue_opportunities',
        'reactivation_targets',
        'recovery_attempts',
        'opportunity_events'
    ]
    LOOP
        IF to_regclass(format('geniusbot.%I', required_new_table)) IS NULL THEN
            RAISE EXCEPTION 'Migration validation failed: geniusbot.% was not created.', required_new_table;
        END IF;
    END LOOP;
END;
$$;

COMMIT;

-- Human-readable validation result.
SELECT
    table_name,
    CASE WHEN to_regclass(format('geniusbot.%I', table_name)) IS NOT NULL
         THEN 'OK'
         ELSE 'MISSING'
    END AS validation_status
FROM unnest(ARRAY[
    'missed_calls',
    'booking_abandonments',
    'reactivation_campaigns',
    'revenue_opportunities',
    'reactivation_targets',
    'recovery_attempts',
    'opportunity_events'
]) AS table_name;
