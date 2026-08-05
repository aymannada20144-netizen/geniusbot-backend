BEGIN;

DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT con.conname
        FROM pg_constraint AS con
        WHERE con.conrelid = 'geniusbot.appointment_reminders'::regclass
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%reminder_type%'
    LOOP
        EXECUTE format(
            'ALTER TABLE geniusbot.appointment_reminders DROP CONSTRAINT IF EXISTS %I',
            constraint_name
        );
    END LOOP;
END
$$;

UPDATE geniusbot.appointment_reminders
SET reminder_type = CASE reminder_type
    WHEN '24h' THEN 'day_before'
    WHEN '1h' THEN 'same_day'
    ELSE reminder_type
END
WHERE reminder_type IN ('24h', '1h');

ALTER TABLE geniusbot.appointment_reminders
    DROP CONSTRAINT IF EXISTS chk_appointment_reminders_type,
    ADD CONSTRAINT chk_appointment_reminders_type
    CHECK (reminder_type IN (
        'confirmation',
        'day_before',
        'same_day',
        'followup',
        'google_review',
        'custom'
    ));

COMMIT;
