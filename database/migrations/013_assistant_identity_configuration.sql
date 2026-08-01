BEGIN;

DO $$
DECLARE
    missing_columns text;
BEGIN
    IF to_regnamespace('geniusbot') IS NULL THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: schema geniusbot is missing.';
    END IF;
    IF to_regclass('geniusbot.bot_settings') IS NULL THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: table geniusbot.bot_settings is missing.';
    END IF;
    SELECT string_agg(required.name, ', ')
    INTO missing_columns
    FROM (VALUES ('id'), ('clinic_id'), ('setting_key'), ('setting_value'), ('updated_at')) required(name)
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'geniusbot'
          AND table_name = 'bot_settings'
          AND column_name = required.name
    );
    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: missing bot_settings columns: %.', missing_columns;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.bot_settings'::regclass
          AND contype = 'f'
          AND confrelid = 'geniusbot.clinics'::regclass
    ) THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: clinic foreign key is missing.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = 'geniusbot.bot_settings'::regclass
          AND i.indisunique
          AND (SELECT array_agg(a.attname ORDER BY keys.ordinality)
               FROM unnest(i.indkey) WITH ORDINALITY keys(attnum, ordinality)
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = keys.attnum)
              = ARRAY['clinic_id', 'setting_key']::name[]
    ) THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: unique clinic/key constraint is missing.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.bot_settings
        GROUP BY clinic_id, setting_key HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: duplicate clinic settings exist.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.bot_settings s
        LEFT JOIN geniusbot.clinics c ON c.id = s.clinic_id
        WHERE c.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: orphan clinic settings exist.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.bot_settings
        WHERE setting_key = 'assistant_name'
          AND (setting_value IS NULL OR btrim(setting_value) = ''
               OR char_length(setting_value) > 40
               OR setting_value ~ E'[\\n\\r]'
               OR setting_value ~ '[[:cntrl:]]'
               OR setting_value ~ U&'[\200B-\200F\202A-\202E\2060-\2069\FEFF]')
    ) THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: an invalid assistant_name exists.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.bot_settings
        WHERE setting_key = 'assistant_gender'
          AND (setting_value IS NULL OR setting_value NOT IN ('female', 'male'))
    ) THEN
        RAISE EXCEPTION 'Assistant identity migration stopped: an invalid assistant_gender exists.';
    END IF;
END;
$$;

CREATE TEMP TABLE assistant_identity_before ON COMMIT DROP AS
SELECT clinic_id, setting_key, setting_value
FROM geniusbot.bot_settings
WHERE setting_key IN ('assistant_name', 'assistant_gender');

INSERT INTO geniusbot.bot_settings (clinic_id, setting_key, setting_value)
SELECT c.id, defaults.setting_key, defaults.setting_value
FROM geniusbot.clinics c
CROSS JOIN (VALUES
    ('assistant_name'::varchar, 'شادن'::text),
    ('assistant_gender'::varchar, 'female'::text)
) defaults(setting_key, setting_value)
ON CONFLICT (clinic_id, setting_key) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.bot_settings'::regclass
          AND conname = 'bot_settings_assistant_name_valid'
    ) THEN
        ALTER TABLE geniusbot.bot_settings
        ADD CONSTRAINT bot_settings_assistant_name_valid CHECK (
            setting_key <> 'assistant_name' OR (
                setting_value IS NOT NULL
                AND btrim(setting_value) <> ''
                AND char_length(setting_value) <= 40
                AND setting_value !~ E'[\\n\\r]'
                AND setting_value !~ '[[:cntrl:]]'
                AND setting_value !~ U&'[\200B-\200F\202A-\202E\2060-\2069\FEFF]'
            )
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.bot_settings'::regclass
          AND conname = 'bot_settings_assistant_gender_valid'
    ) THEN
        ALTER TABLE geniusbot.bot_settings
        ADD CONSTRAINT bot_settings_assistant_gender_valid CHECK (
            setting_key <> 'assistant_gender'
            OR setting_value IN ('female', 'male')
        );
    END IF;
END;
$$;

DO $$
DECLARE
    clinic_count bigint;
    identity_count bigint;
BEGIN
    SELECT count(*) INTO clinic_count FROM geniusbot.clinics;
    SELECT count(*) INTO identity_count
    FROM geniusbot.bot_settings
    WHERE setting_key IN ('assistant_name', 'assistant_gender');
    IF identity_count <> clinic_count * 2 THEN
        RAISE EXCEPTION 'Assistant identity postflight failed: expected % settings, found %.', clinic_count * 2, identity_count;
    END IF;
    IF EXISTS (
        SELECT 1 FROM assistant_identity_before before
        LEFT JOIN geniusbot.bot_settings after
          ON after.clinic_id = before.clinic_id AND after.setting_key = before.setting_key
        WHERE after.setting_value IS DISTINCT FROM before.setting_value
    ) THEN
        RAISE EXCEPTION 'Assistant identity postflight failed: an existing value changed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'geniusbot.bot_settings'::regclass AND conname = 'bot_settings_assistant_name_valid')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'geniusbot.bot_settings'::regclass AND conname = 'bot_settings_assistant_gender_valid') THEN
        RAISE EXCEPTION 'Assistant identity postflight failed: constraints are missing.';
    END IF;
END;
$$;

COMMIT;

-- Rollback intentionally removes only the two validation constraints. It must
-- not delete assistant identity rows or restore names, because those values are
-- clinic-owned configuration:
-- ALTER TABLE geniusbot.bot_settings DROP CONSTRAINT IF EXISTS bot_settings_assistant_name_valid;
-- ALTER TABLE geniusbot.bot_settings DROP CONSTRAINT IF EXISTS bot_settings_assistant_gender_valid;
