BEGIN;

ALTER TABLE geniusbot.appointments
    ADD COLUMN IF NOT EXISTS cancellation_reason text NULL;

-- Cancellation reasons remain optional for backward compatibility.
-- Drop the legacy snapshot constraint if it was installed independently.
ALTER TABLE geniusbot.appointments
    DROP CONSTRAINT IF EXISTS chk_appointments_cancellation_reason;

COMMIT;
