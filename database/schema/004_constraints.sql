-- ============================================================================
-- GeniusBot Database
-- File: database/schema/004_constraints.sql
-- PostgreSQL: 16+
-- ============================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, pg_catalog;

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION geniusbot.add_constraint_if_missing(
    p_table_name text,
    p_constraint_name text,
    p_constraint_definition text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_constraint AS c
          JOIN pg_catalog.pg_class AS t
            ON t.oid = c.conrelid
          JOIN pg_catalog.pg_namespace AS n
            ON n.oid = t.relnamespace
         WHERE n.nspname = 'geniusbot'
           AND t.relname = p_table_name
           AND c.conname = p_constraint_name
    ) THEN
        EXECUTE pg_catalog.format(
            'ALTER TABLE geniusbot.%I ADD CONSTRAINT %I %s',
            p_table_name,
            p_constraint_name,
            p_constraint_definition
        );
    END IF;
END;
$function$;

-- ============================================================================
-- CLINICS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'clinics',
    'chk_clinics_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'clinics',
    'chk_clinics_timezone_not_blank',
    'CHECK (btrim(timezone) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'clinics',
    'chk_clinics_default_language',
    'CHECK (default_language IN (''ar'', ''en''))'
);

-- ============================================================================
-- BRANCHES
-- ============================================================================

ALTER TABLE geniusbot.branches
    ALTER COLUMN city SET NOT NULL;

SELECT geniusbot.add_constraint_if_missing(
    'branches',
    'fk_branches_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'branches',
    'chk_branches_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'branches',
    'chk_branches_city_not_blank',
    'CHECK (btrim(city) <> '''')'
);

-- ============================================================================
-- BRANCH WORKING HOURS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'branch_working_hours',
    'fk_branch_working_hours_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'branch_working_hours',
    'chk_branch_working_hours_day',
    'CHECK (day_of_week BETWEEN 0 AND 6)'
);

SELECT geniusbot.add_constraint_if_missing(
    'branch_working_hours',
    'chk_branch_working_hours_time_range',
    'CHECK (
        (is_closed = true AND opening_time IS NULL AND closing_time IS NULL)
        OR
        (
            is_closed = false
            AND opening_time IS NOT NULL
            AND closing_time IS NOT NULL
            AND opening_time < closing_time
        )
    )'
);

SELECT geniusbot.add_constraint_if_missing(
    'branch_working_hours',
    'uq_branch_working_hours_branch_day',
    'UNIQUE (branch_id, day_of_week)'
);

-- ============================================================================
-- CLINIC HOLIDAYS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'clinic_holidays',
    'fk_clinic_holidays_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'clinic_holidays',
    'fk_clinic_holidays_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'clinic_holidays',
    'chk_clinic_holidays_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

-- ============================================================================
-- SPECIALTIES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'specialties',
    'fk_specialties_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'specialties',
    'chk_specialties_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'specialties',
    'uq_specialties_clinic_name',
    'UNIQUE (clinic_id, name)'
);

-- ============================================================================
-- SERVICES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'fk_services_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'fk_services_specialty',
    'FOREIGN KEY (specialty_id)
     REFERENCES geniusbot.specialties(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'chk_services_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'chk_services_duration_positive',
    'CHECK (duration_minutes > 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'chk_services_buffer_before_non_negative',
    'CHECK (buffer_before_minutes >= 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'chk_services_buffer_after_non_negative',
    'CHECK (buffer_after_minutes >= 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'chk_services_display_order_non_negative',
    'CHECK (display_order >= 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'services',
    'uq_services_clinic_name',
    'UNIQUE (clinic_id, name)'
);

-- ============================================================================
-- DOCTORS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'doctors',
    'fk_doctors_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctors',
    'chk_doctors_full_name_not_blank',
    'CHECK (btrim(full_name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctors',
    'uq_doctors_clinic_full_name',
    'UNIQUE (clinic_id, full_name)'
);

-- ============================================================================
-- DOCTOR SPECIALTIES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'doctor_specialties',
    'fk_doctor_specialties_doctor',
    'FOREIGN KEY (doctor_id)
     REFERENCES geniusbot.doctors(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_specialties',
    'fk_doctor_specialties_specialty',
    'FOREIGN KEY (specialty_id)
     REFERENCES geniusbot.specialties(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_specialties',
    'pk_doctor_specialties',
    'PRIMARY KEY (doctor_id, specialty_id)'
);

-- ============================================================================
-- DOCTOR WORKING HOURS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'doctor_working_hours',
    'fk_doctor_working_hours_doctor',
    'FOREIGN KEY (doctor_id)
     REFERENCES geniusbot.doctors(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_working_hours',
    'fk_doctor_working_hours_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_working_hours',
    'chk_doctor_working_hours_day',
    'CHECK (day_of_week BETWEEN 0 AND 6)'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_working_hours',
    'chk_doctor_working_hours_time_range',
    'CHECK (start_time < end_time)'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_working_hours',
    'uq_doctor_working_hours_schedule',
    'UNIQUE (
        doctor_id,
        branch_id,
        day_of_week,
        start_time,
        end_time
    )'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_working_hours',
    'excl_doctor_working_hours_active_overlap',
    'EXCLUDE USING gist (
        doctor_id geniusbot.gist_uuid_ops WITH =,
        day_of_week geniusbot.gist_int4_ops WITH =,
        tsrange(
            timestamp ''2000-01-01'' + start_time,
            timestamp ''2000-01-01'' + end_time,
            ''[)''
        ) WITH &&
    ) WHERE (is_active IS TRUE)'
);

-- ============================================================================
-- DOCTOR TIME OFF
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'doctor_time_off',
    'fk_doctor_time_off_doctor',
    'FOREIGN KEY (doctor_id)
     REFERENCES geniusbot.doctors(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_time_off',
    'chk_doctor_time_off_range',
    'CHECK (start_datetime < end_datetime)'
);

SELECT geniusbot.add_constraint_if_missing(
    'doctor_time_off',
    'excl_doctor_time_off_overlap',
    'EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(start_datetime, end_datetime, ''[)'') WITH &&
    )'
);

-- ============================================================================
-- ROOMS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'rooms',
    'fk_rooms_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'rooms',
    'chk_rooms_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'rooms',
    'chk_rooms_capacity_positive',
    'CHECK (capacity > 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'rooms',
    'uq_rooms_branch_name',
    'UNIQUE (branch_id, name)'
);

-- ============================================================================
-- ROOM TIME OFF
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'room_time_off',
    'fk_room_time_off_room',
    'FOREIGN KEY (room_id)
     REFERENCES geniusbot.rooms(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'room_time_off',
    'chk_room_time_off_range',
    'CHECK (start_datetime < end_datetime)'
);

SELECT geniusbot.add_constraint_if_missing(
    'room_time_off',
    'excl_room_time_off_overlap',
    'EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(start_datetime, end_datetime, ''[)'') WITH &&
    )'
);

-- ============================================================================
-- PAYMENT METHODS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'payment_methods',
    'fk_payment_methods_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'payment_methods',
    'chk_payment_methods_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'payment_methods',
    'chk_payment_methods_type',
    'CHECK (payment_type IN (
        ''cash'',
        ''card'',
        ''bank_transfer'',
        ''insurance'',
        ''online''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'payment_methods',
    'uq_payment_methods_clinic_name',
    'UNIQUE (clinic_id, name)'
);

-- ============================================================================
-- INSURANCE COMPANIES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'insurance_companies',
    'fk_insurance_companies_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'insurance_companies',
    'chk_insurance_companies_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'insurance_companies',
    'uq_insurance_companies_clinic_name',
    'UNIQUE (clinic_id, name)'
);

-- ============================================================================
-- INSURANCE CLASSES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'insurance_classes',
    'fk_insurance_classes_company',
    'FOREIGN KEY (insurance_company_id)
     REFERENCES geniusbot.insurance_companies(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'insurance_classes',
    'chk_insurance_classes_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'insurance_classes',
    'uq_insurance_classes_company_name',
    'UNIQUE (insurance_company_id, name)'
);

-- ============================================================================
-- PRICES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'fk_prices_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'fk_prices_service',
    'FOREIGN KEY (service_id)
     REFERENCES geniusbot.services(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'fk_prices_payment_method',
    'FOREIGN KEY (payment_method_id)
     REFERENCES geniusbot.payment_methods(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'fk_prices_insurance_company',
    'FOREIGN KEY (insurance_company_id)
     REFERENCES geniusbot.insurance_companies(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'fk_prices_insurance_class',
    'FOREIGN KEY (insurance_class_id)
     REFERENCES geniusbot.insurance_classes(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'chk_prices_price_non_negative',
    'CHECK (price >= 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'chk_prices_currency',
    'CHECK (currency = upper(btrim(currency)) AND currency ~ ''^[A-Z]{3}$'')'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'chk_prices_validity_range',
    'CHECK (valid_to IS NULL OR valid_to >= valid_from)'
);

SELECT geniusbot.add_constraint_if_missing(
    'prices',
    'excl_prices_active_period_overlap',
    'EXCLUDE USING gist (
        clinic_id geniusbot.gist_uuid_ops WITH =,
        service_id geniusbot.gist_uuid_ops WITH =,
        payment_method_id geniusbot.gist_uuid_ops WITH =,
        (coalesce(insurance_company_id, ''00000000-0000-0000-0000-000000000000''::uuid)) geniusbot.gist_uuid_ops WITH =,
        (coalesce(insurance_class_id, ''00000000-0000-0000-0000-000000000000''::uuid)) geniusbot.gist_uuid_ops WITH =,
        (daterange(valid_from, coalesce(valid_to + 1, ''infinity''::date), ''[)'')) WITH &&
    ) WHERE (is_active IS TRUE)'
);

-- ============================================================================
-- SERVICE ASSIGNMENTS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'service_assignments',
    'fk_service_assignments_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_assignments',
    'fk_service_assignments_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_assignments',
    'fk_service_assignments_service',
    'FOREIGN KEY (service_id)
     REFERENCES geniusbot.services(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_assignments',
    'fk_service_assignments_doctor',
    'FOREIGN KEY (doctor_id)
     REFERENCES geniusbot.doctors(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_assignments',
    'fk_service_assignments_room',
    'FOREIGN KEY (room_id)
     REFERENCES geniusbot.rooms(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

-- ============================================================================
-- PATIENTS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'patients',
    'fk_patients_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'patients',
    'chk_patients_full_name_not_blank',
    'CHECK (full_name IS NULL OR btrim(full_name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'patients',
    'chk_patients_phone_not_blank',
    'CHECK (phone_number IS NULL OR btrim(phone_number) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'patients',
    'chk_patients_gender',
    'CHECK (
        gender IS NULL
        OR gender IN (''male'', ''female'', ''other'', ''unspecified'')
    )'
);

SELECT geniusbot.add_constraint_if_missing(
    'patients',
    'chk_patients_date_of_birth',
    'CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)'
);

SELECT geniusbot.add_constraint_if_missing(
    'patients',
    'uq_patients_clinic_phone',
    'UNIQUE (clinic_id, phone_number)'
);

-- ============================================================================
-- STAFF
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'staff',
    'fk_staff_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'staff',
    'fk_staff_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'staff',
    'chk_staff_full_name_not_blank',
    'CHECK (btrim(full_name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'staff',
    'chk_staff_role',
    'CHECK (role IN (
        ''owner'',
        ''admin'',
        ''receptionist'',
        ''doctor'',
        ''staff''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'staff',
    'uq_staff_clinic_email',
    'UNIQUE (clinic_id, email)'
);

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'conversations',
    'fk_conversations_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'conversations',
    'fk_conversations_patient',
    'FOREIGN KEY (patient_id)
     REFERENCES geniusbot.patients(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'conversations',
    'fk_conversations_assigned_staff',
    'FOREIGN KEY (assigned_to_staff_id)
     REFERENCES geniusbot.staff(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'conversations',
    'chk_conversations_status',
    'CHECK (status IN (
        ''open'',
        ''pending'',
        ''resolved'',
        ''closed''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'conversations',
    'chk_conversations_channel',
    'CHECK (channel IN (
        ''whatsapp'',
        ''webchat'',
        ''instagram'',
        ''messenger'',
        ''sms'',
        ''email'',
        ''api''
    ))'
);

-- ============================================================================
-- INTENTS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'intents',
    'chk_intents_name_not_blank',
    'CHECK (btrim(name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'intents',
    'uq_intents_name',
    'UNIQUE (name)'
);

-- ============================================================================
-- MESSAGES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'messages',
    'fk_messages_conversation',
    'FOREIGN KEY (conversation_id)
     REFERENCES geniusbot.conversations(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'messages',
    'fk_messages_intent',
    'FOREIGN KEY (intent_id)
     REFERENCES geniusbot.intents(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'messages',
    'chk_messages_direction',
    'CHECK (direction IN (''inbound'', ''outbound''))'
);

SELECT geniusbot.add_constraint_if_missing(
    'messages',
    'chk_messages_sender_type',
    'CHECK (sender_type IN (
        ''patient'',
        ''bot'',
        ''staff'',
        ''system''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'messages',
    'chk_messages_content_not_blank',
    'CHECK (btrim(content) <> '''')'
);

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_patient',
    'FOREIGN KEY (patient_id)
     REFERENCES geniusbot.patients(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_service',
    'FOREIGN KEY (service_id)
     REFERENCES geniusbot.services(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_doctor',
    'FOREIGN KEY (doctor_id)
     REFERENCES geniusbot.doctors(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_room',
    'FOREIGN KEY (room_id)
     REFERENCES geniusbot.rooms(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'fk_appointments_conversation',
    'FOREIGN KEY (conversation_id)
     REFERENCES geniusbot.conversations(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'chk_appointments_time_range',
    'CHECK (appointment_start < appointment_end)'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'chk_appointments_status',
    'CHECK (status IN (
        ''pending'',
        ''confirmed'',
        ''checked_in'',
        ''completed'',
        ''cancelled'',
        ''no_show'',
        ''rescheduled''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'chk_appointments_source',
    'CHECK (source IN (
        ''whatsapp'',
        ''webchat'',
        ''dashboard'',
        ''phone'',
        ''walk_in'',
        ''api''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'excl_appointments_doctor_overlap',
    'EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(appointment_start, appointment_end, ''[)'') WITH &&
    )
    WHERE (
        doctor_id IS NOT NULL
        AND status IN (''pending'', ''confirmed'')
    )'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'excl_appointments_room_overlap',
    'EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(appointment_start, appointment_end, ''[)'') WITH &&
    )
    WHERE (
        room_id IS NOT NULL
        AND status IN (''pending'', ''confirmed'')
    )'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointments',
    'excl_appointments_patient_overlap',
    'EXCLUDE USING gist (
        patient_id WITH =,
        tstzrange(appointment_start, appointment_end, ''[)'') WITH &&
    )
    WHERE (
        status IN (''pending'', ''confirmed'')
    )'
);

-- ============================================================================
-- APPOINTMENT STATUS LOGS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'appointment_status_logs',
    'fk_appointment_status_logs_appointment',
    'FOREIGN KEY (appointment_id)
     REFERENCES geniusbot.appointments(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointment_status_logs',
    'fk_appointment_status_logs_staff',
    'FOREIGN KEY (changed_by_staff_id)
     REFERENCES geniusbot.staff(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointment_status_logs',
    'chk_appointment_status_logs_old_status',
    'CHECK (
        old_status IS NULL
        OR old_status IN (
            ''pending'',
            ''confirmed'',
            ''checked_in'',
            ''completed'',
            ''cancelled'',
            ''no_show'',
            ''rescheduled''
        )
    )'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointment_status_logs',
    'chk_appointment_status_logs_new_status',
    'CHECK (new_status IN (
        ''pending'',
        ''confirmed'',
        ''checked_in'',
        ''completed'',
        ''cancelled'',
        ''no_show'',
        ''rescheduled''
    ))'
);

-- ============================================================================
-- APPOINTMENT REMINDERS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'appointment_reminders',
    'fk_appointment_reminders_appointment',
    'FOREIGN KEY (appointment_id)
     REFERENCES geniusbot.appointments(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointment_reminders',
    'chk_appointment_reminders_type',
    'CHECK (reminder_type IN (
        ''confirmation'',
        ''day_before'',
        ''same_day'',
        ''followup'',
        ''google_review'',
        ''custom'',
        ''cancellation''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'appointment_reminders',
    'chk_appointment_reminders_status',
    'CHECK (status IN (
        ''pending'',
        ''processing'',
        ''sent'',
        ''failed'',
        ''cancelled''
    ))'
);

-- ============================================================================
-- NOTIFICATION LOGS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'notification_logs',
    'fk_notification_logs_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'notification_logs',
    'fk_notification_logs_appointment',
    'FOREIGN KEY (appointment_id)
     REFERENCES geniusbot.appointments(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'notification_logs',
    'chk_notification_logs_channel',
    'CHECK (channel IN (
        ''whatsapp'',
        ''sms'',
        ''email'',
        ''push''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'notification_logs',
    'chk_notification_logs_status',
    'CHECK (status IN (
        ''pending'',
        ''sent'',
        ''delivered'',
        ''read'',
        ''failed''
    ))'
);

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'fk_transactions_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'fk_transactions_appointment',
    'FOREIGN KEY (appointment_id)
     REFERENCES geniusbot.appointments(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'fk_transactions_patient',
    'FOREIGN KEY (patient_id)
     REFERENCES geniusbot.patients(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'fk_transactions_payment_method',
    'FOREIGN KEY (payment_method_id)
     REFERENCES geniusbot.payment_methods(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'chk_transactions_amount_positive',
    'CHECK (amount > 0)'
);

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'chk_transactions_currency',
    'CHECK (currency ~ ''^[A-Z]{3}$'')'
);

SELECT geniusbot.add_constraint_if_missing(
    'transactions',
    'chk_transactions_status',
    'CHECK (status IN (
        ''pending'',
        ''authorized'',
        ''paid'',
        ''failed'',
        ''cancelled'',
        ''refunded'',
        ''partially_refunded''
    ))'
);

-- ============================================================================
-- WAITLIST
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'fk_waitlist_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'fk_waitlist_branch',
    'FOREIGN KEY (branch_id)
     REFERENCES geniusbot.branches(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'fk_waitlist_patient',
    'FOREIGN KEY (patient_id)
     REFERENCES geniusbot.patients(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'fk_waitlist_service',
    'FOREIGN KEY (service_id)
     REFERENCES geniusbot.services(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'fk_waitlist_doctor',
    'FOREIGN KEY (doctor_id)
     REFERENCES geniusbot.doctors(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'chk_waitlist_status',
    'CHECK (status IN (
        ''waiting'',
        ''contacted'',
        ''booked'',
        ''cancelled'',
        ''expired''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'waitlist',
    'chk_waitlist_time_range',
    'CHECK (
        preferred_start_time IS NULL
        OR preferred_end_time IS NULL
        OR preferred_start_time < preferred_end_time
    )'
);

-- ============================================================================
-- SERVICE PRE-QUESTIONS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'service_pre_questions',
    'fk_service_pre_questions_service',
    'FOREIGN KEY (service_id)
     REFERENCES geniusbot.services(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_pre_questions',
    'chk_service_pre_questions_question_not_blank',
    'CHECK (btrim(question_text) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_pre_questions',
    'chk_service_pre_questions_type',
    'CHECK (question_type IN (
        ''text'',
        ''number'',
        ''boolean'',
        ''single_choice'',
        ''multiple_choice'',
        ''date''
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'service_pre_questions',
    'chk_service_pre_questions_display_order',
    'CHECK (display_order >= 0)'
);

-- ============================================================================
-- PATIENT PRE-ANSWERS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'patient_pre_answers',
    'fk_patient_pre_answers_patient',
    'FOREIGN KEY (patient_id)
     REFERENCES geniusbot.patients(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'patient_pre_answers',
    'fk_patient_pre_answers_appointment',
    'FOREIGN KEY (appointment_id)
     REFERENCES geniusbot.appointments(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'patient_pre_answers',
    'fk_patient_pre_answers_question',
    'FOREIGN KEY (question_id)
     REFERENCES geniusbot.service_pre_questions(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'patient_pre_answers',
    'uq_patient_pre_answers_appointment_question',
    'UNIQUE (appointment_id, question_id)'
);

-- ============================================================================
-- PATIENT ACTIVITY LOGS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'patient_activity_logs',
    'fk_patient_activity_logs_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'patient_activity_logs',
    'fk_patient_activity_logs_patient',
    'FOREIGN KEY (patient_id)
     REFERENCES geniusbot.patients(id)
     ON UPDATE RESTRICT
     ON DELETE RESTRICT'
);

SELECT geniusbot.add_constraint_if_missing(
    'patient_activity_logs',
    'chk_patient_activity_logs_type_not_blank',
    'CHECK (btrim(activity_type) <> '''')'
);

-- ============================================================================
-- KNOWLEDGE BASE
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'knowledge_base',
    'fk_knowledge_base_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'knowledge_base',
    'fk_knowledge_base_service',
    'FOREIGN KEY (service_id)
     REFERENCES geniusbot.services(id)
     ON UPDATE RESTRICT
     ON DELETE SET NULL'
);

SELECT geniusbot.add_constraint_if_missing(
    'knowledge_base',
    'chk_knowledge_base_title_not_blank',
    'CHECK (btrim(title) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'knowledge_base',
    'chk_knowledge_base_content_not_blank',
    'CHECK (btrim(content) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'knowledge_base',
    'chk_knowledge_base_priority_non_negative',
    'CHECK (priority >= 0)'
);

-- ============================================================================
-- MESSAGE TEMPLATES
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'message_templates',
    'fk_message_templates_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'message_templates',
    'chk_message_templates_key_not_blank',
    'CHECK (btrim(template_key) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'message_templates',
    'chk_message_templates_language',
    'CHECK (language IN (''ar'', ''en''))'
);

SELECT geniusbot.add_constraint_if_missing(
    'message_templates',
    'chk_message_templates_content_not_blank',
    'CHECK (btrim(content) <> '''')'
);

-- ============================================================================
-- AI PROMPTS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'ai_prompts',
    'fk_ai_prompts_clinic',
    'FOREIGN KEY (clinic_id)
     REFERENCES geniusbot.clinics(id)
     ON UPDATE RESTRICT
     ON DELETE CASCADE'
);

SELECT geniusbot.add_constraint_if_missing(
    'ai_prompts',
    'chk_ai_prompts_name_not_blank',
    'CHECK (btrim(prompt_name) <> '''')'
);

SELECT geniusbot.add_constraint_if_missing(
    'ai_prompts',
    'chk_ai_prompts_content_not_blank',
    'CHECK (btrim(prompt_content) <> '''')'
);

-- ============================================================================
-- ASSISTANT IDENTITY SETTINGS
-- ============================================================================

SELECT geniusbot.add_constraint_if_missing(
    'bot_settings',
    'bot_settings_assistant_name_valid',
    'CHECK (setting_key <> ''assistant_name'' OR (
        setting_value IS NOT NULL
        AND btrim(setting_value) <> ''''
        AND char_length(setting_value) <= 40
        AND setting_value !~ E''[\\n\\r]''
        AND setting_value !~ ''[[:cntrl:]]''
        AND position(U&''\200B'' in setting_value) = 0
        AND position(U&''\200C'' in setting_value) = 0
        AND position(U&''\200D'' in setting_value) = 0
        AND position(U&''\200E'' in setting_value) = 0
        AND position(U&''\200F'' in setting_value) = 0
        AND position(U&''\202A'' in setting_value) = 0
        AND position(U&''\202B'' in setting_value) = 0
        AND position(U&''\202C'' in setting_value) = 0
        AND position(U&''\202D'' in setting_value) = 0
        AND position(U&''\202E'' in setting_value) = 0
        AND position(U&''\2060'' in setting_value) = 0
        AND position(U&''\2061'' in setting_value) = 0
        AND position(U&''\2062'' in setting_value) = 0
        AND position(U&''\2063'' in setting_value) = 0
        AND position(U&''\2064'' in setting_value) = 0
        AND position(U&''\2065'' in setting_value) = 0
        AND position(U&''\2066'' in setting_value) = 0
        AND position(U&''\2067'' in setting_value) = 0
        AND position(U&''\2068'' in setting_value) = 0
        AND position(U&''\2069'' in setting_value) = 0
        AND position(U&''\FEFF'' in setting_value) = 0
    ))'
);

SELECT geniusbot.add_constraint_if_missing(
    'bot_settings',
    'bot_settings_assistant_gender_valid',
    'CHECK (setting_key <> ''assistant_gender'' OR setting_value IN (''female'', ''male''))'
);

-- ============================================================================
-- REMOVE HELPER FUNCTION
-- ============================================================================

DROP FUNCTION geniusbot.add_constraint_if_missing(text, text, text);

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $validation$
DECLARE
    v_expected_constraints constant text[] := ARRAY[
        'fk_branches_clinic',
        'chk_branches_name_not_blank',
        'chk_branches_city_not_blank',
        'fk_branch_working_hours_branch',
        'fk_clinic_holidays_clinic',
        'fk_clinic_holidays_branch',
        'fk_specialties_clinic',
        'fk_services_clinic',
        'fk_services_specialty',
        'fk_doctors_clinic',
        'fk_doctor_specialties_doctor',
        'fk_doctor_specialties_specialty',
        'fk_doctor_working_hours_doctor',
        'fk_doctor_working_hours_branch',
        'fk_doctor_time_off_doctor',
        'excl_doctor_time_off_overlap',
        'fk_rooms_branch',
        'fk_room_time_off_room',
        'excl_room_time_off_overlap',
        'fk_payment_methods_clinic',
        'fk_insurance_companies_clinic',
        'fk_insurance_classes_company',
        'fk_prices_clinic',
        'fk_prices_service',
        'fk_prices_payment_method',
        'fk_prices_insurance_company',
        'fk_prices_insurance_class',
        'chk_prices_price_non_negative',
        'chk_prices_currency',
        'chk_prices_validity_range',
        'excl_prices_active_period_overlap',
        'fk_service_assignments_clinic',
        'fk_service_assignments_branch',
        'fk_service_assignments_service',
        'fk_service_assignments_doctor',
        'fk_service_assignments_room',
        'fk_patients_clinic',
        'fk_staff_clinic',
        'fk_staff_branch',
        'fk_conversations_clinic',
        'fk_conversations_patient',
        'fk_conversations_assigned_staff',
        'fk_messages_conversation',
        'fk_messages_intent',
        'fk_appointments_clinic',
        'fk_appointments_branch',
        'fk_appointments_patient',
        'fk_appointments_service',
        'fk_appointments_doctor',
        'fk_appointments_room',
        'fk_appointments_conversation',
        'excl_appointments_doctor_overlap',
        'excl_appointments_room_overlap',
        'excl_appointments_patient_overlap',
        'fk_appointment_status_logs_appointment',
        'fk_appointment_status_logs_staff',
        'fk_appointment_reminders_appointment',
        'fk_notification_logs_clinic',
        'fk_notification_logs_appointment',
        'fk_transactions_clinic',
        'fk_transactions_appointment',
        'fk_transactions_patient',
        'fk_transactions_payment_method',
        'fk_waitlist_clinic',
        'fk_waitlist_branch',
        'fk_waitlist_patient',
        'fk_waitlist_service',
        'fk_waitlist_doctor',
        'fk_service_pre_questions_service',
        'fk_patient_pre_answers_patient',
        'fk_patient_pre_answers_appointment',
        'fk_patient_pre_answers_question',
        'fk_patient_activity_logs_clinic',
        'fk_patient_activity_logs_patient',
        'fk_knowledge_base_clinic',
        'fk_knowledge_base_service',
        'fk_message_templates_clinic',
        'fk_ai_prompts_clinic',
        'bot_settings_assistant_name_valid',
        'bot_settings_assistant_gender_valid'
    ];

    v_constraint_name text;
    v_missing_constraints text[] := ARRAY[]::text[];
    v_unvalidated_constraints text[] := ARRAY[]::text[];
BEGIN
    FOREACH v_constraint_name IN ARRAY v_expected_constraints
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_constraint AS c
              JOIN pg_catalog.pg_class AS t
                ON t.oid = c.conrelid
              JOIN pg_catalog.pg_namespace AS n
                ON n.oid = t.relnamespace
             WHERE n.nspname = 'geniusbot'
               AND c.conname = v_constraint_name
        ) THEN
            v_missing_constraints :=
                pg_catalog.array_append(
                    v_missing_constraints,
                    v_constraint_name
                );
        END IF;
    END LOOP;

    SELECT pg_catalog.array_agg(c.conname ORDER BY c.conname)
      INTO v_unvalidated_constraints
      FROM pg_catalog.pg_constraint AS c
      JOIN pg_catalog.pg_class AS t
        ON t.oid = c.conrelid
      JOIN pg_catalog.pg_namespace AS n
        ON n.oid = t.relnamespace
     WHERE n.nspname = 'geniusbot'
       AND c.contype IN ('c', 'f')
       AND c.convalidated = false;

    IF pg_catalog.cardinality(v_missing_constraints) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: missing constraints: %',
            pg_catalog.array_to_string(v_missing_constraints, ', ');
    END IF;

    IF pg_catalog.cardinality(v_unvalidated_constraints) > 0 THEN
        RAISE EXCEPTION
            'Validation failed: unvalidated constraints: %',
            pg_catalog.array_to_string(
                v_unvalidated_constraints,
                ', '
            );
    END IF;

    RAISE NOTICE
        'Validation successful: all % required constraints exist and all CHECK and FOREIGN KEY constraints are validated.',
        pg_catalog.cardinality(v_expected_constraints);
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
