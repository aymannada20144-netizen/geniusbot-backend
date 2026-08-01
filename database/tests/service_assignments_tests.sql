\set ON_ERROR_STOP on
BEGIN;

DO $tests$
DECLARE
    v_duplicate_index boolean;
    v_default_index boolean;
    v_trigger boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND indexname = 'unique_service_assignment_scope'
    ) INTO v_duplicate_index;
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND indexname = 'unique_default_service_assignment'
          AND indexdef ILIKE '%WHERE%is_active%is_default%'
    ) INTO v_default_index;
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.service_assignments'::regclass
          AND tgname = 'trg_service_assignments_validate_integrity'
          AND NOT tgisinternal
    ) INTO v_trigger;

    IF NOT v_duplicate_index OR NOT v_default_index OR NOT v_trigger THEN
        RAISE EXCEPTION 'Service assignment database contract is incomplete.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments sa
        JOIN geniusbot.services s ON s.id = sa.service_id
        WHERE (s.requires_doctor AND sa.doctor_id IS NULL)
           OR (s.requires_room AND sa.room_id IS NULL)
    ) THEN
        RAISE EXCEPTION 'Existing service assignments violate resource requirements.';
    END IF;
END;
$tests$ LANGUAGE plpgsql;

ROLLBACK;
