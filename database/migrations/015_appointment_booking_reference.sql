BEGIN;

CREATE OR REPLACE FUNCTION geniusbot.generate_appointment_booking_reference()
RETURNS varchar
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    candidate varchar(8);
BEGIN
    LOOP
        candidate := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
        EXIT WHEN NOT EXISTS (
            SELECT 1
            FROM geniusbot.appointments
            WHERE booking_reference = candidate
        );
    END LOOP;
    RETURN candidate;
END;
$$;

ALTER TABLE geniusbot.appointments
    ADD COLUMN IF NOT EXISTS booking_reference varchar(8);

UPDATE geniusbot.appointments
SET booking_reference = geniusbot.generate_appointment_booking_reference()
WHERE booking_reference IS NULL;

ALTER TABLE geniusbot.appointments
    ALTER COLUMN booking_reference
        SET DEFAULT geniusbot.generate_appointment_booking_reference(),
    ALTER COLUMN booking_reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_booking_reference
    ON geniusbot.appointments (booking_reference);

COMMENT ON COLUMN geniusbot.appointments.booking_reference IS
    'Public, immutable booking reference shown to patients; never derived from or replaced by the internal appointment UUID.';

COMMIT;

