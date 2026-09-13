BEGIN;

ALTER TABLE geniusbot.appointment_change_deliveries
  DROP CONSTRAINT IF EXISTS appointment_change_deliveries_status_check;

ALTER TABLE geniusbot.appointment_change_deliveries
  ADD COLUMN IF NOT EXISTS provider_status_at timestamptz;

ALTER TABLE geniusbot.appointment_change_deliveries
  ADD CONSTRAINT appointment_change_deliveries_status_check
  CHECK (status IN ('processing', 'sent', 'delivered', 'read', 'failed', 'uncertain'));

COMMIT;
