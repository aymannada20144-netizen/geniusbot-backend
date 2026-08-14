-- ============================================================================
-- GeniusBot Database
-- File: database/schema/006_triggers.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, pg_catalog;

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.create_trigger_if_table_exists(
    p_table_name text,
    p_trigger_name text,
    p_trigger_timing text,
    p_trigger_events text,
    p_function_name text,
    p_update_columns text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_table_exists boolean;
    v_function_exists boolean;
    v_sql text;
BEGIN
    SELECT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = c.relnamespace
         WHERE n.nspname = 'geniusbot'
           AND c.relname = p_table_name
           AND c.relkind IN ('r', 'p')
    )
      INTO v_table_exists;

    IF v_table_exists = false THEN
        RAISE EXCEPTION
            'Cannot create trigger "%": table geniusbot.% does not exist.',
            p_trigger_name,
            p_table_name;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = p.pronamespace
         WHERE n.nspname = 'geniusbot'
           AND p.proname = p_function_name
           AND p.pronargs = 0
           AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    )
      INTO v_function_exists;

    IF v_function_exists = false THEN
        RAISE EXCEPTION
            'Cannot create trigger "%": trigger function geniusbot.%() does not exist.',
            p_trigger_name,
            p_function_name;
    END IF;

    EXECUTE pg_catalog.format(
        'DROP TRIGGER IF EXISTS %I ON geniusbot.%I',
        p_trigger_name,
        p_table_name
    );

    IF p_update_columns IS NULL THEN
        v_sql := pg_catalog.format(
            'CREATE TRIGGER %I
             %s %s ON geniusbot.%I
             FOR EACH ROW
             EXECUTE FUNCTION geniusbot.%I()',
            p_trigger_name,
            p_trigger_timing,
            p_trigger_events,
            p_table_name,
            p_function_name
        );
    ELSE
        v_sql := pg_catalog.format(
            'CREATE TRIGGER %I
             %s UPDATE OF %s ON geniusbot.%I
             FOR EACH ROW
             EXECUTE FUNCTION geniusbot.%I()',
            p_trigger_name,
            p_trigger_timing,
            p_update_columns,
            p_table_name,
            p_function_name
        );
    END IF;

    EXECUTE v_sql;
END;
$function$;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'clinics',
    'trg_clinics_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'branches',
    'trg_branches_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'branch_working_hours',
    'trg_branch_working_hours_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'clinic_holidays',
    'trg_clinic_holidays_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'specialties',
    'trg_specialties_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'services',
    'trg_services_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'doctors',
    'trg_doctors_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'doctor_working_hours',
    'trg_doctor_working_hours_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'doctor_time_off',
    'trg_doctor_time_off_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'rooms',
    'trg_rooms_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'room_time_off',
    'trg_room_time_off_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'payment_methods',
    'trg_payment_methods_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'insurance_companies',
    'trg_insurance_companies_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'insurance_classes',
    'trg_insurance_classes_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'service_assignments',
    'trg_service_assignments_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'patients',
    'trg_patients_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'staff',
    'trg_staff_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'conversations',
    'trg_conversations_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'appointments',
    'trg_appointments_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'appointment_reminders',
    'trg_appointment_reminders_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'transactions',
    'trg_transactions_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'waitlist',
    'trg_waitlist_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'service_pre_questions',
    'trg_service_pre_questions_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'knowledge_base',
    'set_knowledge_base_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'message_templates',
    'trg_message_templates_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'ai_prompts',
    'trg_ai_prompts_set_updated_at',
    'BEFORE',
    'UPDATE',
    'set_updated_at'
);

-- ============================================================================
-- CLINIC HOLIDAY INTEGRITY
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'clinic_holidays',
    'trg_clinic_holidays_validate_integrity',
    'BEFORE',
    'INSERT OR UPDATE',
    'validate_clinic_holiday_integrity'
);

-- ============================================================================
-- DOCTOR WORKING HOURS INTEGRITY
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'doctor_working_hours',
    'trg_doctor_working_hours_validate_integrity',
    'BEFORE',
    'INSERT OR UPDATE',
    'validate_doctor_working_hours_integrity'
);

-- ============================================================================
-- SERVICE ASSIGNMENT INTEGRITY
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'service_assignments',
    'trg_service_assignments_validate_integrity',
    'BEFORE',
    'INSERT OR UPDATE',
    'validate_service_assignment_integrity'
);

-- ============================================================================
-- PRICE INTEGRITY
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'prices',
    'trg_prices_validate_before_write',
    'BEFORE',
    'INSERT OR UPDATE',
    'prices_validate_before_write'
);

-- ============================================================================
-- CONVERSATION INTEGRITY
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'conversations',
    'trg_conversations_validate_integrity',
    'BEFORE',
    'INSERT OR UPDATE',
    'validate_conversation_integrity'
);

-- ============================================================================
-- APPOINTMENT INTEGRITY
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'appointments',
    'trg_appointments_validate_integrity',
    'BEFORE',
    'INSERT OR UPDATE',
    'validate_appointment_integrity'
);

-- ============================================================================
-- APPOINTMENT STATUS STATE MACHINE
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'appointments',
    'trg_appointments_validate_status_transition',
    'BEFORE',
    'UPDATE',
    'validate_appointment_status_transition',
    'status'
);

-- ============================================================================
-- APPOINTMENT STATUS AUDIT
-- ============================================================================

SELECT geniusbot.create_trigger_if_table_exists(
    'appointments',
    'trg_appointments_log_status_insert',
    'AFTER',
    'INSERT',
    'log_appointment_status_change'
);

SELECT geniusbot.create_trigger_if_table_exists(
    'appointments',
    'trg_appointments_log_status_update',
    'AFTER',
    'UPDATE',
    'log_appointment_status_change',
    'status'
);

-- ============================================================================
-- REMOVE HELPER FUNCTION
-- ============================================================================

DROP FUNCTION geniusbot.create_trigger_if_table_exists(
    text,
    text,
    text,
    text,
    text,
    text
);

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $validation$
DECLARE
    v_expected_triggers constant text[] := ARRAY[
        'trg_clinics_set_updated_at',
        'trg_branches_set_updated_at',
        'trg_branch_working_hours_set_updated_at',
        'trg_clinic_holidays_set_updated_at',
        'trg_specialties_set_updated_at',
        'trg_services_set_updated_at',
        'trg_doctors_set_updated_at',
        'trg_doctor_working_hours_set_updated_at',
        'trg_doctor_time_off_set_updated_at',
        'trg_rooms_set_updated_at',
        'trg_room_time_off_set_updated_at',
        'trg_payment_methods_set_updated_at',
        'trg_insurance_companies_set_updated_at',
        'trg_insurance_classes_set_updated_at',
        'trg_service_assignments_set_updated_at',
        'trg_patients_set_updated_at',
        'trg_staff_set_updated_at',
        'trg_conversations_set_updated_at',
        'trg_appointments_set_updated_at',
        'trg_appointment_reminders_set_updated_at',
        'trg_transactions_set_updated_at',
        'trg_waitlist_set_updated_at',
        'trg_service_pre_questions_set_updated_at',
        'set_knowledge_base_updated_at',
        'trg_message_templates_set_updated_at',
        'trg_ai_prompts_set_updated_at',
        'trg_clinic_holidays_validate_integrity',
        'trg_doctor_working_hours_validate_integrity',
        'trg_service_assignments_validate_integrity',
        'trg_prices_validate_before_write',
        'trg_conversations_validate_integrity',
        'trg_appointments_validate_integrity',
        'trg_appointments_validate_status_transition',
        'trg_appointments_log_status_insert',
        'trg_appointments_log_status_update'
    ];

    v_trigger_name text;
    v_missing_triggers text[] := ARRAY[]::text[];
    v_disabled_triggers text[] := ARRAY[]::text[];
    v_invalid_trigger_functions text[] := ARRAY[]::text[];
BEGIN
    FOREACH v_trigger_name IN ARRAY v_expected_triggers
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_trigger AS t
              JOIN pg_catalog.pg_class AS c
                ON c.oid = t.tgrelid
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = c.relnamespace
             WHERE n.nspname = 'geniusbot'
               AND t.tgname = v_trigger_name
               AND t.tgisinternal = false
        ) THEN
            v_missing_triggers :=
                pg_catalog.array_append(
                    v_missing_triggers,
                    v_trigger_name
                );
        END IF;
    END LOOP;

    SELECT pg_catalog.array_agg(
               t.tgname
               ORDER BY t.tgname
           )
      INTO v_disabled_triggers
      FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS c
        ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace AS n
        ON n.oid = c.relnamespace
     WHERE n.nspname = 'geniusbot'
       AND t.tgname = ANY(v_expected_triggers)
       AND t.tgisinternal = false
       AND t.tgenabled = 'D';

    SELECT pg_catalog.array_agg(
               t.tgname
               ORDER BY t.tgname
           )
      INTO v_invalid_trigger_functions
      FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS c
        ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace AS table_namespace
        ON table_namespace.oid = c.relnamespace
      JOIN pg_catalog.pg_proc AS p
        ON p.oid = t.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = p.pronamespace
     WHERE table_namespace.nspname = 'geniusbot'
       AND t.tgname = ANY(v_expected_triggers)
       AND t.tgisinternal = false
       AND function_namespace.nspname <> 'geniusbot';

    IF pg_catalog.cardinality(v_missing_triggers) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: missing triggers: %',
            pg_catalog.array_to_string(
                v_missing_triggers,
                ', '
            );
    END IF;

    IF pg_catalog.cardinality(v_disabled_triggers) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: disabled triggers: %',
            pg_catalog.array_to_string(
                v_disabled_triggers,
                ', '
            );
    END IF;

    IF pg_catalog.cardinality(v_invalid_trigger_functions) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: triggers referencing functions outside schema "geniusbot": %',
            pg_catalog.array_to_string(
                v_invalid_trigger_functions,
                ', '
            );
    END IF;

    RAISE NOTICE
        'Validation successful: all % required triggers exist, are enabled and reference functions in schema "geniusbot".',
        pg_catalog.cardinality(v_expected_triggers);
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
