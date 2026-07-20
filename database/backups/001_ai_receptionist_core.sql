BEGIN;

CREATE SCHEMA IF NOT EXISTS geniusbot;

-- =========================================================
-- AI RECEPTIONIST CORE
-- Migration: 001_ai_receptionist_core.sql
-- =========================================================

-- =========================================================
-- Updated-at trigger function
-- =========================================================

CREATE OR REPLACE FUNCTION geniusbot.set_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- 1. Assistant Profiles
-- Identity, personality and communication configuration.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.assistant_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,

  assistant_name varchar(100) NOT NULL DEFAULT 'المساعدة الرقمية',
  display_name varchar(150),

  language varchar(10) NOT NULL DEFAULT 'ar',
  locale varchar(20) NOT NULL DEFAULT 'ar-SA',

  tone varchar(50) NOT NULL DEFAULT 'professional_friendly',
  persona_description text,

  welcome_message text,
  fallback_message text,
  handoff_message text,
  booking_confirmation_message text,

  allowed_emojis text[] NOT NULL DEFAULT ARRAY['🌸', '✨']::text[],
  use_emojis boolean NOT NULL DEFAULT true,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assistant_profiles_clinic_id_key
    UNIQUE (clinic_id),

  CONSTRAINT assistant_profiles_assistant_name_not_blank
    CHECK (length(btrim(assistant_name)) > 0),

  CONSTRAINT assistant_profiles_language_not_blank
    CHECK (length(btrim(language)) > 0),

  CONSTRAINT assistant_profiles_locale_not_blank
    CHECK (length(btrim(locale)) > 0),

  CONSTRAINT assistant_profiles_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assistant_profiles_active
  ON geniusbot.assistant_profiles (clinic_id, is_active);

DROP TRIGGER IF EXISTS trg_assistant_profiles_updated_at
  ON geniusbot.assistant_profiles;

CREATE TRIGGER trg_assistant_profiles_updated_at
BEFORE UPDATE ON geniusbot.assistant_profiles
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 2. Conversation Policies
-- Controls conversational behavior without hardcoding it.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.conversation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,

  greeting_once_per_conversation boolean NOT NULL DEFAULT true,
  ask_name_only_on_booking_intent boolean NOT NULL DEFAULT true,
  ask_phone_only_on_booking_intent boolean NOT NULL DEFAULT true,

  allow_medical_diagnosis boolean NOT NULL DEFAULT false,
  allow_treatment_instructions boolean NOT NULL DEFAULT false,
  allow_price_disclosure boolean NOT NULL DEFAULT false,

  resume_interrupted_flow boolean NOT NULL DEFAULT true,
  remember_patient_data boolean NOT NULL DEFAULT true,
  offer_previous_contact_reuse boolean NOT NULL DEFAULT true,

  maximum_ai_history_messages integer NOT NULL DEFAULT 20,
  conversation_idle_timeout_minutes integer NOT NULL DEFAULT 60,

  unknown_answer_action varchar(30) NOT NULL DEFAULT 'handoff',
  unsupported_request_action varchar(30) NOT NULL DEFAULT 'handoff',

  custom_rules jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversation_policies_clinic_id_key
    UNIQUE (clinic_id),

  CONSTRAINT conversation_policies_history_limit_check
    CHECK (
      maximum_ai_history_messages >= 2
      AND maximum_ai_history_messages <= 200
    ),

  CONSTRAINT conversation_policies_idle_timeout_check
    CHECK (
      conversation_idle_timeout_minutes >= 5
      AND conversation_idle_timeout_minutes <= 10080
    ),

  CONSTRAINT conversation_policies_unknown_action_check
    CHECK (
      unknown_answer_action IN (
        'handoff',
        'fallback',
        'collect_contact',
        'close'
      )
    ),

  CONSTRAINT conversation_policies_unsupported_action_check
    CHECK (
      unsupported_request_action IN (
        'handoff',
        'fallback',
        'collect_contact',
        'close'
      )
    ),

  CONSTRAINT conversation_policies_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_policies_active
  ON geniusbot.conversation_policies (clinic_id, is_active);

DROP TRIGGER IF EXISTS trg_conversation_policies_updated_at
  ON geniusbot.conversation_policies;

CREATE TRIGGER trg_conversation_policies_updated_at
BEFORE UPDATE ON geniusbot.conversation_policies
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 3. Booking Policies
-- Configurable booking values; enforcement remains Backend-owned.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.booking_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,

  minimum_booking_notice_minutes integer NOT NULL DEFAULT 0,
  maximum_booking_days_ahead integer NOT NULL DEFAULT 90,

  cancellation_deadline_hours integer NOT NULL DEFAULT 24,
  reschedule_deadline_hours integer NOT NULL DEFAULT 24,

  require_patient_name boolean NOT NULL DEFAULT true,
  require_patient_phone boolean NOT NULL DEFAULT true,
  require_payment_method boolean NOT NULL DEFAULT true,

  require_booking_review boolean NOT NULL DEFAULT true,
  allow_same_day_booking boolean NOT NULL DEFAULT true,
  allow_patient_contact_reuse boolean NOT NULL DEFAULT true,

  default_appointment_status varchar(30) NOT NULL DEFAULT 'pending',

  custom_rules jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_policies_clinic_id_key
    UNIQUE (clinic_id),

  CONSTRAINT booking_policies_minimum_notice_check
    CHECK (
      minimum_booking_notice_minutes >= 0
      AND minimum_booking_notice_minutes <= 525600
    ),

  CONSTRAINT booking_policies_maximum_days_check
    CHECK (
      maximum_booking_days_ahead >= 1
      AND maximum_booking_days_ahead <= 730
    ),

  CONSTRAINT booking_policies_cancellation_deadline_check
    CHECK (
      cancellation_deadline_hours >= 0
      AND cancellation_deadline_hours <= 8760
    ),

  CONSTRAINT booking_policies_reschedule_deadline_check
    CHECK (
      reschedule_deadline_hours >= 0
      AND reschedule_deadline_hours <= 8760
    ),

  CONSTRAINT booking_policies_default_status_check
    CHECK (
      default_appointment_status IN (
        'pending',
        'confirmed'
      )
    ),

  CONSTRAINT booking_policies_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_booking_policies_active
  ON geniusbot.booking_policies (clinic_id, is_active);

DROP TRIGGER IF EXISTS trg_booking_policies_updated_at
  ON geniusbot.booking_policies;

CREATE TRIGGER trg_booking_policies_updated_at
BEFORE UPDATE ON geniusbot.booking_policies
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 4. Clinic Channels
-- External communication and call-provider connections.
-- No raw secrets are stored here.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.clinic_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,
  branch_id uuid,

  channel_type varchar(30) NOT NULL,
  provider varchar(50) NOT NULL,

  channel_name varchar(150),

  external_account_id varchar(255),
  external_phone_number_id varchar(255),
  phone_number varchar(50),

  webhook_identifier varchar(255),
  credential_reference varchar(255),

  supports_inbound boolean NOT NULL DEFAULT true,
  supports_outbound boolean NOT NULL DEFAULT true,
  supports_missed_calls boolean NOT NULL DEFAULT false,

  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clinic_channels_channel_type_check
    CHECK (
      channel_type IN (
        'whatsapp',
        'phone',
        'sms',
        'email',
        'web_chat'
      )
    ),

  CONSTRAINT clinic_channels_provider_not_blank
    CHECK (length(btrim(provider)) > 0),

  CONSTRAINT clinic_channels_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE,

  CONSTRAINT clinic_channels_branch_id_fkey
    FOREIGN KEY (branch_id)
    REFERENCES geniusbot.branches(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clinic_channels_lookup
  ON geniusbot.clinic_channels (
    clinic_id,
    channel_type,
    is_active
  );

CREATE INDEX IF NOT EXISTS idx_clinic_channels_phone
  ON geniusbot.clinic_channels (phone_number)
  WHERE phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_channels_external_phone
  ON geniusbot.clinic_channels (
    provider,
    external_phone_number_id
  )
  WHERE external_phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_channels_primary
  ON geniusbot.clinic_channels (
    clinic_id,
    channel_type
  )
  WHERE is_primary = true
    AND is_active = true;

DROP TRIGGER IF EXISTS trg_clinic_channels_updated_at
  ON geniusbot.clinic_channels;

CREATE TRIGGER trg_clinic_channels_updated_at
BEFORE UPDATE ON geniusbot.clinic_channels
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 5. Handoff Rules
-- Rules for transferring a conversation to clinic staff.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.handoff_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,
  branch_id uuid,

  rule_name varchar(150) NOT NULL,
  trigger_type varchar(50) NOT NULL,

  trigger_value text,
  trigger_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,

  priority integer NOT NULL DEFAULT 100,

  target_role varchar(50) NOT NULL DEFAULT 'receptionist',
  target_staff_id uuid,

  handoff_message text,

  stop_bot_after_handoff boolean NOT NULL DEFAULT true,
  notify_staff boolean NOT NULL DEFAULT true,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT handoff_rules_clinic_name_key
    UNIQUE (clinic_id, rule_name),

  CONSTRAINT handoff_rules_trigger_type_check
    CHECK (
      trigger_type IN (
        'unknown_answer',
        'medical_request',
        'complaint',
        'angry_customer',
        'explicit_human_request',
        'booking_failure',
        'payment_issue',
        'insurance_issue',
        'custom_intent',
        'keyword',
        'maximum_attempts'
      )
    ),

  CONSTRAINT handoff_rules_priority_check
    CHECK (priority >= 0),

  CONSTRAINT handoff_rules_target_role_not_blank
    CHECK (length(btrim(target_role)) > 0),

  CONSTRAINT handoff_rules_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE,

  CONSTRAINT handoff_rules_branch_id_fkey
    FOREIGN KEY (branch_id)
    REFERENCES geniusbot.branches(id)
    ON DELETE SET NULL,

  CONSTRAINT handoff_rules_target_staff_id_fkey
    FOREIGN KEY (target_staff_id)
    REFERENCES geniusbot.staff(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_handoff_rules_lookup
  ON geniusbot.handoff_rules (
    clinic_id,
    trigger_type,
    is_active,
    priority
  );

DROP TRIGGER IF EXISTS trg_handoff_rules_updated_at
  ON geniusbot.handoff_rules;

CREATE TRIGGER trg_handoff_rules_updated_at
BEFORE UPDATE ON geniusbot.handoff_rules
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 6. Missed Call Events
-- Commercial core: every missed call becomes a traceable lead.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.missed_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,
  branch_id uuid,
  channel_id uuid,

  provider_event_id varchar(255),

  caller_phone varchar(50) NOT NULL,
  called_phone varchar(50),

  patient_id uuid,

  call_started_at timestamptz NOT NULL,
  call_ended_at timestamptz,

  ring_duration_seconds integer,

  event_status varchar(30) NOT NULL DEFAULT 'received',
  recovery_status varchar(30) NOT NULL DEFAULT 'pending',

  conversation_id uuid,
  recovered_appointment_id uuid,

  recovered_revenue numeric(12, 2),
  currency varchar(10) NOT NULL DEFAULT 'SAR',

  failure_reason text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  first_recovery_attempt_at timestamptz,
  customer_replied_at timestamptz,
  converted_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT missed_call_events_caller_phone_not_blank
    CHECK (length(btrim(caller_phone)) > 0),

  CONSTRAINT missed_call_events_time_check
    CHECK (
      call_ended_at IS NULL
      OR call_ended_at >= call_started_at
    ),

  CONSTRAINT missed_call_events_ring_duration_check
    CHECK (
      ring_duration_seconds IS NULL
      OR ring_duration_seconds >= 0
    ),

  CONSTRAINT missed_call_events_event_status_check
    CHECK (
      event_status IN (
        'received',
        'validated',
        'ignored',
        'duplicate',
        'failed'
      )
    ),

  CONSTRAINT missed_call_events_recovery_status_check
    CHECK (
      recovery_status IN (
        'pending',
        'scheduled',
        'contacted',
        'replied',
        'booking_started',
        'converted',
        'not_interested',
        'opted_out',
        'expired',
        'failed',
        'cancelled'
      )
    ),

  CONSTRAINT missed_call_events_revenue_check
    CHECK (
      recovered_revenue IS NULL
      OR recovered_revenue >= 0
    ),

  CONSTRAINT missed_call_events_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE,

  CONSTRAINT missed_call_events_branch_id_fkey
    FOREIGN KEY (branch_id)
    REFERENCES geniusbot.branches(id)
    ON DELETE SET NULL,

  CONSTRAINT missed_call_events_channel_id_fkey
    FOREIGN KEY (channel_id)
    REFERENCES geniusbot.clinic_channels(id)
    ON DELETE SET NULL,

  CONSTRAINT missed_call_events_patient_id_fkey
    FOREIGN KEY (patient_id)
    REFERENCES geniusbot.patients(id)
    ON DELETE SET NULL,

  CONSTRAINT missed_call_events_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES geniusbot.conversations(id)
    ON DELETE SET NULL,

  CONSTRAINT missed_call_events_appointment_id_fkey
    FOREIGN KEY (recovered_appointment_id)
    REFERENCES geniusbot.appointments(id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_missed_call_provider_event
  ON geniusbot.missed_call_events (
    clinic_id,
    provider_event_id
  )
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_missed_call_events_recovery_queue
  ON geniusbot.missed_call_events (
    clinic_id,
    recovery_status,
    call_started_at
  );

CREATE INDEX IF NOT EXISTS idx_missed_call_events_phone
  ON geniusbot.missed_call_events (
    clinic_id,
    caller_phone,
    call_started_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_missed_call_events_appointment
  ON geniusbot.missed_call_events (recovered_appointment_id)
  WHERE recovered_appointment_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_missed_call_events_updated_at
  ON geniusbot.missed_call_events;

CREATE TRIGGER trg_missed_call_events_updated_at
BEFORE UPDATE ON geniusbot.missed_call_events
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 7. Recovery Attempts
-- Every outbound attempt is independently auditable.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,
  missed_call_event_id uuid NOT NULL,

  channel_id uuid,
  conversation_id uuid,

  attempt_number integer NOT NULL,

  attempt_type varchar(30) NOT NULL DEFAULT 'initial',
  channel_type varchar(30) NOT NULL DEFAULT 'whatsapp',

  template_key varchar(100),
  recipient varchar(100) NOT NULL,

  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,

  status varchar(30) NOT NULL DEFAULT 'scheduled',

  provider_message_id varchar(255),
  failure_code varchar(100),
  failure_reason text,

  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT recovery_attempts_event_number_key
    UNIQUE (missed_call_event_id, attempt_number),

  CONSTRAINT recovery_attempts_attempt_number_check
    CHECK (attempt_number >= 1),

  CONSTRAINT recovery_attempts_attempt_type_check
    CHECK (
      attempt_type IN (
        'initial',
        'retry',
        'follow_up',
        'manual'
      )
    ),

  CONSTRAINT recovery_attempts_channel_type_check
    CHECK (
      channel_type IN (
        'whatsapp',
        'sms',
        'phone',
        'email'
      )
    ),

  CONSTRAINT recovery_attempts_status_check
    CHECK (
      status IN (
        'scheduled',
        'processing',
        'sent',
        'delivered',
        'read',
        'replied',
        'failed',
        'cancelled',
        'skipped'
      )
    ),

  CONSTRAINT recovery_attempts_recipient_not_blank
    CHECK (length(btrim(recipient)) > 0),

  CONSTRAINT recovery_attempts_time_order_check
    CHECK (
      sent_at IS NULL
      OR started_at IS NULL
      OR sent_at >= started_at
    ),

  CONSTRAINT recovery_attempts_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE,

  CONSTRAINT recovery_attempts_missed_call_event_id_fkey
    FOREIGN KEY (missed_call_event_id)
    REFERENCES geniusbot.missed_call_events(id)
    ON DELETE CASCADE,

  CONSTRAINT recovery_attempts_channel_id_fkey
    FOREIGN KEY (channel_id)
    REFERENCES geniusbot.clinic_channels(id)
    ON DELETE SET NULL,

  CONSTRAINT recovery_attempts_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES geniusbot.conversations(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_queue
  ON geniusbot.recovery_attempts (
    status,
    scheduled_at
  );

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_event
  ON geniusbot.recovery_attempts (
    missed_call_event_id,
    attempt_number
  );

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_provider_message
  ON geniusbot.recovery_attempts (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_recovery_attempts_updated_at
  ON geniusbot.recovery_attempts;

CREATE TRIGGER trg_recovery_attempts_updated_at
BEFORE UPDATE ON geniusbot.recovery_attempts
FOR EACH ROW
EXECUTE FUNCTION geniusbot.set_updated_at_column();

-- =========================================================
-- 8. Conversation Tags
-- Lightweight classification for monitoring and analytics.
-- =========================================================

CREATE TABLE IF NOT EXISTS geniusbot.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  clinic_id uuid NOT NULL,
  conversation_id uuid NOT NULL,

  tag varchar(100) NOT NULL,
  source varchar(30) NOT NULL DEFAULT 'system',

  confidence numeric(5, 4),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by_staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversation_tags_conversation_tag_key
    UNIQUE (conversation_id, tag),

  CONSTRAINT conversation_tags_tag_not_blank
    CHECK (length(btrim(tag)) > 0),

  CONSTRAINT conversation_tags_source_check
    CHECK (
      source IN (
        'system',
        'ai',
        'staff',
        'integration'
      )
    ),

  CONSTRAINT conversation_tags_confidence_check
    CHECK (
      confidence IS NULL
      OR (
        confidence >= 0
        AND confidence <= 1
      )
    ),

  CONSTRAINT conversation_tags_clinic_id_fkey
    FOREIGN KEY (clinic_id)
    REFERENCES geniusbot.clinics(id)
    ON DELETE CASCADE,

  CONSTRAINT conversation_tags_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES geniusbot.conversations(id)
    ON DELETE CASCADE,

  CONSTRAINT conversation_tags_created_by_staff_id_fkey
    FOREIGN KEY (created_by_staff_id)
    REFERENCES geniusbot.staff(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_lookup
  ON geniusbot.conversation_tags (
    clinic_id,
    tag,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation
  ON geniusbot.conversation_tags (conversation_id);

-- =========================================================
-- Seed default AI receptionist configuration for existing clinics
-- Idempotent.
-- =========================================================

INSERT INTO geniusbot.assistant_profiles (
  clinic_id,
  assistant_name,
  display_name,
  language,
  locale,
  tone,
  persona_description,
  welcome_message,
  fallback_message,
  handoff_message
)
SELECT
  c.id,
  'المساعدة الرقمية',
  'المساعدة الرقمية',
  COALESCE(c.default_language, 'ar'),
  CASE
    WHEN COALESCE(c.default_language, 'ar') = 'ar'
      THEN 'ar-SA'
    ELSE COALESCE(c.default_language, 'ar')
  END,
  'professional_friendly',
  'مساعدة استقبال رقمية تساعد العملاء في معرفة معلومات العيادة وإتمام الحجز.',
  'أهلًا وسهلًا 🌸 كيف أقدر أساعدك؟',
  'لا أملك إجابة مؤكدة الآن، ويمكن لموظف العيادة مساعدتك.',
  'سأحوّل طلبك إلى أحد موظفي العيادة لمساعدتك.'
FROM geniusbot.clinics c
ON CONFLICT (clinic_id) DO NOTHING;

INSERT INTO geniusbot.conversation_policies (
  clinic_id
)
SELECT c.id
FROM geniusbot.clinics c
ON CONFLICT (clinic_id) DO NOTHING;

INSERT INTO geniusbot.booking_policies (
  clinic_id
)
SELECT c.id
FROM geniusbot.clinics c
ON CONFLICT (clinic_id) DO NOTHING;

-- =========================================================
-- Provision default configuration for future clinics
-- =========================================================

CREATE OR REPLACE FUNCTION geniusbot.provision_ai_receptionist_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO geniusbot.assistant_profiles (
    clinic_id,
    assistant_name,
    display_name,
    language,
    locale,
    tone,
    persona_description,
    welcome_message,
    fallback_message,
    handoff_message
  )
  VALUES (
    NEW.id,
    'المساعدة الرقمية',
    'المساعدة الرقمية',
    COALESCE(NEW.default_language, 'ar'),
    CASE
      WHEN COALESCE(NEW.default_language, 'ar') = 'ar'
        THEN 'ar-SA'
      ELSE COALESCE(NEW.default_language, 'ar')
    END,
    'professional_friendly',
    'مساعدة استقبال رقمية تساعد العملاء في معرفة معلومات العيادة وإتمام الحجز.',
    'أهلًا وسهلًا 🌸 كيف أقدر أساعدك؟',
    'لا أملك إجابة مؤكدة الآن، ويمكن لموظف العيادة مساعدتك.',
    'سأحوّل طلبك إلى أحد موظفي العيادة لمساعدتك.'
  )
  ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO geniusbot.conversation_policies (clinic_id)
  VALUES (NEW.id)
  ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO geniusbot.booking_policies (clinic_id)
  VALUES (NEW.id)
  ON CONFLICT (clinic_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinics_provision_ai_receptionist_defaults
  ON geniusbot.clinics;

CREATE TRIGGER trg_clinics_provision_ai_receptionist_defaults
AFTER INSERT ON geniusbot.clinics
FOR EACH ROW
EXECUTE FUNCTION geniusbot.provision_ai_receptionist_defaults();

-- =========================================================
-- Validation
-- =========================================================

DO $$
DECLARE
  missing_tables text[];
BEGIN
  SELECT array_agg(required_table)
  INTO missing_tables
  FROM (
    VALUES
      ('assistant_profiles'),
      ('conversation_policies'),
      ('booking_policies'),
      ('clinic_channels'),
      ('handoff_rules'),
      ('missed_call_events'),
      ('recovery_attempts'),
      ('conversation_tags')
  ) AS required(required_table)
  WHERE to_regclass(
    'geniusbot.' || required_table
  ) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 001 failed. Missing tables: %',
      array_to_string(missing_tables, ', ');
  END IF;
END;
$$;

COMMIT;

-- =========================================================
-- Final report
-- =========================================================

SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'geniusbot'
  AND table_name IN (
    'assistant_profiles',
    'conversation_policies',
    'booking_policies',
    'clinic_channels',
    'handoff_rules',
    'missed_call_events',
    'recovery_attempts',
    'conversation_tags'
  )
ORDER BY table_name;