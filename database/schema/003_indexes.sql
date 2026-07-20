-- ============================================================================
-- GeniusBot Database
-- File: database/schema/003_indexes.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

-- ============================================================================
-- AI PROMPTS
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_ai_prompt
    ON geniusbot.ai_prompts (
        clinic_id,
        prompt_name
    )
    WHERE is_active = true;

-- ============================================================================
-- APPOINTMENT REMINDERS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_due
    ON geniusbot.appointment_reminders (
        status,
        scheduled_at
    );

CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_reminder_type
    ON geniusbot.appointment_reminders (
        appointment_id,
        reminder_type
    );

-- ============================================================================
-- APPOINTMENT STATUS LOGS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointment_status_logs_appointment_created
    ON geniusbot.appointment_status_logs (
        appointment_id,
        created_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_appointment_status_logs_staff_created
    ON geniusbot.appointment_status_logs (
        changed_by_staff_id,
        created_at DESC
    )
    WHERE changed_by_staff_id IS NOT NULL;

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointments_branch_time
    ON geniusbot.appointments (
        branch_id,
        appointment_start,
        appointment_end
    );

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_time
    ON geniusbot.appointments (
        clinic_id,
        appointment_start DESC
    );

CREATE INDEX IF NOT EXISTS idx_appointments_status_time
    ON geniusbot.appointments (
        clinic_id,
        status,
        appointment_start
    );

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_active_time
    ON geniusbot.appointments (
        doctor_id,
        appointment_start,
        appointment_end
    )
    WHERE doctor_id IS NOT NULL
      AND status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_appointments_room_active_time
    ON geniusbot.appointments (
        room_id,
        appointment_start,
        appointment_end
    )
    WHERE room_id IS NOT NULL
      AND status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_appointments_patient_active_time
    ON geniusbot.appointments (
        patient_id,
        appointment_start,
        appointment_end
    )
    WHERE status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_appointments_patient_history
    ON geniusbot.appointments (
        clinic_id,
        patient_id,
        appointment_start DESC
    );

CREATE INDEX IF NOT EXISTS idx_appointments_service_time
    ON geniusbot.appointments (
        clinic_id,
        service_id,
        appointment_start DESC
    );

CREATE INDEX IF NOT EXISTS idx_appointments_conversation
    ON geniusbot.appointments (
        conversation_id
    )
    WHERE conversation_id IS NOT NULL;

-- ============================================================================
-- BRANCHES AND WORKING HOURS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_branches_clinic_active
    ON geniusbot.branches (
        clinic_id,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_branch_working_hours_lookup
    ON geniusbot.branch_working_hours (
        branch_id,
        day_of_week
    );

-- ============================================================================
-- CLINIC HOLIDAYS
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_clinic_holiday_scope_date
    ON geniusbot.clinic_holidays (
        clinic_id,
        COALESCE(
            branch_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        ),
        holiday_date
    );

CREATE INDEX IF NOT EXISTS idx_clinic_holidays_lookup
    ON geniusbot.clinic_holidays (
        clinic_id,
        holiday_date,
        branch_id
    );

-- ============================================================================
-- CONVERSATIONS AND MESSAGES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_clinic_status_started
    ON geniusbot.conversations (
        clinic_id,
        status,
        started_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_conversations_patient_started
    ON geniusbot.conversations (
        patient_id,
        started_at DESC
    )
    WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_staff
    ON geniusbot.conversations (
        assigned_to_staff_id,
        status,
        started_at DESC
    )
    WHERE assigned_to_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON geniusbot.messages (
        conversation_id,
        created_at
    );

CREATE INDEX IF NOT EXISTS idx_messages_intent_created
    ON geniusbot.messages (
        intent_id,
        created_at DESC
    )
    WHERE intent_id IS NOT NULL;

-- ============================================================================
-- DOCTORS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_doctors_clinic_active
    ON geniusbot.doctors (
        clinic_id,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_doctor_specialties_specialty
    ON geniusbot.doctor_specialties (
        specialty_id,
        doctor_id
    );

CREATE INDEX IF NOT EXISTS idx_doctor_working_hours_lookup
    ON geniusbot.doctor_working_hours (
        doctor_id,
        branch_id,
        day_of_week,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_doctor_time_off_lookup
    ON geniusbot.doctor_time_off (
        doctor_id,
        start_datetime,
        end_datetime
    );

-- ============================================================================
-- INSURANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_insurance_companies_clinic_active
    ON geniusbot.insurance_companies (
        clinic_id,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_insurance_classes_company_accepted
    ON geniusbot.insurance_classes (
        insurance_company_id,
        is_accepted
    );

-- ============================================================================
-- KNOWLEDGE BASE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_base_clinic_active
    ON geniusbot.knowledge_base (
        clinic_id,
        is_active,
        priority DESC
    );

CREATE INDEX IF NOT EXISTS idx_knowledge_base_service_active
    ON geniusbot.knowledge_base (
        service_id,
        is_active,
        priority DESC
    )
    WHERE service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_keywords
    ON geniusbot.knowledge_base
    USING gin (keywords);

-- ============================================================================
-- MESSAGE TEMPLATES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_message_template
    ON geniusbot.message_templates (
        clinic_id,
        template_key,
        language
    )
    WHERE is_active = true;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_logs_appointment_created
    ON geniusbot.notification_logs (
        appointment_id,
        created_at DESC
    )
    WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_status_created
    ON geniusbot.notification_logs (
        status,
        created_at
    );

CREATE INDEX IF NOT EXISTS idx_notification_logs_clinic_created
    ON geniusbot.notification_logs (
        clinic_id,
        created_at DESC
    );

CREATE UNIQUE INDEX IF NOT EXISTS unique_notification_provider_message_id
    ON geniusbot.notification_logs (
        provider_message_id
    )
    WHERE provider_message_id IS NOT NULL;

-- ============================================================================
-- PATIENTS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patients_clinic_last_seen
    ON geniusbot.patients (
        clinic_id,
        last_seen_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_patients_clinic_name
    ON geniusbot.patients (
        clinic_id,
        full_name
    )
    WHERE full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_whatsapp_id
    ON geniusbot.patients (
        clinic_id,
        whatsapp_id
    )
    WHERE whatsapp_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_activity_logs_patient_created
    ON geniusbot.patient_activity_logs (
        patient_id,
        created_at DESC
    )
    WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_activity_logs_clinic_created
    ON geniusbot.patient_activity_logs (
        clinic_id,
        created_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_patient_pre_answers_appointment
    ON geniusbot.patient_pre_answers (
        appointment_id,
        question_id
    )
    WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_pre_answers_patient
    ON geniusbot.patient_pre_answers (
        patient_id,
        created_at DESC
    );

-- ============================================================================
-- PAYMENT METHODS AND PRICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_payment_methods_clinic_active
    ON geniusbot.payment_methods (
        clinic_id,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_prices_lookup
    ON geniusbot.prices (
        clinic_id,
        service_id,
        payment_method_id,
        insurance_company_id,
        insurance_class_id,
        valid_from,
        valid_to
    );

CREATE INDEX IF NOT EXISTS idx_prices_active_lookup
    ON geniusbot.prices (
        clinic_id,
        service_id,
        payment_method_id,
        valid_from,
        valid_to
    )
    WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS unique_service_price_start
    ON geniusbot.prices (
        clinic_id,
        service_id,
        payment_method_id,
        COALESCE(
            insurance_company_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        ),
        COALESCE(
            insurance_class_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        ),
        valid_from
    );

-- ============================================================================
-- ROOMS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rooms_branch_active
    ON geniusbot.rooms (
        branch_id,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_room_time_off_lookup
    ON geniusbot.room_time_off (
        room_id,
        start_datetime,
        end_datetime
    );

-- ============================================================================
-- SERVICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_services_clinic_active_booking
    ON geniusbot.services (
        clinic_id,
        is_active,
        is_booking_enabled,
        display_order
    );

CREATE INDEX IF NOT EXISTS idx_services_specialty
    ON geniusbot.services (
        specialty_id,
        is_active
    )
    WHERE specialty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_assignments_lookup
    ON geniusbot.service_assignments (
        clinic_id,
        branch_id,
        service_id,
        is_active
    );

CREATE INDEX IF NOT EXISTS idx_service_assignments_doctor
    ON geniusbot.service_assignments (
        doctor_id,
        branch_id,
        service_id
    )
    WHERE doctor_id IS NOT NULL
      AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_assignments_room
    ON geniusbot.service_assignments (
        room_id,
        branch_id,
        service_id
    )
    WHERE room_id IS NOT NULL
      AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS unique_service_assignment_scope
    ON geniusbot.service_assignments (
        branch_id,
        service_id,
        COALESCE(
            doctor_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        ),
        COALESCE(
            room_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS unique_default_service_assignment
    ON geniusbot.service_assignments (
        branch_id,
        service_id
    )
    WHERE is_default = true
      AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_pre_questions_lookup
    ON geniusbot.service_pre_questions (
        service_id,
        is_active,
        display_order
    );

-- ============================================================================
-- SPECIALTIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_specialties_clinic_active
    ON geniusbot.specialties (
        clinic_id,
        is_active
    );

-- ============================================================================
-- STAFF
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_staff_clinic_active_role
    ON geniusbot.staff (
        clinic_id,
        is_active,
        role
    )
    WHERE clinic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_branch_active
    ON geniusbot.staff (
        branch_id,
        is_active
    )
    WHERE branch_id IS NOT NULL;

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_appointment
    ON geniusbot.transactions (
        appointment_id,
        created_at DESC
    )
    WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_patient_created
    ON geniusbot.transactions (
        patient_id,
        created_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_transactions_status_created
    ON geniusbot.transactions (
        status,
        created_at
    );

CREATE UNIQUE INDEX IF NOT EXISTS unique_gateway_transaction_id
    ON geniusbot.transactions (
        payment_gateway,
        gateway_transaction_id
    )
    WHERE gateway_transaction_id IS NOT NULL;

-- ============================================================================
-- WAITLIST
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_waitlist_lookup
    ON geniusbot.waitlist (
        clinic_id,
        service_id,
        branch_id,
        status,
        preferred_date
    );

CREATE INDEX IF NOT EXISTS idx_waitlist_patient_status
    ON geniusbot.waitlist (
        patient_id,
        status,
        created_at DESC
    );

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $validation$
DECLARE
    v_expected_indexes constant text[] := ARRAY[
        'unique_active_ai_prompt',
        'idx_appointment_reminders_due',
        'unique_appointment_reminder_type',
        'idx_appointment_status_logs_appointment_created',
        'idx_appointment_status_logs_staff_created',
        'idx_appointments_branch_time',
        'idx_appointments_clinic_time',
        'idx_appointments_status_time',
        'idx_appointments_doctor_active_time',
        'idx_appointments_room_active_time',
        'idx_appointments_patient_active_time',
        'idx_appointments_patient_history',
        'idx_appointments_service_time',
        'idx_appointments_conversation',
        'idx_branches_clinic_active',
        'idx_branch_working_hours_lookup',
        'unique_clinic_holiday_scope_date',
        'idx_clinic_holidays_lookup',
        'idx_conversations_clinic_status_started',
        'idx_conversations_patient_started',
        'idx_conversations_assigned_staff',
        'idx_messages_conversation_created',
        'idx_messages_intent_created',
        'idx_doctors_clinic_active',
        'idx_doctor_specialties_specialty',
        'idx_doctor_working_hours_lookup',
        'idx_doctor_time_off_lookup',
        'idx_insurance_companies_clinic_active',
        'idx_insurance_classes_company_accepted',
        'idx_knowledge_base_clinic_active',
        'idx_knowledge_base_service_active',
        'idx_knowledge_base_keywords',
        'unique_active_message_template',
        'idx_notification_logs_appointment_created',
        'idx_notification_logs_status_created',
        'idx_notification_logs_clinic_created',
        'unique_notification_provider_message_id',
        'idx_patients_clinic_last_seen',
        'idx_patients_clinic_name',
        'idx_patients_whatsapp_id',
        'idx_patient_activity_logs_patient_created',
        'idx_patient_activity_logs_clinic_created',
        'idx_patient_pre_answers_appointment',
        'idx_patient_pre_answers_patient',
        'idx_payment_methods_clinic_active',
        'idx_prices_lookup',
        'idx_prices_active_lookup',
        'unique_service_price_start',
        'idx_rooms_branch_active',
        'idx_room_time_off_lookup',
        'idx_services_clinic_active_booking',
        'idx_services_specialty',
        'idx_service_assignments_lookup',
        'idx_service_assignments_doctor',
        'idx_service_assignments_room',
        'unique_service_assignment_scope',
        'unique_default_service_assignment',
        'idx_service_pre_questions_lookup',
        'idx_specialties_clinic_active',
        'idx_staff_clinic_active_role',
        'idx_staff_branch_active',
        'idx_transactions_appointment',
        'idx_transactions_patient_created',
        'idx_transactions_status_created',
        'unique_gateway_transaction_id',
        'idx_waitlist_lookup',
        'idx_waitlist_patient_status'
    ];

    v_index_name text;
    v_missing_indexes text[] := ARRAY[]::text[];
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_namespace
         WHERE nspname = 'geniusbot'
    ) THEN
        RAISE EXCEPTION
            'Validation failed: schema "geniusbot" does not exist.';
    END IF;

    FOREACH v_index_name IN ARRAY v_expected_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_class AS c
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = c.relnamespace
             WHERE n.nspname = 'geniusbot'
               AND c.relname = v_index_name
               AND c.relkind = 'i'
        ) THEN
            v_missing_indexes :=
                pg_catalog.array_append(v_missing_indexes, v_index_name);
        END IF;
    END LOOP;

    IF pg_catalog.cardinality(v_missing_indexes) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: missing indexes: %',
            pg_catalog.array_to_string(v_missing_indexes, ', ');
    END IF;

    RAISE NOTICE
        'Validation successful: all % required indexes exist in schema "geniusbot".',
        pg_catalog.cardinality(v_expected_indexes);
END;
$validation$ LANGUAGE plpgsql;

COMMIT;