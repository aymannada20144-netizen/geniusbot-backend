-- ============================================================================
-- GeniusBot Database
-- File: database/schema/001_extensions.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS geniusbot;

CREATE EXTENSION IF NOT EXISTS btree_gist
    WITH SCHEMA geniusbot;

DO $validation$
DECLARE
    v_extension_schema text;
BEGIN
    SELECT n.nspname
      INTO v_extension_schema
      FROM pg_catalog.pg_extension AS e
      JOIN pg_catalog.pg_namespace AS n
        ON n.oid = e.extnamespace
     WHERE e.extname = 'btree_gist';

    IF v_extension_schema IS NULL THEN
        RAISE EXCEPTION
            'Required extension "btree_gist" is not installed.';
    END IF;

    IF v_extension_schema <> 'geniusbot' THEN
        RAISE EXCEPTION
            'Extension "btree_gist" is installed in schema "%", expected "geniusbot".',
            v_extension_schema;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_opclass AS opc
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = opc.opcnamespace
          JOIN pg_catalog.pg_am AS am
            ON am.oid = opc.opcmethod
         WHERE n.nspname = 'geniusbot'
           AND am.amname = 'gist'
           AND opc.opcname = 'gist_uuid_ops'
    ) THEN
        RAISE EXCEPTION
            'Validation failed: GiST UUID operator class "geniusbot.gist_uuid_ops" is unavailable.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_opclass AS opc
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = opc.opcnamespace
          JOIN pg_catalog.pg_am AS am
            ON am.oid = opc.opcmethod
         WHERE n.nspname = 'geniusbot'
           AND am.amname = 'gist'
           AND opc.opcname = 'gist_text_ops'
    ) THEN
        RAISE EXCEPTION
            'Validation failed: GiST text operator class "geniusbot.gist_text_ops" is unavailable.';
    END IF;

    RAISE NOTICE
        'Validation successful: required extension "btree_gist" is installed in schema "geniusbot".';
END;
$validation$ LANGUAGE plpgsql;

COMMIT;