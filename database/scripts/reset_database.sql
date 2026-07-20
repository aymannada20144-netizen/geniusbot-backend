-- ============================================================================
-- GeniusBot Database
-- File: database/scripts/reset_database.sql
-- PostgreSQL: 16+
-- Schema: geniusbot
-- WARNING: Destructive operation. All data in geniusbot tables will be deleted.
-- ============================================================================

\set ON_ERROR_STOP on

\echo '============================================================================'
\echo ' GeniusBot Database Data Reset'
\echo ' WARNING: All data in schema "geniusbot" will be deleted and reseeded.'
\echo '============================================================================'

-- ============================================================================
-- Pre-Reset Validation
-- ============================================================================

\echo ''
\echo '[1/4] Validating database structure...'

DO $validation$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_namespace
         WHERE nspname = 'geniusbot'
    ) THEN
        RAISE EXCEPTION
            'Reset failed: schema "geniusbot" does not exist. Run install_database.sql first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = c.relnamespace
         WHERE n.nspname = 'geniusbot'
           AND c.relkind IN ('r', 'p')
    ) THEN
        RAISE EXCEPTION
            'Reset failed: schema "geniusbot" contains no tables.';
    END IF;

    RAISE NOTICE
        'Pre-reset validation successful.';
END;
$validation$ LANGUAGE plpgsql;

-- ============================================================================
-- Delete Existing Data
-- ============================================================================

\echo ''
\echo '[2/4] Truncating all GeniusBot tables...'

BEGIN;

DO $reset$
DECLARE
    v_table_list text;
BEGIN
    SELECT pg_catalog.string_agg(
               pg_catalog.format(
                   'geniusbot.%I',
                   c.relname
               ),
               ', '
               ORDER BY c.relname
           )
      INTO v_table_list
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n
        ON n.oid = c.relnamespace
     WHERE n.nspname = 'geniusbot'
       AND c.relkind IN ('r', 'p')
       AND NOT c.relispartition;

    IF v_table_list IS NULL THEN
        RAISE EXCEPTION
            'Reset failed: no truncatable tables were found in schema "geniusbot".';
    END IF;

    EXECUTE
        'TRUNCATE TABLE '
        || v_table_list
        || ' RESTART IDENTITY CASCADE';
END;
$reset$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- Validate Cleanup
-- ============================================================================

\echo ''
\echo '[3/4] Validating data cleanup...'

DO $validation$
DECLARE
    v_table record;
    v_row_count bigint;
    v_non_empty_tables text[] := ARRAY[]::text[];
BEGIN
    FOR v_table IN
        SELECT c.relname AS table_name
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = c.relnamespace
         WHERE n.nspname = 'geniusbot'
           AND c.relkind IN ('r', 'p')
           AND NOT c.relispartition
         ORDER BY c.relname
    LOOP
        EXECUTE pg_catalog.format(
            'SELECT count(*) FROM geniusbot.%I',
            v_table.table_name
        )
        INTO v_row_count;

        IF v_row_count <> 0 THEN
            v_non_empty_tables :=
                pg_catalog.array_append(
                    v_non_empty_tables,
                    v_table.table_name
                );
        END IF;
    END LOOP;

    IF pg_catalog.cardinality(v_non_empty_tables) > 0 THEN
        RAISE EXCEPTION
            'Cleanup validation failed: non-empty tables: %',
            pg_catalog.array_to_string(
                v_non_empty_tables,
                ', '
            );
    END IF;

    RAISE NOTICE
        'Cleanup validation successful: all GeniusBot tables are empty.';
END;
$validation$ LANGUAGE plpgsql;

-- ============================================================================
-- Reload Seed Data
-- ============================================================================

\echo ''
\echo '[4/4] Reloading seed data...'

\ir ../seed/001_reference_data.sql
\ir ../seed/002_clinic_structure.sql
\ir ../seed/003_operational_data.sql
\ir ../seed/004_booking_scenarios.sql

-- ============================================================================
-- Final Validation
-- ============================================================================

\echo ''
\echo 'Running final reset validation...'

DO $validation$
DECLARE
    v_required_tables constant text[] := ARRAY[
        'clinics',
        'branches',
        'services',
        'doctors',
        'payment_methods',
        'service_assignments',
        'patients',
        'appointments'
    ];

    v_table_name text;
    v_missing_tables text[] := ARRAY[]::text[];
    v_empty_tables text[] := ARRAY[]::text[];
    v_row_count bigint;
BEGIN
    FOREACH v_table_name IN ARRAY v_required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_class AS c
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = c.relnamespace
             WHERE n.nspname = 'geniusbot'
               AND c.relname = v_table_name
               AND c.relkind IN ('r', 'p')
        ) THEN
            v_missing_tables :=
                pg_catalog.array_append(
                    v_missing_tables,
                    v_table_name
                );
            CONTINUE;
        END IF;

        EXECUTE pg_catalog.format(
            'SELECT count(*) FROM geniusbot.%I',
            v_table_name
        )
        INTO v_row_count;

        IF v_row_count = 0 THEN
            v_empty_tables :=
                pg_catalog.array_append(
                    v_empty_tables,
                    v_table_name
                );
        END IF;
    END LOOP;

    IF pg_catalog.cardinality(v_missing_tables) > 0 THEN
        RAISE EXCEPTION
            'Reset validation failed: missing required tables: %',
            pg_catalog.array_to_string(
                v_missing_tables,
                ', '
            );
    END IF;

    IF pg_catalog.cardinality(v_empty_tables) > 0 THEN
        RAISE EXCEPTION
            'Reset validation failed: required seeded tables are empty: %',
            pg_catalog.array_to_string(
                v_empty_tables,
                ', '
            );
    END IF;

    IF EXISTS (
        SELECT 1
          FROM geniusbot.appointments AS a
          LEFT JOIN geniusbot.clinics AS c
            ON c.id = a.clinic_id
          LEFT JOIN geniusbot.branches AS b
            ON b.id = a.branch_id
          LEFT JOIN geniusbot.patients AS p
            ON p.id = a.patient_id
          LEFT JOIN geniusbot.services AS s
            ON s.id = a.service_id
         WHERE c.id IS NULL
            OR b.id IS NULL
            OR p.id IS NULL
            OR s.id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Reset validation failed: orphaned appointment references were detected.';
    END IF;

    RAISE NOTICE
        'Reset validation successful: all required seed data was restored.';
END;
$validation$ LANGUAGE plpgsql;

\echo ''
\echo '============================================================================'
\echo ' GeniusBot Database Data Reset Completed Successfully'
\echo '============================================================================'