-- ============================================================================
-- GeniusBot / Shaden
-- Migration: 002_revenue_engine_final_v4.sql
-- Purpose  : Upgrade the revenue engine created by migration 001, add a
--            unified lookup engine, and add revenue conversion tracking.
-- Schema   : geniusbot
-- Depends  : 001_ai_receptionist_core_final.sql
-- Strategy : Non-destructive upgrade. Existing operational columns are kept
--            for backward compatibility; normalized lookup columns are added and synchronized from the legacy columns only.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. PRE-FLIGHT VALIDATION
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
        'staff',
        'missed_calls',
        'revenue_opportunities',
        'recovery_attempts'
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
-- 1. UNIFIED LOOKUP ENGINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.lookup_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(100) NOT NULL,
    name_ar varchar(255) NOT NULL,
    name_en varchar(255) NOT NULL,
    description text,
    display_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT lookup_categories_code_key UNIQUE (code),
    CONSTRAINT lookup_categories_code_check
        CHECK (code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT lookup_categories_display_order_check
        CHECK (display_order >= 0)
);

CREATE TABLE IF NOT EXISTS geniusbot.lookup_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL,
    code varchar(100) NOT NULL,
    name_ar varchar(255) NOT NULL,
    name_en varchar(255) NOT NULL,
    description text,
    display_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT lookup_values_category_id_fkey
        FOREIGN KEY (category_id)
        REFERENCES geniusbot.lookup_categories(id)
        ON DELETE RESTRICT,
    CONSTRAINT lookup_values_category_id_code_key
        UNIQUE (category_id, code),
    CONSTRAINT lookup_values_code_check
        CHECK (code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT lookup_values_display_order_check
        CHECK (display_order >= 0),
    CONSTRAINT lookup_values_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_lookup_categories_active_order
    ON geniusbot.lookup_categories (is_active, display_order, code);

CREATE INDEX IF NOT EXISTS idx_lookup_values_category_active_order
    ON geniusbot.lookup_values (category_id, is_active, display_order, code);

DROP TRIGGER IF EXISTS set_lookup_categories_updated_at
    ON geniusbot.lookup_categories;
CREATE TRIGGER set_lookup_categories_updated_at
    BEFORE UPDATE ON geniusbot.lookup_categories
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

DROP TRIGGER IF EXISTS set_lookup_values_updated_at
    ON geniusbot.lookup_values;
CREATE TRIGGER set_lookup_values_updated_at
    BEFORE UPDATE ON geniusbot.lookup_values
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 2. LOOKUP REFERENCE DATA
-- ============================================================================
INSERT INTO geniusbot.lookup_categories
    (code, name_ar, name_en, description, display_order)
VALUES
    ('MISSED_CALL_STATUS', 'حالة المكالمة الفائتة', 'Missed Call Status', 'Processing state of a missed call.', 10),
    ('REVENUE_STATUS', 'حالة فرصة الإيراد', 'Revenue Opportunity Status', 'Lifecycle state of a revenue opportunity.', 20),
    ('REVENUE_PRIORITY', 'أولوية فرصة الإيراد', 'Revenue Opportunity Priority', 'Priority assigned to a revenue opportunity.', 30),
    ('RECOVERY_STATUS', 'حالة محاولة الاسترجاع', 'Recovery Attempt Status', 'Lifecycle state of a recovery attempt.', 40),
    ('RECOVERY_RESULT', 'نتيجة محاولة الاسترجاع', 'Recovery Attempt Result', 'Business result of a recovery attempt.', 50),
    ('RECOVERY_CHANNEL', 'قناة الاسترجاع', 'Recovery Channel', 'Channel used for a recovery attempt.', 60),
    ('RECOVERY_INITIATOR', 'منشئ محاولة الاسترجاع', 'Recovery Initiator', 'Actor that initiated a recovery attempt.', 70),
    ('CONVERSION_TYPE', 'نوع التحويل', 'Conversion Type', 'Final commercial outcome of an opportunity.', 80),
    ('CONVERSION_SOURCE', 'مصدر التحويل', 'Conversion Source', 'Actor or workflow credited for a conversion.', 90)
ON CONFLICT (code) DO UPDATE
SET
    name_ar = EXCLUDED.name_ar,
    name_en = EXCLUDED.name_en,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = true,
    updated_at = now();

WITH values_to_insert(category_code, code, name_ar, name_en, display_order) AS (
    VALUES
        ('MISSED_CALL_STATUS', 'NEW', 'جديدة', 'New', 10),
        ('MISSED_CALL_STATUS', 'QUALIFIED', 'مؤهلة', 'Qualified', 20),
        ('MISSED_CALL_STATUS', 'IGNORED', 'متجاهلة', 'Ignored', 30),
        ('MISSED_CALL_STATUS', 'INVALID', 'غير صالحة', 'Invalid', 40),
        ('MISSED_CALL_STATUS', 'RECOVERED', 'مستعادة', 'Recovered', 50),

        ('REVENUE_STATUS', 'OPEN', 'مفتوحة', 'Open', 10),
        ('REVENUE_STATUS', 'CONTACTING', 'جارٍ التواصل', 'Contacting', 20),
        ('REVENUE_STATUS', 'BOOKED', 'تم الحجز', 'Booked', 30),
        ('REVENUE_STATUS', 'CONVERTED', 'محوّلة', 'Converted', 40),
        ('REVENUE_STATUS', 'LOST', 'مفقودة', 'Lost', 50),
        ('REVENUE_STATUS', 'EXPIRED', 'منتهية', 'Expired', 60),

        ('REVENUE_PRIORITY', 'LOW', 'منخفضة', 'Low', 10),
        ('REVENUE_PRIORITY', 'MEDIUM', 'متوسطة', 'Medium', 20),
        ('REVENUE_PRIORITY', 'HIGH', 'عالية', 'High', 30),
        ('REVENUE_PRIORITY', 'CRITICAL', 'حرجة', 'Critical', 40),

        ('RECOVERY_STATUS', 'PENDING', 'قيد الانتظار', 'Pending', 10),
        ('RECOVERY_STATUS', 'IN_PROGRESS', 'قيد التنفيذ', 'In Progress', 20),
        ('RECOVERY_STATUS', 'COMPLETED', 'مكتملة', 'Completed', 30),
        ('RECOVERY_STATUS', 'FAILED', 'فشلت', 'Failed', 40),
        ('RECOVERY_STATUS', 'CANCELLED', 'ملغاة', 'Cancelled', 50),

        ('RECOVERY_RESULT', 'NO_ANSWER', 'لا يوجد رد', 'No Answer', 10),
        ('RECOVERY_RESULT', 'CALL_BACK_REQUESTED', 'طلب معاودة الاتصال', 'Callback Requested', 20),
        ('RECOVERY_RESULT', 'BOOKING_CREATED', 'تم إنشاء حجز', 'Booking Created', 30),
        ('RECOVERY_RESULT', 'NOT_INTERESTED', 'غير مهتم', 'Not Interested', 40),
        ('RECOVERY_RESULT', 'WRONG_NUMBER', 'رقم خاطئ', 'Wrong Number', 50),
        ('RECOVERY_RESULT', 'DUPLICATE', 'مكرر', 'Duplicate', 60),
        ('RECOVERY_RESULT', 'SPAM', 'رسالة مزعجة', 'Spam', 70),
        ('RECOVERY_RESULT', 'FOLLOW_UP_REQUIRED', 'تحتاج متابعة', 'Follow-up Required', 80),

        ('RECOVERY_CHANNEL', 'PHONE_CALL', 'مكالمة هاتفية', 'Phone Call', 10),
        ('RECOVERY_CHANNEL', 'WHATSAPP', 'واتساب', 'WhatsApp', 20),
        ('RECOVERY_CHANNEL', 'SMS', 'رسالة نصية', 'SMS', 30),
        ('RECOVERY_CHANNEL', 'EMAIL', 'بريد إلكتروني', 'Email', 40),
        ('RECOVERY_CHANNEL', 'INSTAGRAM', 'إنستغرام', 'Instagram', 50),
        ('RECOVERY_CHANNEL', 'FACEBOOK', 'فيسبوك', 'Facebook', 60),
        ('RECOVERY_CHANNEL', 'DASHBOARD', 'لوحة التحكم', 'Dashboard', 70),
        ('RECOVERY_CHANNEL', 'OTHER', 'أخرى', 'Other', 80),

        ('RECOVERY_INITIATOR', 'AI', 'الذكاء الاصطناعي', 'AI', 10),
        ('RECOVERY_INITIATOR', 'STAFF', 'موظف', 'Staff', 20),
        ('RECOVERY_INITIATOR', 'SYSTEM', 'النظام', 'System', 30),

        ('CONVERSION_TYPE', 'BOOKED', 'تم الحجز', 'Booked', 10),
        ('CONVERSION_TYPE', 'PURCHASED', 'تم الشراء', 'Purchased', 20),
        ('CONVERSION_TYPE', 'CONSULTATION_ONLY', 'استشارة فقط', 'Consultation Only', 30),
        ('CONVERSION_TYPE', 'LOST', 'مفقودة', 'Lost', 40),
        ('CONVERSION_TYPE', 'CANCELLED', 'ملغاة', 'Cancelled', 50),
        ('CONVERSION_TYPE', 'NO_RESPONSE', 'لا يوجد رد', 'No Response', 60),

        ('CONVERSION_SOURCE', 'AI', 'الذكاء الاصطناعي', 'AI', 10),
        ('CONVERSION_SOURCE', 'RECEPTIONIST', 'موظف الاستقبال', 'Receptionist', 20),
        ('CONVERSION_SOURCE', 'DOCTOR', 'الطبيب', 'Doctor', 30),
        ('CONVERSION_SOURCE', 'MANUAL', 'يدوي', 'Manual', 40),
        ('CONVERSION_SOURCE', 'SYSTEM', 'النظام', 'System', 50)
)
INSERT INTO geniusbot.lookup_values
    (category_id, code, name_ar, name_en, display_order)
SELECT
    category.id,
    source.code,
    source.name_ar,
    source.name_en,
    source.display_order
FROM values_to_insert source
JOIN geniusbot.lookup_categories category
  ON category.code = source.category_code
ON CONFLICT (category_id, code) DO UPDATE
SET
    name_ar = EXCLUDED.name_ar,
    name_en = EXCLUDED.name_en,
    display_order = EXCLUDED.display_order,
    is_active = true,
    updated_at = now();

-- ============================================================================
-- 3. LOOKUP CATEGORY VALIDATION FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION geniusbot.validate_lookup_value_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    value_id uuid;
    expected_category_code text;
    actual_category_code text;
BEGIN
    value_id := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
    expected_category_code := TG_ARGV[1];

    IF value_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT category.code
      INTO actual_category_code
      FROM geniusbot.lookup_values lookup_value
      JOIN geniusbot.lookup_categories category
        ON category.id = lookup_value.category_id
     WHERE lookup_value.id = value_id;

    IF actual_category_code IS NULL THEN
        RAISE EXCEPTION 'Lookup value % does not exist.', value_id
            USING ERRCODE = '23503';
    END IF;

    IF actual_category_code <> expected_category_code THEN
        RAISE EXCEPTION
            'Lookup value % belongs to category %, but category % is required for column %.',
            value_id,
            actual_category_code,
            expected_category_code,
            TG_ARGV[0]
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. UPGRADE MISSED CALLS
-- ============================================================================
ALTER TABLE geniusbot.missed_calls
    ADD COLUMN IF NOT EXISTS caller_name varchar(255),
    ADD COLUMN IF NOT EXISTS call_started_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS call_ended_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS duration_seconds integer,
    ADD COLUMN IF NOT EXISTS status_id uuid;

UPDATE geniusbot.missed_calls
SET call_started_at = called_at
WHERE call_started_at IS NULL;

UPDATE geniusbot.missed_calls missed_call
SET status_id = lookup_value.id
FROM geniusbot.lookup_values lookup_value
JOIN geniusbot.lookup_categories category
  ON category.id = lookup_value.category_id
WHERE category.code = 'MISSED_CALL_STATUS'
  AND lookup_value.code = CASE missed_call.recovery_status
        WHEN 'ignored' THEN 'IGNORED'
        WHEN 'failed' THEN 'INVALID'
        WHEN 'booked' THEN 'RECOVERED'
        WHEN 'contacted' THEN 'QUALIFIED'
        WHEN 'replied' THEN 'QUALIFIED'
        ELSE 'NEW'
      END
  AND missed_call.status_id IS NULL;

ALTER TABLE geniusbot.missed_calls
    ALTER COLUMN call_started_at SET NOT NULL,
    ALTER COLUMN status_id SET NOT NULL;

ALTER TABLE geniusbot.missed_calls
    DROP CONSTRAINT IF EXISTS missed_calls_clinic_id_fkey,
    DROP CONSTRAINT IF EXISTS missed_calls_status_id_fkey,
    DROP CONSTRAINT IF EXISTS missed_calls_time_check,
    DROP CONSTRAINT IF EXISTS missed_calls_duration_seconds_check;

ALTER TABLE geniusbot.missed_calls
    ADD CONSTRAINT missed_calls_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT missed_calls_status_id_fkey
        FOREIGN KEY (status_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT missed_calls_time_check
        CHECK (call_ended_at IS NULL OR call_ended_at >= call_started_at),
    ADD CONSTRAINT missed_calls_duration_seconds_check
        CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

DO $$
BEGIN
    IF EXISTS (
        SELECT conversation_id
        FROM geniusbot.missed_calls
        WHERE conversation_id IS NOT NULL
        GROUP BY conversation_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot create one-to-one missed_calls/conversations constraint: duplicate conversation_id values exist.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_missed_calls_conversation_id
    ON geniusbot.missed_calls (conversation_id)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_missed_calls_clinic_started_at
    ON geniusbot.missed_calls (clinic_id, call_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_missed_calls_clinic_status_id
    ON geniusbot.missed_calls (clinic_id, status_id, call_started_at DESC);

DROP TRIGGER IF EXISTS validate_missed_calls_status_category
    ON geniusbot.missed_calls;
CREATE TRIGGER validate_missed_calls_status_category
    BEFORE INSERT OR UPDATE OF status_id ON geniusbot.missed_calls
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'status_id',
        'MISSED_CALL_STATUS'
    );

-- ============================================================================
-- 5. UPGRADE REVENUE OPPORTUNITIES
-- ============================================================================
ALTER TABLE geniusbot.revenue_opportunities
    ADD COLUMN IF NOT EXISTS assigned_to_staff_id uuid,
    ADD COLUMN IF NOT EXISTS status_id uuid,
    ADD COLUMN IF NOT EXISTS priority_id uuid,
    ADD COLUMN IF NOT EXISTS opened_at timestamp with time zone;

UPDATE geniusbot.revenue_opportunities
SET opened_at = first_detected_at
WHERE opened_at IS NULL;

UPDATE geniusbot.revenue_opportunities opportunity
SET status_id = lookup_value.id
FROM geniusbot.lookup_values lookup_value
JOIN geniusbot.lookup_categories category
  ON category.id = lookup_value.category_id
WHERE category.code = 'REVENUE_STATUS'
  AND lookup_value.code = CASE opportunity.stage
        WHEN 'contact_pending' THEN 'CONTACTING'
        WHEN 'contacted' THEN 'CONTACTING'
        WHEN 'engaged' THEN 'CONTACTING'
        WHEN 'booking_started' THEN 'CONTACTING'
        WHEN 'booked' THEN 'BOOKED'
        WHEN 'attended' THEN 'CONVERTED'
        WHEN 'lost' THEN 'LOST'
        WHEN 'closed' THEN 'EXPIRED'
        ELSE 'OPEN'
      END
  AND opportunity.status_id IS NULL;

UPDATE geniusbot.revenue_opportunities opportunity
SET priority_id = lookup_value.id
FROM geniusbot.lookup_values lookup_value
JOIN geniusbot.lookup_categories category
  ON category.id = lookup_value.category_id
WHERE category.code = 'REVENUE_PRIORITY'
  AND lookup_value.code = CASE opportunity.priority
        WHEN 'low' THEN 'LOW'
        WHEN 'high' THEN 'HIGH'
        WHEN 'urgent' THEN 'CRITICAL'
        ELSE 'MEDIUM'
      END
  AND opportunity.priority_id IS NULL;

ALTER TABLE geniusbot.revenue_opportunities
    ALTER COLUMN opened_at SET NOT NULL,
    ALTER COLUMN status_id SET NOT NULL,
    ALTER COLUMN priority_id SET NOT NULL;

ALTER TABLE geniusbot.revenue_opportunities
    DROP CONSTRAINT IF EXISTS revenue_opportunities_clinic_id_fkey,
    DROP CONSTRAINT IF EXISTS revenue_opportunities_missed_call_id_fkey,
    DROP CONSTRAINT IF EXISTS revenue_opportunities_assigned_to_staff_id_fkey,
    DROP CONSTRAINT IF EXISTS revenue_opportunities_status_id_fkey,
    DROP CONSTRAINT IF EXISTS revenue_opportunities_priority_id_fkey;

ALTER TABLE geniusbot.revenue_opportunities
    ADD CONSTRAINT revenue_opportunities_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT revenue_opportunities_missed_call_id_fkey
        FOREIGN KEY (missed_call_id)
        REFERENCES geniusbot.missed_calls(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT revenue_opportunities_assigned_to_staff_id_fkey
        FOREIGN KEY (assigned_to_staff_id)
        REFERENCES geniusbot.staff(id)
        ON DELETE SET NULL,
    ADD CONSTRAINT revenue_opportunities_status_id_fkey
        FOREIGN KEY (status_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT revenue_opportunities_priority_id_fkey
        FOREIGN KEY (priority_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_clinic_status_id
    ON geniusbot.revenue_opportunities (clinic_id, status_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_opportunities_clinic_priority_id
    ON geniusbot.revenue_opportunities (clinic_id, priority_id, opened_at DESC);

DROP TRIGGER IF EXISTS validate_revenue_opportunities_status_category
    ON geniusbot.revenue_opportunities;
CREATE TRIGGER validate_revenue_opportunities_status_category
    BEFORE INSERT OR UPDATE OF status_id ON geniusbot.revenue_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'status_id',
        'REVENUE_STATUS'
    );

DROP TRIGGER IF EXISTS validate_revenue_opportunities_priority_category
    ON geniusbot.revenue_opportunities;
CREATE TRIGGER validate_revenue_opportunities_priority_category
    BEFORE INSERT OR UPDATE OF priority_id ON geniusbot.revenue_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'priority_id',
        'REVENUE_PRIORITY'
    );

-- ============================================================================
-- 6. UPGRADE RECOVERY ATTEMPTS
-- ============================================================================
ALTER TABLE geniusbot.recovery_attempts
    ADD COLUMN IF NOT EXISTS patient_id uuid,
    ADD COLUMN IF NOT EXISTS channel_id uuid,
    ADD COLUMN IF NOT EXISTS initiator_id uuid,
    ADD COLUMN IF NOT EXISTS staff_id uuid,
    ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS duration_seconds integer,
    ADD COLUMN IF NOT EXISTS status_id uuid,
    ADD COLUMN IF NOT EXISTS result_type_id uuid,
    ADD COLUMN IF NOT EXISTS notes text;

UPDATE geniusbot.recovery_attempts
SET started_at = COALESCE(attempted_at, scheduled_at, created_at)
WHERE started_at IS NULL;

UPDATE geniusbot.recovery_attempts
SET finished_at = replied_at
WHERE finished_at IS NULL
  AND replied_at IS NOT NULL;

UPDATE geniusbot.recovery_attempts attempt
SET channel_id = lookup_value.id
FROM geniusbot.lookup_values lookup_value
JOIN geniusbot.lookup_categories category
  ON category.id = lookup_value.category_id
WHERE category.code = 'RECOVERY_CHANNEL'
  AND lookup_value.code = CASE attempt.channel
        WHEN 'phone' THEN 'PHONE_CALL'
        WHEN 'sms' THEN 'SMS'
        WHEN 'email' THEN 'EMAIL'
        WHEN 'dashboard' THEN 'DASHBOARD'
        ELSE 'WHATSAPP'
      END
  AND attempt.channel_id IS NULL;

UPDATE geniusbot.recovery_attempts attempt
SET initiator_id = lookup_value.id
FROM geniusbot.lookup_values lookup_value
JOIN geniusbot.lookup_categories category
  ON category.id = lookup_value.category_id
WHERE category.code = 'RECOVERY_INITIATOR'
  AND lookup_value.code = CASE
        WHEN attempt.attempt_type = 'manual_followup' THEN 'STAFF'
        ELSE 'SYSTEM'
      END
  AND attempt.initiator_id IS NULL;

UPDATE geniusbot.recovery_attempts attempt
SET status_id = lookup_value.id
FROM geniusbot.lookup_values lookup_value
JOIN geniusbot.lookup_categories category
  ON category.id = lookup_value.category_id
WHERE category.code = 'RECOVERY_STATUS'
  AND lookup_value.code = CASE attempt.status
        WHEN 'processing' THEN 'IN_PROGRESS'
        WHEN 'sent' THEN 'COMPLETED'
        WHEN 'delivered' THEN 'COMPLETED'
        WHEN 'replied' THEN 'COMPLETED'
        WHEN 'failed' THEN 'FAILED'
        WHEN 'cancelled' THEN 'CANCELLED'
        ELSE 'PENDING'
      END
  AND attempt.status_id IS NULL;

ALTER TABLE geniusbot.recovery_attempts
    ALTER COLUMN started_at SET NOT NULL,
    ALTER COLUMN channel_id SET NOT NULL,
    ALTER COLUMN initiator_id SET NOT NULL,
    ALTER COLUMN status_id SET NOT NULL;

ALTER TABLE geniusbot.recovery_attempts
    DROP CONSTRAINT IF EXISTS recovery_attempts_clinic_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_opportunity_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_patient_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_channel_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_initiator_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_staff_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_status_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_result_type_id_fkey,
    DROP CONSTRAINT IF EXISTS recovery_attempts_time_check,
    DROP CONSTRAINT IF EXISTS recovery_attempts_duration_seconds_check;

ALTER TABLE geniusbot.recovery_attempts
    ADD CONSTRAINT recovery_attempts_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT recovery_attempts_opportunity_id_fkey
        FOREIGN KEY (opportunity_id)
        REFERENCES geniusbot.revenue_opportunities(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT recovery_attempts_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE SET NULL,
    ADD CONSTRAINT recovery_attempts_channel_id_fkey
        FOREIGN KEY (channel_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT recovery_attempts_initiator_id_fkey
        FOREIGN KEY (initiator_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT recovery_attempts_staff_id_fkey
        FOREIGN KEY (staff_id)
        REFERENCES geniusbot.staff(id)
        ON DELETE SET NULL,
    ADD CONSTRAINT recovery_attempts_status_id_fkey
        FOREIGN KEY (status_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT recovery_attempts_result_type_id_fkey
        FOREIGN KEY (result_type_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT recovery_attempts_time_check
        CHECK (finished_at IS NULL OR finished_at >= started_at),
    ADD CONSTRAINT recovery_attempts_duration_seconds_check
        CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_clinic_status_id
    ON geniusbot.recovery_attempts (clinic_id, status_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_channel_id
    ON geniusbot.recovery_attempts (channel_id, started_at DESC);

DROP TRIGGER IF EXISTS validate_recovery_attempts_channel_category
    ON geniusbot.recovery_attempts;
CREATE TRIGGER validate_recovery_attempts_channel_category
    BEFORE INSERT OR UPDATE OF channel_id ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'channel_id',
        'RECOVERY_CHANNEL'
    );

DROP TRIGGER IF EXISTS validate_recovery_attempts_initiator_category
    ON geniusbot.recovery_attempts;
CREATE TRIGGER validate_recovery_attempts_initiator_category
    BEFORE INSERT OR UPDATE OF initiator_id ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'initiator_id',
        'RECOVERY_INITIATOR'
    );

DROP TRIGGER IF EXISTS validate_recovery_attempts_status_category
    ON geniusbot.recovery_attempts;
CREATE TRIGGER validate_recovery_attempts_status_category
    BEFORE INSERT OR UPDATE OF status_id ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'status_id',
        'RECOVERY_STATUS'
    );

DROP TRIGGER IF EXISTS validate_recovery_attempts_result_category
    ON geniusbot.recovery_attempts;
CREATE TRIGGER validate_recovery_attempts_result_category
    BEFORE INSERT OR UPDATE OF result_type_id ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'result_type_id',
        'RECOVERY_RESULT'
    );


-- ============================================================================
-- 7. LEGACY-TO-LOOKUP SYNCHRONIZATION
--
-- Compatibility rule:
--   * The existing legacy text columns remain the temporary source of truth.
--   * BEFORE triggers derive normalized lookup UUID columns from legacy values.
--   * Direct writes to derived lookup columns are rejected when they do not
--     match the value derived from the legacy columns.
--   * This prevents lossy reverse mapping until the backend is fully migrated.
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.lookup_value_id(
    p_category_code text,
    p_value_code text
)
RETURNS uuid
LANGUAGE sql
STABLE
STRICT
AS $$
    SELECT lookup_value.id
    FROM geniusbot.lookup_values lookup_value
    JOIN geniusbot.lookup_categories category
      ON category.id = lookup_value.category_id
    WHERE category.code = p_category_code
      AND lookup_value.code = p_value_code
      AND category.is_active = true
      AND lookup_value.is_active = true;
$$;

CREATE OR REPLACE FUNCTION geniusbot.sync_missed_calls_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_status_id uuid;
BEGIN
    expected_status_id := geniusbot.lookup_value_id(
        'MISSED_CALL_STATUS',
        CASE NEW.recovery_status
            WHEN 'ignored'   THEN 'IGNORED'
            WHEN 'failed'    THEN 'INVALID'
            WHEN 'booked'    THEN 'RECOVERED'
            WHEN 'contacted' THEN 'QUALIFIED'
            WHEN 'replied'   THEN 'QUALIFIED'
            ELSE 'NEW'
        END
    );

    IF expected_status_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve missed call status lookup value.'
            USING ERRCODE = '23514';
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND NEW.status_id IS NOT NULL
        AND NEW.status_id IS DISTINCT FROM expected_status_id
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.status_id IS DISTINCT FROM OLD.status_id
        AND NEW.status_id IS DISTINCT FROM expected_status_id
    ) THEN
        RAISE EXCEPTION
            'missed_calls.status_id is derived from recovery_status and cannot be written independently.'
            USING ERRCODE = '23514';
    END IF;

    NEW.status_id := expected_status_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_missed_calls_status
    ON geniusbot.missed_calls;
CREATE TRIGGER sync_missed_calls_status
    BEFORE INSERT OR UPDATE OF recovery_status, status_id
    ON geniusbot.missed_calls
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.sync_missed_calls_status();

CREATE OR REPLACE FUNCTION geniusbot.sync_revenue_opportunity_lookups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_status_id uuid;
    expected_priority_id uuid;
BEGIN
    expected_status_id := geniusbot.lookup_value_id(
        'REVENUE_STATUS',
        CASE NEW.stage
            WHEN 'contact_pending' THEN 'CONTACTING'
            WHEN 'contacted'       THEN 'CONTACTING'
            WHEN 'engaged'         THEN 'CONTACTING'
            WHEN 'booking_started' THEN 'CONTACTING'
            WHEN 'booked'          THEN 'BOOKED'
            WHEN 'attended'        THEN 'CONVERTED'
            WHEN 'lost'            THEN 'LOST'
            WHEN 'closed'          THEN 'EXPIRED'
            ELSE 'OPEN'
        END
    );

    expected_priority_id := geniusbot.lookup_value_id(
        'REVENUE_PRIORITY',
        CASE NEW.priority
            WHEN 'low'    THEN 'LOW'
            WHEN 'high'   THEN 'HIGH'
            WHEN 'urgent' THEN 'CRITICAL'
            ELSE 'MEDIUM'
        END
    );

    IF expected_status_id IS NULL OR expected_priority_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve revenue opportunity lookup values.'
            USING ERRCODE = '23514';
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND NEW.status_id IS NOT NULL
        AND NEW.status_id IS DISTINCT FROM expected_status_id
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.status_id IS DISTINCT FROM OLD.status_id
        AND NEW.status_id IS DISTINCT FROM expected_status_id
    ) THEN
        RAISE EXCEPTION
            'revenue_opportunities.status_id is derived from stage and cannot be written independently.'
            USING ERRCODE = '23514';
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND NEW.priority_id IS NOT NULL
        AND NEW.priority_id IS DISTINCT FROM expected_priority_id
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.priority_id IS DISTINCT FROM OLD.priority_id
        AND NEW.priority_id IS DISTINCT FROM expected_priority_id
    ) THEN
        RAISE EXCEPTION
            'revenue_opportunities.priority_id is derived from priority and cannot be written independently.'
            USING ERRCODE = '23514';
    END IF;

    NEW.status_id := expected_status_id;
    NEW.priority_id := expected_priority_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_revenue_opportunity_lookups
    ON geniusbot.revenue_opportunities;
CREATE TRIGGER sync_revenue_opportunity_lookups
    BEFORE INSERT OR UPDATE OF stage, priority, status_id, priority_id
    ON geniusbot.revenue_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.sync_revenue_opportunity_lookups();

CREATE OR REPLACE FUNCTION geniusbot.sync_recovery_attempt_lookups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_channel_id uuid;
    expected_status_id uuid;
    expected_initiator_id uuid;
BEGIN
    expected_channel_id := geniusbot.lookup_value_id(
        'RECOVERY_CHANNEL',
        CASE NEW.channel
            WHEN 'phone'     THEN 'PHONE_CALL'
            WHEN 'sms'       THEN 'SMS'
            WHEN 'email'     THEN 'EMAIL'
            WHEN 'dashboard' THEN 'DASHBOARD'
            ELSE 'WHATSAPP'
        END
    );

    expected_status_id := geniusbot.lookup_value_id(
        'RECOVERY_STATUS',
        CASE NEW.status
            WHEN 'processing' THEN 'IN_PROGRESS'
            WHEN 'sent'       THEN 'COMPLETED'
            WHEN 'delivered'  THEN 'COMPLETED'
            WHEN 'replied'    THEN 'COMPLETED'
            WHEN 'failed'     THEN 'FAILED'
            WHEN 'cancelled'  THEN 'CANCELLED'
            ELSE 'PENDING'
        END
    );

    expected_initiator_id := geniusbot.lookup_value_id(
        'RECOVERY_INITIATOR',
        CASE
            WHEN NEW.attempt_type = 'manual_followup' THEN 'STAFF'
            ELSE 'SYSTEM'
        END
    );

    IF expected_channel_id IS NULL
       OR expected_status_id IS NULL
       OR expected_initiator_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve recovery attempt lookup values.'
            USING ERRCODE = '23514';
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND NEW.channel_id IS NOT NULL
        AND NEW.channel_id IS DISTINCT FROM expected_channel_id
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.channel_id IS DISTINCT FROM OLD.channel_id
        AND NEW.channel_id IS DISTINCT FROM expected_channel_id
    ) THEN
        RAISE EXCEPTION
            'recovery_attempts.channel_id is derived from channel and cannot be written independently.'
            USING ERRCODE = '23514';
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND NEW.status_id IS NOT NULL
        AND NEW.status_id IS DISTINCT FROM expected_status_id
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.status_id IS DISTINCT FROM OLD.status_id
        AND NEW.status_id IS DISTINCT FROM expected_status_id
    ) THEN
        RAISE EXCEPTION
            'recovery_attempts.status_id is derived from status and cannot be written independently.'
            USING ERRCODE = '23514';
    END IF;

    IF (
        TG_OP = 'INSERT'
        AND NEW.initiator_id IS NOT NULL
        AND NEW.initiator_id IS DISTINCT FROM expected_initiator_id
    ) OR (
        TG_OP = 'UPDATE'
        AND NEW.initiator_id IS DISTINCT FROM OLD.initiator_id
        AND NEW.initiator_id IS DISTINCT FROM expected_initiator_id
    ) THEN
        RAISE EXCEPTION
            'recovery_attempts.initiator_id is derived from attempt_type and cannot be written independently.'
            USING ERRCODE = '23514';
    END IF;

    NEW.channel_id := expected_channel_id;
    NEW.status_id := expected_status_id;
    NEW.initiator_id := expected_initiator_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_recovery_attempt_lookups
    ON geniusbot.recovery_attempts;
CREATE TRIGGER sync_recovery_attempt_lookups
    BEFORE INSERT OR UPDATE OF channel, status, attempt_type,
                               channel_id, status_id, initiator_id
    ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.sync_recovery_attempt_lookups();

-- ============================================================================
-- 8. REVENUE CONVERSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS geniusbot.revenue_conversions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid,
    appointment_id uuid,
    conversion_type_id uuid NOT NULL,
    conversion_source_id uuid NOT NULL,
    estimated_revenue numeric(12,2),
    actual_revenue numeric(12,2),
    currency varchar(10) NOT NULL DEFAULT 'SAR',
    converted_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by_staff_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT revenue_conversions_opportunity_id_key
        UNIQUE (opportunity_id),
    CONSTRAINT revenue_conversions_opportunity_id_fkey
        FOREIGN KEY (opportunity_id)
        REFERENCES geniusbot.revenue_opportunities(id)
        ON DELETE RESTRICT,
    CONSTRAINT revenue_conversions_clinic_id_fkey
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON DELETE RESTRICT,
    CONSTRAINT revenue_conversions_patient_id_fkey
        FOREIGN KEY (patient_id)
        REFERENCES geniusbot.patients(id)
        ON DELETE SET NULL,
    CONSTRAINT revenue_conversions_appointment_id_fkey
        FOREIGN KEY (appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON DELETE SET NULL,
    CONSTRAINT revenue_conversions_created_by_staff_id_fkey
        FOREIGN KEY (created_by_staff_id)
        REFERENCES geniusbot.staff(id)
        ON DELETE SET NULL,
    CONSTRAINT revenue_conversions_conversion_type_id_fkey
        FOREIGN KEY (conversion_type_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    CONSTRAINT revenue_conversions_conversion_source_id_fkey
        FOREIGN KEY (conversion_source_id)
        REFERENCES geniusbot.lookup_values(id)
        ON DELETE RESTRICT,
    CONSTRAINT revenue_conversions_estimated_revenue_check
        CHECK (estimated_revenue IS NULL OR estimated_revenue >= 0),
    CONSTRAINT revenue_conversions_actual_revenue_check
        CHECK (actual_revenue IS NULL OR actual_revenue >= 0),
    CONSTRAINT revenue_conversions_currency_check
        CHECK (currency ~ '^[A-Z]{3,10}$'),
    CONSTRAINT revenue_conversions_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_revenue_conversions_clinic_converted_at
    ON geniusbot.revenue_conversions (clinic_id, converted_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_conversions_appointment
    ON geniusbot.revenue_conversions (appointment_id)
    WHERE appointment_id IS NOT NULL;

DROP TRIGGER IF EXISTS validate_revenue_conversions_type_category
    ON geniusbot.revenue_conversions;
CREATE TRIGGER validate_revenue_conversions_type_category
    BEFORE INSERT OR UPDATE OF conversion_type_id ON geniusbot.revenue_conversions
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'conversion_type_id',
        'CONVERSION_TYPE'
    );

DROP TRIGGER IF EXISTS validate_revenue_conversions_source_category
    ON geniusbot.revenue_conversions;
CREATE TRIGGER validate_revenue_conversions_source_category
    BEFORE INSERT OR UPDATE OF conversion_source_id ON geniusbot.revenue_conversions
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.validate_lookup_value_category(
        'conversion_source_id',
        'CONVERSION_SOURCE'
    );

DROP TRIGGER IF EXISTS set_revenue_conversions_updated_at
    ON geniusbot.revenue_conversions;
CREATE TRIGGER set_revenue_conversions_updated_at
    BEFORE UPDATE ON geniusbot.revenue_conversions
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.set_updated_at();

-- ============================================================================
-- 9. FINAL VALIDATION
-- ============================================================================
DO $$
DECLARE
    required_table text;
    required_column record;
    required_category text;
BEGIN
    FOREACH required_table IN ARRAY ARRAY[
        'lookup_categories',
        'lookup_values',
        'missed_calls',
        'revenue_opportunities',
        'recovery_attempts',
        'revenue_conversions'
    ]
    LOOP
        IF to_regclass(format('geniusbot.%I', required_table)) IS NULL THEN
            RAISE EXCEPTION 'Validation failed: table geniusbot.% is missing.', required_table;
        END IF;
    END LOOP;

    FOR required_column IN
        SELECT *
        FROM (VALUES
            ('missed_calls', 'call_started_at'),
            ('missed_calls', 'status_id'),
            ('revenue_opportunities', 'status_id'),
            ('revenue_opportunities', 'priority_id'),
            ('recovery_attempts', 'channel_id'),
            ('recovery_attempts', 'initiator_id'),
            ('recovery_attempts', 'status_id')
        ) AS columns_to_check(table_name, column_name)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'geniusbot'
              AND table_name = required_column.table_name
              AND column_name = required_column.column_name
        ) THEN
            RAISE EXCEPTION
                'Validation failed: column geniusbot.%.% is missing.',
                required_column.table_name,
                required_column.column_name;
        END IF;
    END LOOP;

    FOREACH required_category IN ARRAY ARRAY[
        'MISSED_CALL_STATUS',
        'REVENUE_STATUS',
        'REVENUE_PRIORITY',
        'RECOVERY_STATUS',
        'RECOVERY_RESULT',
        'RECOVERY_CHANNEL',
        'RECOVERY_INITIATOR',
        'CONVERSION_TYPE',
        'CONVERSION_SOURCE'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM geniusbot.lookup_categories
            WHERE code = required_category
              AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Validation failed: lookup category % is missing.', required_category;
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM geniusbot.missed_calls WHERE status_id IS NULL) THEN
        RAISE EXCEPTION 'Validation failed: missed_calls contains NULL status_id values.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.revenue_opportunities
        WHERE status_id IS NULL OR priority_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Validation failed: revenue_opportunities contains unnormalized rows.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts
        WHERE channel_id IS NULL OR initiator_id IS NULL OR status_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Validation failed: recovery_attempts contains unnormalized rows.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.missed_calls'::regclass
          AND tgname = 'sync_missed_calls_status'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Validation failed: missed call synchronization trigger is missing.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.revenue_opportunities'::regclass
          AND tgname = 'sync_revenue_opportunity_lookups'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Validation failed: revenue opportunity synchronization trigger is missing.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.recovery_attempts'::regclass
          AND tgname = 'sync_recovery_attempt_lookups'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Validation failed: recovery attempt synchronization trigger is missing.';
    END IF;
END;
$$;

COMMIT;
