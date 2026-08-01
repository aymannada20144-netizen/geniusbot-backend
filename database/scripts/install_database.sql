-- ============================================================================
-- GeniusBot Database
-- File: database/scripts/install_database.sql
-- PostgreSQL: 16+
-- Schema: geniusbot
-- ============================================================================

\set ON_ERROR_STOP on

\echo '============================================================================'
\echo ' GeniusBot Database Installation'
\echo '============================================================================'

-- ============================================================================
-- Database Schema
-- ============================================================================

\echo ''
\echo '[1/7] Installing required extensions...'
\ir ../schema/001_extensions.sql

\echo ''
\echo '[2/7] Creating application schema...'
\ir ../schema/002_schema.sql

\echo ''
\echo '[3/7] Creating indexes...'
\ir ../schema/003_indexes.sql

\echo ''
\echo '[4/7] Creating constraints...'
\ir ../schema/004_constraints.sql

\echo ''
\echo '[5/7] Creating functions...'
\ir ../schema/005_functions.sql

\echo ''
\echo '[6/7] Creating triggers...'
\ir ../schema/006_triggers.sql

\echo ''
\echo '[7/7] Creating views...'
\ir ../schema/007_views.sql

-- ============================================================================
-- Seed Data
-- ============================================================================

\echo ''
\echo '[Seed 1/4] Loading reference data...'
\ir ../seed/001_reference_data.sql

\echo ''
\echo '[Seed 2/4] Loading clinic structure...'
\ir ../seed/002_clinic_structure.sql

\echo ''
\echo '[Seed 3/4] Loading operational data...'
\ir ../seed/003_operational_data.sql

\echo ''
\echo '[Seed 4/4] Loading booking scenarios...'
\ir ../seed/004_booking_scenarios.sql

-- ============================================================================
-- Final Validation
-- ============================================================================

\echo ''
\echo 'Running final installation validation...'

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
            'Installation validation failed: schema "geniusbot" does not exist.';
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
                pg_catalog.array_append(v_missing_tables, v_table_name);
        END IF;
    END LOOP;

    IF pg_catalog.cardinality(v_missing_tables) > 0 THEN
        RAISE EXCEPTION
            'Installation validation failed: missing required tables: %',
            pg_catalog.array_to_string(v_missing_tables, ', ');
    END IF;

    RAISE NOTICE
        'Installation validation successful: schema "geniusbot" and all required core tables exist.';
END;
$validation$ LANGUAGE plpgsql;

\echo ''
\echo '============================================================================'
\echo ' GeniusBot Database Installed Successfully'
\echo '============================================================================'
