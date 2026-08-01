BEGIN;

DO $$
DECLARE
    v_before_count bigint;
    v_unresolved_count bigint;
BEGIN
    SELECT COUNT(*) INTO v_before_count FROM geniusbot.branches;
    RAISE NOTICE 'Branch city preflight: total branches=%', v_before_count;
    RAISE NOTICE 'Branch city preflight: null cities=%',
        (SELECT COUNT(*) FROM geniusbot.branches WHERE city IS NULL);
    RAISE NOTICE 'Branch city preflight: blank cities=%',
        (SELECT COUNT(*) FROM geniusbot.branches WHERE city IS NOT NULL AND btrim(city) = '');
    RAISE NOTICE 'Branch city preflight: names containing known city suffixes=%',
        (SELECT COUNT(*) FROM geniusbot.branches
         WHERE name IN (
            'فرع الحمدانية — جدة',
            'فرع الصالحية — جدة',
            'فرع العليا — الرياض',
            'فرع الروضة — جدة'
         ));
    RAISE NOTICE 'Branch city preflight: current city values=%',
        (SELECT string_agg(format('%s (%s)', city_value, city_count), ', ' ORDER BY city_value)
         FROM (
            SELECT coalesce(city, '<NULL>') AS city_value, COUNT(*) AS city_count
            FROM geniusbot.branches
            GROUP BY city
         ) city_summary);

    SELECT COUNT(*) INTO v_unresolved_count
    FROM geniusbot.branches
    WHERE NOT (
        (id = '00000000-0000-0000-0000-000000000101'::uuid
         AND name IN ('فرع الحمدانية — جدة', 'فرع الحمدانية')
         AND btrim(city) IN ('Jeddah', 'جدة'))
        OR
        (id = '7c778d44-2b6f-439a-b286-226d0b4f376d'::uuid
         AND name IN ('فرع الصالحية — جدة', 'فرع الصالحية')
         AND btrim(city) IN ('Jeddah', 'جدة'))
        OR
        (id = 'e0a1eff0-7eb7-4570-99e5-d7bf8d739460'::uuid
         AND name IN ('فرع العليا — الرياض', 'فرع العليا')
         AND btrim(city) IN ('Riyadh', 'الرياض'))
        OR
        (id = 'ea91bde2-ee32-405c-89f6-e65cdbe7fa06'::uuid
         AND name IN ('فرع الروضة — جدة', 'فرع الروضة')
         AND btrim(city) IN ('Jeddah', 'جدة'))
    );

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION
            'Branch city migration stopped: % branch record(s) do not match the reviewed deterministic data set.',
            v_unresolved_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            VALUES
                ('00000000-0000-0000-0000-000000000001'::uuid, 'جدة', 'فرع الحمدانية'),
                ('00000000-0000-0000-0000-000000000001'::uuid, 'جدة', 'فرع الصالحية'),
                ('00000000-0000-0000-0000-000000000001'::uuid, 'الرياض', 'فرع العليا'),
                ('00000000-0000-0000-0000-000000000001'::uuid, 'جدة', 'فرع الروضة')
        ) AS normalized(clinic_id, city, name)
        GROUP BY clinic_id, lower(btrim(city)), lower(btrim(name))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Branch city migration stopped: normalized target values conflict.';
    END IF;
END;
$$;

UPDATE geniusbot.branches
SET name = 'فرع الحمدانية', city = 'جدة', updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000101'::uuid
  AND name = 'فرع الحمدانية — جدة'
  AND btrim(city) = 'Jeddah';

UPDATE geniusbot.branches
SET name = 'فرع الصالحية', city = 'جدة', updated_at = NOW()
WHERE id = '7c778d44-2b6f-439a-b286-226d0b4f376d'::uuid
  AND name = 'فرع الصالحية — جدة'
  AND btrim(city) = 'Jeddah';

UPDATE geniusbot.branches
SET name = 'فرع العليا', city = 'الرياض', updated_at = NOW()
WHERE id = 'e0a1eff0-7eb7-4570-99e5-d7bf8d739460'::uuid
  AND name = 'فرع العليا — الرياض'
  AND btrim(city) = 'Riyadh';

UPDATE geniusbot.branches
SET name = 'فرع الروضة', city = 'جدة', updated_at = NOW()
WHERE id = 'ea91bde2-ee32-405c-89f6-e65cdbe7fa06'::uuid
  AND name = 'فرع الروضة — جدة'
  AND btrim(city) = 'Jeddah';

UPDATE geniusbot.branches
SET name = btrim(name), city = btrim(city)
WHERE name <> btrim(name) OR city <> btrim(city);

ALTER TABLE geniusbot.branches
    DROP CONSTRAINT IF EXISTS branches_clinic_id_name_key,
    ADD CONSTRAINT chk_branches_name_not_blank CHECK (btrim(name) <> ''),
    ADD CONSTRAINT chk_branches_city_not_blank CHECK (btrim(city) <> ''),
    ALTER COLUMN city SET NOT NULL;

CREATE UNIQUE INDEX uq_branches_clinic_city_name_normalized
    ON geniusbot.branches (clinic_id, lower(btrim(city)), lower(btrim(name)));
CREATE INDEX idx_branches_clinic_active_city
    ON geniusbot.branches (clinic_id, is_active, lower(btrim(city)));
CREATE INDEX idx_branches_clinic_city_name
    ON geniusbot.branches (clinic_id, lower(btrim(city)), lower(btrim(name)), is_active);

DO $$
DECLARE
    v_after_count bigint;
BEGIN
    SELECT COUNT(*) INTO v_after_count FROM geniusbot.branches;
    IF v_after_count <> 4 THEN
        RAISE EXCEPTION 'Branch city migration row-count verification failed: expected 4, found %.', v_after_count;
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.branches
        WHERE city IS NULL OR btrim(city) = '' OR btrim(name) = ''
    ) THEN
        RAISE EXCEPTION 'Branch city migration verification failed: blank branch name or city remains.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM geniusbot.branches
        GROUP BY clinic_id, lower(btrim(city)), lower(btrim(name))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Branch city migration verification failed: normalized duplicate remains.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'branches'
          AND indexname = 'uq_branches_clinic_city_name_normalized'
    ) THEN
        RAISE EXCEPTION 'Branch city migration verification failed: unique index is missing.';
    END IF;
END;
$$;

COMMIT;
