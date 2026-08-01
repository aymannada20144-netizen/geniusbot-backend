BEGIN;

DO $$
BEGIN
    IF to_regclass('geniusbot.clinics') IS NULL THEN
        RAISE EXCEPTION 'WhatsApp clinic resolution migration stopped: clinics table is missing.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.clinics
        WHERE whatsapp_number IS NOT NULL
        GROUP BY regexp_replace(whatsapp_number, '\D', '', 'g')
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'WhatsApp clinic resolution migration stopped: duplicate normalized display numbers exist.';
    END IF;
END;
$$;

ALTER TABLE geniusbot.clinics
ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinics_whatsapp_phone_number_id
ON geniusbot.clinics (whatsapp_phone_number_id)
WHERE whatsapp_phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinics_normalized_whatsapp_number
ON geniusbot.clinics ((regexp_replace(whatsapp_number, '\D', '', 'g')))
WHERE whatsapp_number IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'geniusbot' AND table_name = 'clinics'
          AND column_name = 'whatsapp_phone_number_id'
    ) THEN
        RAISE EXCEPTION 'WhatsApp clinic resolution postflight failed: channel ID column is missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'geniusbot' AND indexname = 'uq_clinics_whatsapp_phone_number_id')
       OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'geniusbot' AND indexname = 'uq_clinics_normalized_whatsapp_number') THEN
        RAISE EXCEPTION 'WhatsApp clinic resolution postflight failed: unique indexes are missing.';
    END IF;
END;
$$;

COMMIT;

-- Rollback is intentionally non-destructive to channel mappings:
-- DROP INDEX IF EXISTS geniusbot.uq_clinics_normalized_whatsapp_number;
-- DROP INDEX IF EXISTS geniusbot.uq_clinics_whatsapp_phone_number_id;
-- ALTER TABLE geniusbot.clinics DROP COLUMN IF EXISTS whatsapp_phone_number_id;
