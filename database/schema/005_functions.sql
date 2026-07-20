-- ============================================================================
-- GeniusBot Database
-- File: database/schema/005_functions.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, pg_catalog;

-- ============================================================================
-- UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.set_updated_at() IS
    'Automatically updates the updated_at column before a row is updated.';

-- ============================================================================
-- APPOINTMENT TENANT AND RESOURCE INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_appointment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_branch_clinic_id uuid;
    v_patient_clinic_id uuid;
    v_service_clinic_id uuid;
    v_doctor_clinic_id uuid;
    v_room_branch_id uuid;
    v_room_clinic_id uuid;
    v_payment_method_clinic_id uuid;
    v_insurance_company_clinic_id uuid;
    v_insurance_class_company_id uuid;
    v_conversation_clinic_id uuid;

    v_service_requires_doctor boolean;
    v_service_requires_room boolean;

    v_assignment_exists boolean;
BEGIN
    SELECT b.clinic_id
      INTO v_branch_clinic_id
      FROM geniusbot.branches AS b
     WHERE b.id = NEW.branch_id;

    IF v_branch_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Branch "%s" does not exist.',
                    NEW.branch_id
                );
    END IF;

    IF v_branch_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Appointment branch does not belong to the appointment clinic.';
    END IF;

    SELECT p.clinic_id
      INTO v_patient_clinic_id
      FROM geniusbot.patients AS p
     WHERE p.id = NEW.patient_id;

    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Patient "%s" does not exist.',
                    NEW.patient_id
                );
    END IF;

    IF v_patient_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Appointment patient does not belong to the appointment clinic.';
    END IF;

    SELECT
        s.clinic_id,
        s.requires_doctor,
        s.requires_room
      INTO
        v_service_clinic_id,
        v_service_requires_doctor,
        v_service_requires_room
      FROM geniusbot.services AS s
     WHERE s.id = NEW.service_id;

    IF v_service_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Service "%s" does not exist.',
                    NEW.service_id
                );
    END IF;

    IF v_service_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Appointment service does not belong to the appointment clinic.';
    END IF;

    IF v_service_requires_doctor = true
       AND NEW.doctor_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'The selected service requires a doctor.';
    END IF;

    IF v_service_requires_room = true
       AND NEW.room_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'The selected service requires a room.';
    END IF;

    IF NEW.doctor_id IS NOT NULL THEN
        SELECT d.clinic_id
          INTO v_doctor_clinic_id
          FROM geniusbot.doctors AS d
         WHERE d.id = NEW.doctor_id;

        IF v_doctor_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Doctor "%s" does not exist.',
                        NEW.doctor_id
                    );
        END IF;

        IF v_doctor_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment doctor does not belong to the appointment clinic.';
        END IF;
    END IF;

    IF NEW.room_id IS NOT NULL THEN
        SELECT
            r.branch_id,
            b.clinic_id
          INTO
            v_room_branch_id,
            v_room_clinic_id
          FROM geniusbot.rooms AS r
          JOIN geniusbot.branches AS b
            ON b.id = r.branch_id
         WHERE r.id = NEW.room_id;

        IF v_room_branch_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Room "%s" does not exist.',
                        NEW.room_id
                    );
        END IF;

        IF v_room_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment room does not belong to the appointment clinic.';
        END IF;

        IF v_room_branch_id IS DISTINCT FROM NEW.branch_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment room does not belong to the selected branch.';
        END IF;
    END IF;

    IF NEW.payment_method_id IS NOT NULL THEN
        SELECT pm.clinic_id
          INTO v_payment_method_clinic_id
          FROM geniusbot.payment_methods AS pm
         WHERE pm.id = NEW.payment_method_id;

        IF v_payment_method_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Payment method "%s" does not exist.',
                        NEW.payment_method_id
                    );
        END IF;

        IF v_payment_method_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment payment method does not belong to the appointment clinic.';
        END IF;
    END IF;

    IF NEW.insurance_company_id IS NOT NULL THEN
        SELECT ic.clinic_id
          INTO v_insurance_company_clinic_id
          FROM geniusbot.insurance_companies AS ic
         WHERE ic.id = NEW.insurance_company_id;

        IF v_insurance_company_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Insurance company "%s" does not exist.',
                        NEW.insurance_company_id
                    );
        END IF;

        IF v_insurance_company_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment insurance company does not belong to the appointment clinic.';
        END IF;
    END IF;

    IF NEW.insurance_class_id IS NOT NULL THEN
        IF NEW.insurance_company_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'An insurance class requires an insurance company.';
        END IF;

        SELECT ic.insurance_company_id
          INTO v_insurance_class_company_id
          FROM geniusbot.insurance_classes AS ic
         WHERE ic.id = NEW.insurance_class_id;

        IF v_insurance_class_company_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Insurance class "%s" does not exist.',
                        NEW.insurance_class_id
                    );
        END IF;

        IF v_insurance_class_company_id
           IS DISTINCT FROM NEW.insurance_company_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment insurance class does not belong to the selected insurance company.';
        END IF;
    END IF;

    IF NEW.conversation_id IS NOT NULL THEN
        SELECT c.clinic_id
          INTO v_conversation_clinic_id
          FROM geniusbot.conversations AS c
         WHERE c.id = NEW.conversation_id;

        IF v_conversation_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Conversation "%s" does not exist.',
                        NEW.conversation_id
                    );
        END IF;

        IF v_conversation_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Appointment conversation does not belong to the appointment clinic.';
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM geniusbot.service_assignments AS sa
         WHERE sa.clinic_id = NEW.clinic_id
           AND sa.branch_id = NEW.branch_id
           AND sa.service_id = NEW.service_id
           AND sa.is_active = true
           AND (
                NEW.doctor_id IS NULL
                OR sa.doctor_id = NEW.doctor_id
           )
           AND (
                NEW.room_id IS NULL
                OR sa.room_id = NEW.room_id
           )
    )
      INTO v_assignment_exists;

    IF v_assignment_exists = false THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'No active service assignment matches the selected clinic, branch, service, doctor and room.';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_appointment_integrity() IS
    'Validates cross-tenant, branch, service, doctor, room, payment, insurance and service-assignment integrity for appointments.';

-- ============================================================================
-- SERVICE ASSIGNMENT INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_service_assignment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_branch_clinic_id uuid;
    v_service_clinic_id uuid;
    v_doctor_clinic_id uuid;
    v_room_branch_id uuid;
    v_room_clinic_id uuid;
BEGIN
    SELECT b.clinic_id
      INTO v_branch_clinic_id
      FROM geniusbot.branches AS b
     WHERE b.id = NEW.branch_id;

    IF v_branch_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Branch "%s" does not exist.',
                    NEW.branch_id
                );
    END IF;

    IF v_branch_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Service assignment branch does not belong to the selected clinic.';
    END IF;

    SELECT s.clinic_id
      INTO v_service_clinic_id
      FROM geniusbot.services AS s
     WHERE s.id = NEW.service_id;

    IF v_service_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Service "%s" does not exist.',
                    NEW.service_id
                );
    END IF;

    IF v_service_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Service assignment service does not belong to the selected clinic.';
    END IF;

    IF NEW.doctor_id IS NOT NULL THEN
        SELECT d.clinic_id
          INTO v_doctor_clinic_id
          FROM geniusbot.doctors AS d
         WHERE d.id = NEW.doctor_id;

        IF v_doctor_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Doctor "%s" does not exist.',
                        NEW.doctor_id
                    );
        END IF;

        IF v_doctor_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Service assignment doctor does not belong to the selected clinic.';
        END IF;
    END IF;

    IF NEW.room_id IS NOT NULL THEN
        SELECT
            r.branch_id,
            b.clinic_id
          INTO
            v_room_branch_id,
            v_room_clinic_id
          FROM geniusbot.rooms AS r
          JOIN geniusbot.branches AS b
            ON b.id = r.branch_id
         WHERE r.id = NEW.room_id;

        IF v_room_branch_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Room "%s" does not exist.',
                        NEW.room_id
                    );
        END IF;

        IF v_room_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Service assignment room does not belong to the selected clinic.';
        END IF;

        IF v_room_branch_id IS DISTINCT FROM NEW.branch_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Service assignment room does not belong to the selected branch.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_service_assignment_integrity() IS
    'Validates clinic and branch ownership for service assignments.';

-- ============================================================================
-- PRICE INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_price_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_service_clinic_id uuid;
    v_payment_method_clinic_id uuid;
    v_insurance_company_clinic_id uuid;
    v_insurance_class_company_id uuid;
BEGIN
    SELECT s.clinic_id
      INTO v_service_clinic_id
      FROM geniusbot.services AS s
     WHERE s.id = NEW.service_id;

    IF v_service_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Service "%s" does not exist.',
                    NEW.service_id
                );
    END IF;

    IF v_service_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Price service does not belong to the selected clinic.';
    END IF;

    SELECT pm.clinic_id
      INTO v_payment_method_clinic_id
      FROM geniusbot.payment_methods AS pm
     WHERE pm.id = NEW.payment_method_id;

    IF v_payment_method_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Payment method "%s" does not exist.',
                    NEW.payment_method_id
                );
    END IF;

    IF v_payment_method_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Price payment method does not belong to the selected clinic.';
    END IF;

    IF NEW.insurance_company_id IS NOT NULL THEN
        SELECT ic.clinic_id
          INTO v_insurance_company_clinic_id
          FROM geniusbot.insurance_companies AS ic
         WHERE ic.id = NEW.insurance_company_id;

        IF v_insurance_company_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Insurance company "%s" does not exist.',
                        NEW.insurance_company_id
                    );
        END IF;

        IF v_insurance_company_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Price insurance company does not belong to the selected clinic.';
        END IF;
    END IF;

    IF NEW.insurance_class_id IS NOT NULL THEN
        IF NEW.insurance_company_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'An insurance class requires an insurance company.';
        END IF;

        SELECT ic.insurance_company_id
          INTO v_insurance_class_company_id
          FROM geniusbot.insurance_classes AS ic
         WHERE ic.id = NEW.insurance_class_id;

        IF v_insurance_class_company_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Insurance class "%s" does not exist.',
                        NEW.insurance_class_id
                    );
        END IF;

        IF v_insurance_class_company_id
           IS DISTINCT FROM NEW.insurance_company_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Price insurance class does not belong to the selected insurance company.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_price_integrity() IS
    'Validates clinic ownership and insurance relationships for service prices.';

-- ============================================================================
-- DOCTOR WORKING HOURS INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_doctor_working_hours_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_doctor_clinic_id uuid;
    v_branch_clinic_id uuid;
BEGIN
    SELECT d.clinic_id
      INTO v_doctor_clinic_id
      FROM geniusbot.doctors AS d
     WHERE d.id = NEW.doctor_id;

    IF v_doctor_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Doctor "%s" does not exist.',
                    NEW.doctor_id
                );
    END IF;

    SELECT b.clinic_id
      INTO v_branch_clinic_id
      FROM geniusbot.branches AS b
     WHERE b.id = NEW.branch_id;

    IF v_branch_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Branch "%s" does not exist.',
                    NEW.branch_id
                );
    END IF;

    IF v_doctor_clinic_id IS DISTINCT FROM v_branch_clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Doctor working-hours branch does not belong to the doctor clinic.';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_doctor_working_hours_integrity() IS
    'Ensures that doctor working hours reference a branch belonging to the same clinic as the doctor.';

-- ============================================================================
-- CLINIC HOLIDAY INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_clinic_holiday_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_branch_clinic_id uuid;
BEGIN
    IF NEW.branch_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT b.clinic_id
      INTO v_branch_clinic_id
      FROM geniusbot.branches AS b
     WHERE b.id = NEW.branch_id;

    IF v_branch_clinic_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = pg_catalog.format(
                    'Branch "%s" does not exist.',
                    NEW.branch_id
                );
    END IF;

    IF v_branch_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = 'Clinic holiday branch does not belong to the selected clinic.';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_clinic_holiday_integrity() IS
    'Ensures that branch-specific clinic holidays reference a branch owned by the selected clinic.';

-- ============================================================================
-- CONVERSATION INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_conversation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_patient_clinic_id uuid;
    v_staff_clinic_id uuid;
BEGIN
    IF NEW.patient_id IS NOT NULL THEN
        SELECT p.clinic_id
          INTO v_patient_clinic_id
          FROM geniusbot.patients AS p
         WHERE p.id = NEW.patient_id;

        IF v_patient_clinic_id IS NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Patient "%s" does not exist.',
                        NEW.patient_id
                    );
        END IF;

        IF v_patient_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Conversation patient does not belong to the selected clinic.';
        END IF;
    END IF;

    IF NEW.assigned_to_staff_id IS NOT NULL THEN
        SELECT s.clinic_id
          INTO v_staff_clinic_id
          FROM geniusbot.staff AS s
         WHERE s.id = NEW.assigned_to_staff_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23503',
                    MESSAGE = pg_catalog.format(
                        'Staff member "%s" does not exist.',
                        NEW.assigned_to_staff_id
                    );
        END IF;

        IF v_staff_clinic_id IS NOT NULL
           AND v_staff_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '23514',
                    MESSAGE = 'Assigned staff member does not belong to the selected clinic.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_conversation_integrity() IS
    'Validates patient and assigned-staff clinic ownership for conversations.';

-- ============================================================================
-- APPOINTMENT STATUS STATE MACHINE
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.validate_appointment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    IF TG_OP <> 'UPDATE'
       OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'pending'
       AND NEW.status NOT IN (
            'confirmed',
            'cancelled',
            'rescheduled'
       ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = pg_catalog.format(
                    'Invalid appointment status transition from "%s" to "%s".',
                    OLD.status,
                    NEW.status
                );
    ELSIF OLD.status = 'confirmed'
       AND NEW.status NOT IN (
            'completed',
            'cancelled',
            'no_show',
            'rescheduled'
       ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = pg_catalog.format(
                    'Invalid appointment status transition from "%s" to "%s".',
                    OLD.status,
                    NEW.status
                );
    ELSIF OLD.status IN (
            'completed',
            'cancelled',
            'no_show',
            'rescheduled'
       ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                MESSAGE = pg_catalog.format(
                    'Appointment status "%s" is terminal and cannot transition to "%s".',
                    OLD.status,
                    NEW.status
                );
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.validate_appointment_status_transition() IS
    'Enforces the approved appointment status state machine.';

-- ============================================================================
-- APPOINTMENT STATUS AUDIT
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.log_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_changed_by_staff_id uuid;
    v_notes text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO geniusbot.appointment_status_logs (
            appointment_id,
            old_status,
            new_status,
            changed_by_staff_id,
            notes,
            created_at
        )
        VALUES (
            NEW.id,
            NULL,
            NEW.status,
            NULL,
            'Appointment created.',
            pg_catalog.now()
        );

        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    BEGIN
        v_changed_by_staff_id :=
            NULLIF(
                pg_catalog.current_setting(
                    'geniusbot.changed_by_staff_id',
                    true
                ),
                ''
            )::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_changed_by_staff_id := NULL;
    END;

    v_notes :=
        NULLIF(
            pg_catalog.current_setting(
                'geniusbot.status_change_notes',
                true
            ),
            ''
        );

    INSERT INTO geniusbot.appointment_status_logs (
        appointment_id,
        old_status,
        new_status,
        changed_by_staff_id,
        notes,
        created_at
    )
    VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        v_changed_by_staff_id,
        v_notes,
        pg_catalog.now()
    );

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.log_appointment_status_change() IS
    'Creates an immutable audit record when an appointment is created or its status changes.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $validation$
DECLARE
    v_expected_functions constant text[] := ARRAY[
        'set_updated_at',
        'validate_appointment_integrity',
        'validate_service_assignment_integrity',
        'validate_price_integrity',
        'validate_doctor_working_hours_integrity',
        'validate_clinic_holiday_integrity',
        'validate_conversation_integrity',
        'validate_appointment_status_transition',
        'log_appointment_status_change'
    ];

    v_function_name text;
    v_missing_functions text[] := ARRAY[]::text[];
    v_invalid_return_types text[] := ARRAY[]::text[];
BEGIN
    FOREACH v_function_name IN ARRAY v_expected_functions
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_proc AS p
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = p.pronamespace
             WHERE n.nspname = 'geniusbot'
               AND p.proname = v_function_name
               AND p.pronargs = 0
        ) THEN
            v_missing_functions :=
                pg_catalog.array_append(
                    v_missing_functions,
                    v_function_name
                );
        END IF;

        IF EXISTS (
            SELECT 1
              FROM pg_catalog.pg_proc AS p
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = p.pronamespace
             WHERE n.nspname = 'geniusbot'
               AND p.proname = v_function_name
               AND p.pronargs = 0
               AND p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype
        ) THEN
            v_invalid_return_types :=
                pg_catalog.array_append(
                    v_invalid_return_types,
                    v_function_name
                );
        END IF;
    END LOOP;

    IF pg_catalog.cardinality(v_missing_functions) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: missing functions: %',
            pg_catalog.array_to_string(
                v_missing_functions,
                ', '
            );
    END IF;

    IF pg_catalog.cardinality(v_invalid_return_types) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: functions with invalid return types: %',
            pg_catalog.array_to_string(
                v_invalid_return_types,
                ', '
            );
    END IF;

    RAISE NOTICE
        'Validation successful: all % required trigger functions exist in schema "geniusbot".',
        pg_catalog.cardinality(v_expected_functions);
END;
$validation$ LANGUAGE plpgsql;

COMMIT;