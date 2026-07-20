-- ============================================================================
-- GeniusBot / Shaden
-- Migration 004: Recovery Attempt Lifecycle Fix
--
-- Purpose:
--   Align recovery_attempts timestamps with the approved lifecycle:
--
--   scheduled  -> started_at IS NULL
--   processing -> started_at IS NOT NULL
--
-- This migration changes no tables, reports, lookup mappings, or business data.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Preconditions
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('geniusbot.recovery_attempts') IS NULL THEN
        RAISE EXCEPTION
            'Migration 004 aborted: geniusbot.recovery_attempts does not exist.';
    END IF;
END;
$$;

-- ============================================================================
-- 2. Correct started_at nullability
-- ============================================================================

ALTER TABLE geniusbot.recovery_attempts
    ALTER COLUMN started_at DROP NOT NULL;

-- ============================================================================
-- 3. Correct historical scheduled rows
-- ============================================================================

-- Earlier migrations populated started_at for every existing row because the
-- column was NOT NULL. Scheduled attempts have not started, so started_at must
-- be cleared to preserve its operational meaning.

UPDATE geniusbot.recovery_attempts
SET
    started_at = NULL,
    updated_at = now()
WHERE status = 'scheduled'
  AND attempted_at IS NULL
  AND finished_at IS NULL;

-- ============================================================================
-- 4. Replace lifecycle timestamp constraint
-- ============================================================================

ALTER TABLE geniusbot.recovery_attempts
    DROP CONSTRAINT IF EXISTS recovery_attempts_time_check;

ALTER TABLE geniusbot.recovery_attempts
    ADD CONSTRAINT recovery_attempts_time_check
    CHECK (
        finished_at IS NULL
        OR (
            started_at IS NOT NULL
            AND finished_at >= started_at
        )
    );

-- ============================================================================
-- 5. Enforce status/timestamp consistency
-- ============================================================================

ALTER TABLE geniusbot.recovery_attempts
    DROP CONSTRAINT IF EXISTS recovery_attempts_started_at_status_check;

ALTER TABLE geniusbot.recovery_attempts
    ADD CONSTRAINT recovery_attempts_started_at_status_check
    CHECK (
        status = 'scheduled'
        OR started_at IS NOT NULL
    );

-- ============================================================================
-- 6. Post-migration validation
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts
        WHERE status = 'scheduled'
          AND attempted_at IS NULL
          AND finished_at IS NULL
          AND started_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'Migration 004 validation failed: untouched scheduled attempts still have started_at.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts
        WHERE status <> 'scheduled'
          AND started_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Migration 004 validation failed: started attempts exist without started_at.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.recovery_attempts
        WHERE finished_at IS NOT NULL
          AND (
              started_at IS NULL
              OR finished_at < started_at
          )
    ) THEN
        RAISE EXCEPTION
            'Migration 004 validation failed: invalid recovery-attempt timestamp sequence.';
    END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- End of migration 004_recovery_attempt_lifecycle_fix.sql
-- ============================================================================