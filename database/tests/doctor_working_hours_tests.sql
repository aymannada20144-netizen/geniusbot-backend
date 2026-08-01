BEGIN;

SET LOCAL search_path TO geniusbot, pg_catalog;

DO $tests$
DECLARE
    v_doctor_id uuid := '11111111-1111-1111-1111-111111111999';
    v_branch_one uuid := '7c778d44-2b6f-439a-b286-226d0b4f376d';
    v_branch_two uuid := '00000000-0000-0000-0000-000000000101';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.doctor_working_hours'::regclass
          AND conname = 'excl_doctor_working_hours_active_overlap'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.doctor_working_hours'::regclass
          AND tgname = 'trg_doctor_working_hours_validate_integrity'
          AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'doctor_working_hours'
          AND indexname = 'idx_doctor_working_hours_lookup'
    ) THEN
        RAISE EXCEPTION 'Schema/live parity test failed.';
    END IF;

    INSERT INTO geniusbot.doctor_working_hours (
        doctor_id, branch_id, day_of_week, start_time, end_time, is_active
    ) VALUES
        (v_doctor_id, v_branch_one, 5, '08:00', '10:00', TRUE),
        (v_doctor_id, v_branch_two, 5, '10:00', '12:00', TRUE);

    BEGIN
        INSERT INTO geniusbot.doctor_working_hours (
            doctor_id, branch_id, day_of_week, start_time, end_time, is_active
        ) VALUES (v_doctor_id, v_branch_one, 5, '09:00', '11:00', TRUE);
        RAISE EXCEPTION 'Partial/cross-branch overlap was accepted.';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO geniusbot.doctor_working_hours (
            doctor_id, branch_id, day_of_week, start_time, end_time, is_active
        ) VALUES (v_doctor_id, v_branch_one, 5, '07:00', '13:00', TRUE);
        RAISE EXCEPTION 'Enclosing overlap was accepted.';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO geniusbot.doctor_working_hours (
            doctor_id, branch_id, day_of_week, start_time, end_time, is_active
        ) VALUES (v_doctor_id, v_branch_one, 5, '08:00', '10:00', TRUE);
        RAISE EXCEPTION 'Exact overlap was accepted.';
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
        NULL;
    END;

    INSERT INTO geniusbot.doctor_working_hours (
        doctor_id, branch_id, day_of_week, start_time, end_time, is_active
    ) VALUES
        (v_doctor_id, v_branch_one, 5, '08:30', '09:30', FALSE),
        (v_doctor_id, v_branch_two, 5, '09:00', '10:30', FALSE);

    BEGIN
        UPDATE geniusbot.doctor_working_hours
           SET start_time = '09:30', end_time = '10:30'
         WHERE doctor_id = v_doctor_id
           AND branch_id = v_branch_two
           AND day_of_week = 5
           AND start_time = '10:00'
           AND is_active IS TRUE;
        RAISE EXCEPTION 'Overlap caused by update was accepted.';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END;
$tests$ LANGUAGE plpgsql;

ROLLBACK;
