```sql
-- =====================================================================
-- GeniusBot Database Reset
-- File: database/scripts/reset_database.sql
-- Target schema: geniusbot
--
-- Purpose:
--   Remove all application data from the geniusbot schema while keeping:
--     - The geniusbot schema
--     - Tables
--     - Constraints
--     - Indexes
--     - Functions
--     - Triggers
--     - Views
--     - Migration history
--
-- This script does not:
--   - Drop the geniusbot schema
--   - Recreate database objects
--   - Modify legacy tables inside public
--   - Run seed files automatically
--
-- After execution, run the seed files in order:
--   001_reference_data.sql
--   002_clinic_structure.sql
--   003_operational_data.sql
--   004_booking_scenarios.sql
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO geniusbot, public;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

-- =====================================================================
-- Prevent concurrent reset executions
-- =====================================================================

SELECT pg_advisory_xact_lock(
    hashtext('geniusbot.database.reset')
);

-- =====================================================================
-- Safety validation
-- =====================================================================

DO $$
DECLARE
    v_schema_exists boolean;
    v_table_count   integer;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_namespace
        WHERE nspname = 'geniusbot'
    )
    INTO v_schema_exists;

    IF v_schema_exists IS NOT TRUE THEN
        RAISE EXCEPTION
            'Database reset aborted: schema geniusbot does not exist.';
    END IF;

    SELECT COUNT(*)
    INTO v_table_count
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'geniusbot';

    IF v_table_count = 0 THEN
        RAISE EXCEPTION
            'Database reset aborted: schema geniusbot contains no tables.';
    END IF;

    IF current_schema() <> 'geniusbot' THEN
        RAISE EXCEPTION
            'Database reset aborted: active schema is %, expected geniusbot.',
            current_schema();
    END IF;

    RAISE NOTICE
        'Reset validation passed. Found % table(s) in schema geniusbot.',
        v_table_count;
END
$$;

-- =====================================================================
-- Snapshot table counts before reset
-- =====================================================================

CREATE TEMP TABLE reset_table_counts_before (
    table_name   text PRIMARY KEY,
    record_count bigint NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
    v_table record;
    v_count bigint;
BEGIN
    FOR v_table IN
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'geniusbot'
          AND tablename NOT IN (
              'schema_migrations',
              'migration_history',
              'migrations',
              'knex_migrations',
              'knex_migrations_lock',
              'sequelize_meta'
          )
        ORDER BY tablename
    LOOP
        EXECUTE format(
            'SELECT COUNT(*) FROM %I.%I',
            'geniusbot',
            v_table.tablename
        )
        INTO v_count;

        INSERT INTO reset_table_counts_before (
            table_name,
            record_count
        )
        VALUES (
            v_table.tablename,
            v_count
        );
    END LOOP;
END
$$;

-- =====================================================================
-- Reset all application tables
--
-- Migration tracking tables are intentionally preserved.
-- CASCADE handles all foreign-key dependencies inside geniusbot.
-- RESTART IDENTITY resets generated identity and sequence values.
-- =====================================================================

DO $$
DECLARE
    v_table_list text;
BEGIN
    SELECT string_agg(
        format('%I.%I', schemaname, tablename),
        ', '
        ORDER BY tablename
    )
    INTO v_table_list
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'geniusbot'
      AND tablename NOT IN (
          'schema_migrations',
          'migration_history',
          'migrations',
          'knex_migrations',
          'knex_migrations_lock',
          'sequelize_meta'
      );

    IF v_table_list IS NULL THEN
        RAISE EXCEPTION
            'Database reset aborted: no resettable tables were found in schema geniusbot.';
    END IF;

    EXECUTE format(
        'TRUNCATE TABLE %s RESTART IDENTITY CASCADE',
        v_table_list
    );

    RAISE NOTICE
        'All application tables inside schema geniusbot were truncated successfully.';
END
$$;

-- =====================================================================
-- Reset generated sequences owned by geniusbot tables
-- =====================================================================

DO $$
DECLARE
    v_sequence record;
BEGIN
    FOR v_sequence IN
        SELECT
            sequence_schema,
            sequence_name
        FROM information_schema.sequences
        WHERE sequence_schema = 'geniusbot'
        ORDER BY sequence_name
    LOOP
        EXECUTE format(
            'ALTER SEQUENCE %I.%I RESTART WITH 1',
            v_sequence.sequence_schema,
            v_sequence.sequence_name
        );
    END LOOP;
END
$$;

-- =====================================================================
-- Final validation
-- =====================================================================

DO $$
DECLARE
    v_table          record;
    v_remaining_rows bigint;
    v_total_rows     bigint := 0;
    v_public_changes integer;
BEGIN
    FOR v_table IN
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'geniusbot'
          AND tablename NOT IN (
              'schema_migrations',
              'migration_history',
              'migrations',
              'knex_migrations',
              'knex_migrations_lock',
              'sequelize_meta'
          )
        ORDER BY tablename
    LOOP
        EXECUTE format(
            'SELECT COUNT(*) FROM %I.%I',
            'geniusbot',
            v_table.tablename
        )
        INTO v_remaining_rows;

        IF v_remaining_rows <> 0 THEN
            RAISE EXCEPTION
                'Database reset validation failed: table geniusbot.% still contains % row(s).',
                v_table.tablename,
                v_remaining_rows;
        END IF;

        v_total_rows := v_total_rows + v_remaining_rows;
    END LOOP;

    SELECT COUNT(*)
    INTO v_public_changes
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
          SELECT table_name
          FROM reset_table_counts_before
      );

    IF v_total_rows <> 0 THEN
        RAISE EXCEPTION
            'Database reset validation failed: % application row(s) remain.',
            v_total_rows;
    END IF;

    RAISE NOTICE
        'Database reset validation passed. All geniusbot application tables are empty.';

    RAISE NOTICE
        'The geniusbot schema and database objects were preserved.';

    RAISE NOTICE
        'Migration tracking tables were preserved when present.';

    RAISE NOTICE
        'No public schema table was included in the reset operation.';
END
$$;

-- =====================================================================
-- Reset report
-- =====================================================================

SELECT
    table_name,
    record_count AS rows_removed,
    0::bigint AS rows_remaining,
    CASE
        WHEN record_count = 0 THEN 'ALREADY_EMPTY'
        ELSE 'RESET'
    END AS reset_status
FROM reset_table_counts_before
ORDER BY table_name;

-- =====================================================================
-- Preserved migration tables report
-- =====================================================================

SELECT
    tablename AS preserved_table,
    'PRESERVED'::text AS reset_status
FROM pg_catalog.pg_tables
WHERE schemaname = 'geniusbot'
  AND tablename IN (
      'schema_migrations',
      'migration_history',
      'migrations',
      'knex_migrations',
      'knex_migrations_lock',
      'sequelize_meta'
  )
ORDER BY tablename;

COMMIT;

-- =====================================================================
-- Next step
-- =====================================================================
--
-- Execute the seed files:
--
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f database/seed/001_reference_data.sql
--
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f database/seed/002_clinic_structure.sql
--
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f database/seed/003_operational_data.sql
--
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f database/seed/004_booking_scenarios.sql
-- =====================================================================
```
