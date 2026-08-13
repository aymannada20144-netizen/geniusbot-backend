BEGIN;

ALTER TABLE geniusbot.appointment_change_logs
    DROP CONSTRAINT IF EXISTS chk_appointment_change_logs_operation;

ALTER TABLE geniusbot.appointment_change_logs
    ADD CONSTRAINT chk_appointment_change_logs_operation
    CHECK (operation IN ('cancel', 'reschedule', 'modify', 'change_service'));

COMMIT;
