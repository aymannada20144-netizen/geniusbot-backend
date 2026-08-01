BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'geniusbot' AND table_name = 'branches'
          AND column_name = 'city' AND is_nullable <> 'NO'
    ) THEN
        RAISE EXCEPTION 'branches.city must be NOT NULL.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.branches'::regclass
          AND conname = 'chk_branches_city_not_blank'
    ) THEN
        RAISE EXCEPTION 'Blank-city constraint is missing.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'geniusbot.branches'::regclass
          AND conname = 'chk_branches_name_not_blank'
    ) THEN
        RAISE EXCEPTION 'Blank-name constraint is missing.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot' AND tablename = 'branches'
          AND indexname = 'uq_branches_clinic_city_name_normalized'
    ) THEN
        RAISE EXCEPTION 'Normalized branch uniqueness index is missing.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.branches
        WHERE city IS NULL OR btrim(city) = '' OR btrim(name) = ''
    ) THEN
        RAISE EXCEPTION 'Live branch data violates name/city requirements.';
    END IF;
END;
$$;

SAVEPOINT branch_city_test;

DO $$
DECLARE
    v_clinic uuid;
BEGIN
    SELECT id INTO v_clinic FROM geniusbot.clinics ORDER BY created_at LIMIT 1;

    BEGIN
        INSERT INTO geniusbot.branches (clinic_id, name, city, timezone)
        VALUES (v_clinic, 'اختبار مدينة فارغة', '   ', 'Asia/Riyadh');
        RAISE EXCEPTION 'Whitespace city was accepted.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO geniusbot.branches (clinic_id, name, city, timezone)
        VALUES (v_clinic, '   ', 'مدينة اختبار', 'Asia/Riyadh');
        RAISE EXCEPTION 'Whitespace name was accepted.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO geniusbot.branches (clinic_id, name, city, timezone)
    VALUES (v_clinic, 'فرع اختبار مشترك', 'مدينة أولى', 'Asia/Riyadh');
    INSERT INTO geniusbot.branches (clinic_id, name, city, timezone)
    VALUES (v_clinic, 'فرع اختبار مشترك', 'مدينة ثانية', 'Asia/Riyadh');

    BEGIN
        INSERT INTO geniusbot.branches (clinic_id, name, city, timezone)
        VALUES (v_clinic, '  فرع اختبار مشترك  ', '  مدينة أولى  ', 'Asia/Riyadh');
        RAISE EXCEPTION 'Normalized duplicate branch was accepted.';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END;
$$;

ROLLBACK TO SAVEPOINT branch_city_test;
ROLLBACK;
