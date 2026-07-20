-- ============================================================================
-- GeniusBot Database
-- File: database/schema/002_schema.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS geniusbot;

COMMENT ON SCHEMA geniusbot IS
    'Production schema for the GeniusBot multi-tenant clinic management and booking platform.';

REVOKE CREATE ON SCHEMA geniusbot FROM PUBLIC;

GRANT USAGE ON SCHEMA geniusbot TO PUBLIC;

DO $validation$
DECLARE
    v_schema_owner name;
BEGIN
    SELECT pg_catalog.pg_get_userbyid(n.nspowner)
      INTO v_schema_owner
      FROM pg_catalog.pg_namespace AS n
     WHERE n.nspname = 'geniusbot';

    IF v_schema_owner IS NULL THEN
        RAISE EXCEPTION
            'Validation failed: schema "geniusbot" does not exist.';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(
        pg_catalog.current_user,
        'geniusbot',
        'USAGE'
    ) THEN
        RAISE EXCEPTION
            'Validation failed: current user "%" does not have USAGE privilege on schema "geniusbot".',
            pg_catalog.current_user;
    END IF;

    IF NOT pg_catalog.has_schema_privilege(
        pg_catalog.current_user,
        'geniusbot',
        'CREATE'
    ) THEN
        RAISE EXCEPTION
            'Validation failed: current user "%" does not have CREATE privilege on schema "geniusbot".',
            pg_catalog.current_user;
    END IF;

    IF pg_catalog.has_schema_privilege(
        'PUBLIC',
        'geniusbot',
        'CREATE'
    ) THEN
        RAISE EXCEPTION
            'Validation failed: PUBLIC must not have CREATE privilege on schema "geniusbot".';
    END IF;

    RAISE NOTICE
        'Validation successful: schema "geniusbot" exists, owner="%", current_user="%", PUBLIC CREATE privilege revoked.',
        v_schema_owner,
        pg_catalog.current_user;
END;
$validation$ LANGUAGE plpgsql;

COMMIT;