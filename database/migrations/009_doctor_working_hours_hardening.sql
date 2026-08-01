BEGIN;

SET LOCAL search_path TO geniusbot, pg_catalog;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE EXTENSION IF NOT EXISTS btree_gist
    WITH SCHEMA geniusbot;

LOCK TABLE geniusbot.doctor_working_hours IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
    v_problem_count integer;
BEGIN
    SELECT count(*) INTO v_problem_count
    FROM geniusbot.doctor_working_hours AS dwh
    LEFT JOIN geniusbot.doctors AS d ON d.id = dwh.doctor_id
    LEFT JOIN geniusbot.branches AS b ON b.id = dwh.branch_id
    WHERE d.id IS NULL
       OR b.id IS NULL
       OR d.clinic_id IS DISTINCT FROM b.clinic_id;
    IF v_problem_count <> 0 THEN
        RAISE EXCEPTION
            'Doctor working-hours preflight failed: % tenant/reference mismatches.',
            v_problem_count;
    END IF;

    SELECT count(*) INTO v_problem_count
    FROM geniusbot.doctor_working_hours
    WHERE day_of_week NOT BETWEEN 0 AND 6
       OR start_time IS NULL
       OR end_time IS NULL
       OR start_time >= end_time;
    IF v_problem_count <> 0 THEN
        RAISE EXCEPTION
            'Doctor working-hours preflight failed: % invalid day/time rows.',
            v_problem_count;
    END IF;

    SELECT count(*) INTO v_problem_count
    FROM (
        SELECT doctor_id, branch_id, day_of_week, start_time, end_time
        FROM geniusbot.doctor_working_hours
        GROUP BY doctor_id, branch_id, day_of_week, start_time, end_time
        HAVING count(*) > 1
    ) AS duplicates;
    IF v_problem_count <> 0 THEN
        RAISE EXCEPTION
            'Doctor working-hours preflight failed: % exact duplicate groups.',
            v_problem_count;
    END IF;

    SELECT count(*) INTO v_problem_count
    FROM geniusbot.doctor_working_hours AS left_period
    JOIN geniusbot.doctor_working_hours AS right_period
      ON left_period.id < right_period.id
     AND left_period.doctor_id = right_period.doctor_id
     AND left_period.day_of_week = right_period.day_of_week
     AND left_period.is_active IS TRUE
     AND right_period.is_active IS TRUE
     AND left_period.start_time < right_period.end_time
     AND right_period.start_time < left_period.end_time;
    IF v_problem_count <> 0 THEN
        RAISE EXCEPTION
            'Doctor working-hours preflight failed: % active overlap pairs.',
            v_problem_count;
    END IF;
END;
$preflight$ LANGUAGE plpgsql;

ALTER TABLE geniusbot.doctor_working_hours
    DROP CONSTRAINT IF EXISTS doctor_working_hours_doctor_id_fkey,
    DROP CONSTRAINT IF EXISTS doctor_working_hours_branch_id_fkey,
    DROP CONSTRAINT IF EXISTS doctor_working_hours_day_of_week_check,
    DROP CONSTRAINT IF EXISTS doctor_working_hours_check,
    DROP CONSTRAINT IF EXISTS doctor_working_hours_doctor_id_branch_id_day_of_week_start__key,
    DROP CONSTRAINT IF EXISTS fk_doctor_working_hours_doctor,
    DROP CONSTRAINT IF EXISTS fk_doctor_working_hours_branch,
    DROP CONSTRAINT IF EXISTS chk_doctor_working_hours_day,
    DROP CONSTRAINT IF EXISTS chk_doctor_working_hours_time_range,
    DROP CONSTRAINT IF EXISTS uq_doctor_working_hours_schedule,
    DROP CONSTRAINT IF EXISTS excl_doctor_working_hours_active_overlap;

ALTER TABLE geniusbot.doctor_working_hours
    ADD CONSTRAINT fk_doctor_working_hours_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES geniusbot.doctors(id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE,
    ADD CONSTRAINT fk_doctor_working_hours_branch
        FOREIGN KEY (branch_id)
        REFERENCES geniusbot.branches(id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE,
    ADD CONSTRAINT chk_doctor_working_hours_day
        CHECK (day_of_week BETWEEN 0 AND 6),
    ADD CONSTRAINT chk_doctor_working_hours_time_range
        CHECK (start_time < end_time),
    ADD CONSTRAINT uq_doctor_working_hours_schedule
        UNIQUE (doctor_id, branch_id, day_of_week, start_time, end_time),
    ADD CONSTRAINT excl_doctor_working_hours_active_overlap
        EXCLUDE USING gist (
            doctor_id geniusbot.gist_uuid_ops WITH =,
            day_of_week geniusbot.gist_int4_ops WITH =,
            tsrange(
                timestamp '2000-01-01' + start_time,
                timestamp '2000-01-01' + end_time,
                '[)'
            ) WITH &&
        )
        WHERE (is_active IS TRUE);

CREATE INDEX IF NOT EXISTS idx_doctor_working_hours_lookup
    ON geniusbot.doctor_working_hours (
        doctor_id,
        branch_id,
        day_of_week,
        is_active
    );

CREATE OR REPLACE FUNCTION geniusbot.validate_doctor_working_hours_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_doctor_clinic_id uuid;
    v_doctor_active boolean;
    v_branch_clinic_id uuid;
    v_branch_active boolean;
BEGIN
    SELECT clinic_id, is_active
      INTO v_doctor_clinic_id, v_doctor_active
      FROM geniusbot.doctors
     WHERE id = NEW.doctor_id;

    IF v_doctor_clinic_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_doctor_working_hours_doctor',
            MESSAGE = 'Doctor does not exist.';
    END IF;

    SELECT clinic_id, is_active
      INTO v_branch_clinic_id, v_branch_active
      FROM geniusbot.branches
     WHERE id = NEW.branch_id;

    IF v_branch_clinic_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_doctor_working_hours_branch',
            MESSAGE = 'Branch does not exist.';
    END IF;

    IF v_doctor_clinic_id IS DISTINCT FROM v_branch_clinic_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_doctor_working_hours_clinic_integrity',
            MESSAGE = 'Doctor and branch must belong to the same clinic.';
    END IF;

    IF NEW.is_active IS TRUE AND v_doctor_active IS NOT TRUE THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_doctor_working_hours_doctor_active',
            MESSAGE = 'Active working hours require an active doctor.';
    END IF;

    IF NEW.is_active IS TRUE AND v_branch_active IS NOT TRUE THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_doctor_working_hours_branch_active',
            MESSAGE = 'Active working hours require an active branch.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_doctor_working_hours_validate_integrity
    ON geniusbot.doctor_working_hours;

CREATE TRIGGER trg_doctor_working_hours_validate_integrity
BEFORE INSERT OR UPDATE
ON geniusbot.doctor_working_hours
FOR EACH ROW
EXECUTE FUNCTION geniusbot.validate_doctor_working_hours_integrity();

DO $validation$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.doctor_working_hours'::regclass
          AND conname = 'excl_doctor_working_hours_active_overlap'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'doctor_working_hours'
          AND indexname = 'idx_doctor_working_hours_lookup'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.doctor_working_hours'::regclass
          AND tgname = 'trg_doctor_working_hours_validate_integrity'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION
            'Doctor working-hours hardening validation failed.';
    END IF;
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
