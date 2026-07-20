-- ============================================================================
-- GeniusBot / Shaden
-- Migration 003: Revenue Engine Hardening
--
-- Scope:
--   1. Reject unknown recovery channels instead of silently mapping them
--      to WhatsApp.
--   2. Attribute automated recovery attempts to AI instead of SYSTEM,
--      while preserving STAFF attribution for manual follow-ups.
--
-- This migration intentionally does not change:
--   - recovery_attempts.started_at nullability;
--   - multi-tenant foreign-key architecture;
--   - tables, columns, reports, or unrelated lookup mappings.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Preconditions
-- --------------------------------------------------------------------------
DO $$
DECLARE
    missing_codes text;
BEGIN
    SELECT string_agg(required.code, ', ' ORDER BY required.code)
      INTO missing_codes
    FROM (
        VALUES
            ('RECOVERY_CHANNEL', 'PHONE_CALL'),
            ('RECOVERY_CHANNEL', 'WHATSAPP'),
            ('RECOVERY_CHANNEL', 'SMS'),
            ('RECOVERY_CHANNEL', 'EMAIL'),
            ('RECOVERY_CHANNEL', 'DASHBOARD'),
            ('RECOVERY_INITIATOR', 'AI'),
            ('RECOVERY_INITIATOR', 'STAFF'),
            ('RECOVERY_STATUS', 'PENDING'),
            ('RECOVERY_STATUS', 'IN_PROGRESS'),
            ('RECOVERY_STATUS', 'COMPLETED'),
            ('RECOVERY_STATUS', 'FAILED'),
            ('RECOVERY_STATUS', 'CANCELLED')
    ) AS required(category_code, code)
    WHERE geniusbot.lookup_value_id(required.category_code, required.code) IS NULL;

    IF missing_codes IS NOT NULL THEN
        RAISE EXCEPTION
            'Migration 003 aborted. Missing required lookup values: %',
            missing_codes
            USING ERRCODE = '23514';
    END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- 2. Harden recovery-attempt lookup synchronization
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION geniusbot.sync_recovery_attempt_lookups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_channel_id uuid;
    expected_status_id uuid;
    expected_initiator_id uuid;
    expected_channel_code text;
    expected_initiator_code text;
BEGIN
    -- Channel mapping must be explicit. Unknown values are integration errors
    -- and must never be silently recorded as WhatsApp.
    expected_channel_code := CASE NEW.channel
        WHEN 'phone'     THEN 'PHONE_CALL'
        WHEN 'whatsapp'  THEN 'WHATSAPP'
        WHEN 'sms'       THEN 'SMS'
        WHEN 'email'     THEN 'EMAIL'
        WHEN 'dashboard' THEN 'DASHBOARD'
        ELSE NULL
    END;

    IF expected_channel_code IS NULL THEN
        RAISE EXCEPTION
            'Unsupported recovery_attempts.channel value: "%".', NEW.channel
            USING
                ERRCODE = '23514',
                HINT = 'Allowed values: phone, whatsapp, sms, email, dashboard.';
    END IF;

    expected_channel_id := geniusbot.lookup_value_id(
        'RECOVERY_CHANNEL',
        expected_channel_code
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

    -- Shaden performs automated recovery attempts. Only an explicitly manual
    -- follow-up is attributed to a staff member.
    expected_initiator_code := CASE
        WHEN NEW.attempt_type = 'manual_followup' THEN 'STAFF'
        ELSE 'AI'
    END;

    expected_initiator_id := geniusbot.lookup_value_id(
        'RECOVERY_INITIATOR',
        expected_initiator_code
    );

    IF expected_channel_id IS NULL
       OR expected_status_id IS NULL
       OR expected_initiator_id IS NULL THEN
        RAISE EXCEPTION
            'Unable to resolve recovery attempt lookup values.'
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

-- The existing trigger already calls this function. Recreate it defensively so
-- the migration remains deterministic if the trigger definition has drifted.
DROP TRIGGER IF EXISTS sync_recovery_attempt_lookups
    ON geniusbot.recovery_attempts;

CREATE TRIGGER sync_recovery_attempt_lookups
    BEFORE INSERT OR UPDATE OF channel, status, attempt_type,
                               channel_id, status_id, initiator_id
    ON geniusbot.recovery_attempts
    FOR EACH ROW
    EXECUTE FUNCTION geniusbot.sync_recovery_attempt_lookups();

-- --------------------------------------------------------------------------
-- 3. Correct historical attribution
-- --------------------------------------------------------------------------
-- Updating initiator_id invokes the synchronization trigger, which derives the
-- authoritative value from attempt_type using the hardened function above.
UPDATE geniusbot.recovery_attempts
SET initiator_id = CASE
    WHEN attempt_type = 'manual_followup'
        THEN geniusbot.lookup_value_id('RECOVERY_INITIATOR', 'STAFF')
    ELSE geniusbot.lookup_value_id('RECOVERY_INITIATOR', 'AI')
END
WHERE initiator_id IS DISTINCT FROM CASE
    WHEN attempt_type = 'manual_followup'
        THEN geniusbot.lookup_value_id('RECOVERY_INITIATOR', 'STAFF')
    ELSE geniusbot.lookup_value_id('RECOVERY_INITIATOR', 'AI')
END;

-- --------------------------------------------------------------------------
-- 4. Post-migration validation
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts attempt
        WHERE attempt.channel_id IS DISTINCT FROM geniusbot.lookup_value_id(
            'RECOVERY_CHANNEL',
            CASE attempt.channel
                WHEN 'phone'     THEN 'PHONE_CALL'
                WHEN 'whatsapp'  THEN 'WHATSAPP'
                WHEN 'sms'       THEN 'SMS'
                WHEN 'email'     THEN 'EMAIL'
                WHEN 'dashboard' THEN 'DASHBOARD'
                ELSE NULL
            END
        )
    ) THEN
        RAISE EXCEPTION
            'Migration 003 validation failed: channel lookup mismatch detected.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts attempt
        WHERE attempt.initiator_id IS DISTINCT FROM geniusbot.lookup_value_id(
            'RECOVERY_INITIATOR',
            CASE
                WHEN attempt.attempt_type = 'manual_followup' THEN 'STAFF'
                ELSE 'AI'
            END
        )
    ) THEN
        RAISE EXCEPTION
            'Migration 003 validation failed: initiator lookup mismatch detected.';
    END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- End of migration 003_revenue_engine_hardening.sql
-- ============================================================================
