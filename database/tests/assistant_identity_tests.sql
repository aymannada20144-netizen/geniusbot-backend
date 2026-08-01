BEGIN;

DO $$
DECLARE
    clinic_count bigint;
    identity_count bigint;
BEGIN
    SELECT count(*) INTO clinic_count FROM geniusbot.clinics;
    SELECT count(*) INTO identity_count FROM geniusbot.bot_settings
    WHERE setting_key IN ('assistant_name', 'assistant_gender');
    IF identity_count <> clinic_count * 2 THEN
        RAISE EXCEPTION 'Every clinic must have exactly two assistant identity settings.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.bot_settings
        WHERE setting_key = 'assistant_gender' AND setting_value NOT IN ('female', 'male')
    ) THEN
        RAISE EXCEPTION 'Invalid assistant gender found.';
    END IF;
END;
$$;

DO $$
BEGIN
    BEGIN
        UPDATE geniusbot.bot_settings SET setting_value = E'invalid\nname'
        WHERE setting_key = 'assistant_name';
        RAISE EXCEPTION 'Multiline assistant name was accepted.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE geniusbot.bot_settings SET setting_value = 'other'
        WHERE setting_key = 'assistant_gender';
        RAISE EXCEPTION 'Invalid assistant gender was accepted.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

ROLLBACK;
