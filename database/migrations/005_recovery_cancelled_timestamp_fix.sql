-- ============================================================================
-- GeniusBot / Shaden
-- Migration 005: Recovery Cancelled Timestamp Fix
--
-- Purpose:
--   Allow a scheduled recovery attempt to be cancelled before execution
--   without requiring started_at.
--
-- Valid examples:
--   scheduled  + started_at IS NULL
--   cancelled  + started_at IS NULL  -- cancelled before execution
--   cancelled  + started_at NOT NULL -- cancelled during processing
--   processing + started_at NOT NULL
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Preconditions
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('geniusbot.recovery_attempts') IS NULL THEN
        RAISE EXCEPTION
            'Migration 005 aborted: geniusbot.recovery_attempts does not exist.';
    END IF;
END;
$$;

-- ============================================================================
-- 2. Replace the incorrect status/timestamp constraint
-- ============================================================================

ALTER TABLE geniusbot.recovery_attempts
    DROP CONSTRAINT IF EXISTS recovery_attempts_started_at_status_check;

ALTER TABLE geniusbot.recovery_attempts
    ADD CONSTRAINT recovery_attempts_started_at_status_check
    CHECK (
        status IN ('scheduled', 'cancelled')
        OR started_at IS NOT NULL
    );

-- ============================================================================
-- 3. Post-migration validation
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts
        WHERE status NOT IN ('scheduled', 'cancelled')
          AND started_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Migration 005 validation failed: an executed recovery status exists without started_at.';
    END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- End of migration 005_recovery_cancelled_timestamp_fix.sql
-- ============================================================================