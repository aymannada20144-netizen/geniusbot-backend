-- ============================================================================
-- GeniusBot Database
-- File: database/scripts/rebuild_database.sql
-- PostgreSQL: 16+
-- Schema: geniusbot
-- WARNING: Destructive operation. All objects and data in geniusbot are removed.
-- ============================================================================

\set ON_ERROR_STOP on

\echo '============================================================================'
\echo ' GeniusBot Database Rebuild'
\echo ' WARNING: All objects and data in schema "geniusbot" will be deleted.'
\echo '============================================================================'

-- ============================================================================
-- Remove Current GeniusBot Schema
-- ============================================================================

\echo ''
\echo '[1/3] Dropping existing GeniusBot schema...'

DROP SCHEMA IF EXISTS geniusbot CASCADE;

-- ============================================================================
-- Validate Cleanup
-- ============================================================================

\echo ''
\echo '[2/3] Validating schema cleanup...'

DO $validation$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_namespace
         WHERE nspname = 'geniusbot'
    ) THEN
        RAISE EXCEPTION
            'Rebuild cleanup failed: schema "geniusbot" still exists.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_extension AS e
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = e.extnamespace
         WHERE e.extname = 'btree_gist'
           AND n.nspname = 'geniusbot'
    ) THEN
        RAISE EXCEPTION
            'Rebuild cleanup failed: extension "btree_gist" still exists in schema "geniusbot".';
    END IF;

    RAISE NOTICE
        'Cleanup validation successful: schema "geniusbot" was removed.';
END;
$validation$ LANGUAGE plpgsql;

-- ============================================================================
-- Reinstall Database
-- ============================================================================

\echo ''
\echo '[3/3] Reinstalling GeniusBot database...'

\ir install_database.sql

-- ============================================================================
-- Final Rebuild Validation
-- ============================================================================

\echo ''
\echo 'Running final rebuild validation...'

DO $validation$
DECLARE
    v_required_tables constant text[] := ARRAY[
        'clinics',
        'branches',
        'services',
        'doctors',
        'rooms',
        'patients',
        'appointments'
    ];
    v_table_name text;
    v_missing_tables text[] := ARRAY[]::text[];
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_namespace
         WHERE nspname = 'geniusbot'
    ) THEN
        RAISE EXCEPTION
            'Rebuild validation failed: schema "geniusbot" does not exist.';
    END IF;

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
        END IF;
    END LOOP;

    IF pg_catalog.cardinality(v_missing_tables) > 0 THEN
        RAISE EXCEPTION
            'Rebuild validation failed: missing required tables: %',
            pg_catalog.array_to_string(
                v_missing_tables,
                ', '
            );
    END IF;

    RAISE NOTICE
        'Rebuild validation successful: schema "geniusbot" and all required core tables exist.';
END;
$validation$ LANGUAGE plpgsql;

\echo ''
\echo '============================================================================'
\echo ' GeniusBot Database Rebuilt Successfully'
\echo '============================================================================'