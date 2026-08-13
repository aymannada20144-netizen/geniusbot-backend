BEGIN;

ALTER TABLE geniusbot.appointment_reminders
    DROP CONSTRAINT IF EXISTS chk_appointment_reminders_type,
    ADD CONSTRAINT chk_appointment_reminders_type
    CHECK (reminder_type IN (
        'confirmation',
        'day_before',
        'same_day',
        'followup',
        'google_review',
        'custom',
        'cancellation'
    ));

COMMIT;
