```sql
/*
===============================================================================
File: database/tests/smoke_tests.sql
Project: GeniusBot Backend
Schema: geniusbot
Purpose: Database smoke tests
Version: 2.0

Execution:
    psql -v ON_ERROR_STOP=1 -f database/tests/smoke_tests.sql

Behavior:
    The script stops immediately when a required database object, constraint,
    relationship, or baseline rule is missing.
===============================================================================
*/

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- ============================================================================
-- Test Helper
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
    condition boolean,
    failure_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF condition IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'SMOKE TEST FAILED: %', failure_message;
    END IF;
END;
$$;

-- ============================================================================
-- 1. Required Extensions
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pgcrypto'
    ),
    'Required extension pgcrypto is not installed.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'btree_gist'
    ),
    'Required extension btree_gist is not installed.'
);

-- ============================================================================
-- 2. Required Schema
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = 'geniusbot'
    ),
    'Schema geniusbot does not exist.'
);

-- ============================================================================
-- 3. Required Tables
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT required_table.table_name
        FROM (
            VALUES
                ('ai_prompts'),
                ('appointment_reminders'),
                ('appointment_status_logs'),
                ('appointments'),
                ('bot_settings'),
                ('branch_working_hours'),
                ('branches'),
                ('clinic_holidays'),
                ('clinics'),
                ('conversations'),
                ('doctor_specialties'),
                ('doctor_time_off'),
                ('doctor_working_hours'),
                ('doctors'),
                ('insurance_classes'),
                ('insurance_companies'),
                ('intents'),
                ('knowledge_base'),
                ('message_templates'),
                ('messages'),
                ('notification_logs'),
                ('notification_templates'),
                ('patient_activity_logs'),
                ('patient_pre_answers'),
                ('patients'),
                ('payment_methods'),
                ('prices'),
                ('room_time_off'),
                ('rooms'),
                ('service_assignments'),
                ('service_pre_questions'),
                ('services'),
                ('specialties'),
                ('staff'),
                ('transactions'),
                ('waitlist')
        ) AS required_table(table_name)
        LEFT JOIN information_schema.tables actual_table
            ON actual_table.table_schema = 'geniusbot'
           AND actual_table.table_name = required_table.table_name
           AND actual_table.table_type = 'BASE TABLE'
        WHERE actual_table.table_name IS NULL
    ),
    'One or more required geniusbot tables are missing.'
);

-- ============================================================================
-- 4. Required Views
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.views
        WHERE table_schema = 'geniusbot'
          AND table_name = 'v_appointment_integrity_issues'
    ),
    'View geniusbot.v_appointment_integrity_issues is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.views
        WHERE table_schema = 'geniusbot'
          AND table_name = 'v_price_integrity_issues'
    ),
    'View geniusbot.v_price_integrity_issues is missing.'
);

-- ============================================================================
-- 5. UUID Primary Keys
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT required_table.table_name
        FROM (
            VALUES
                ('ai_prompts'),
                ('appointment_reminders'),
                ('appointment_status_logs'),
                ('appointments'),
                ('bot_settings'),
                ('branch_working_hours'),
                ('branches'),
                ('clinic_holidays'),
                ('clinics'),
                ('conversations'),
                ('doctor_specialties'),
                ('doctor_time_off'),
                ('doctor_working_hours'),
                ('doctors'),
                ('insurance_classes'),
                ('insurance_companies'),
                ('intents'),
                ('knowledge_base'),
                ('message_templates'),
                ('messages'),
                ('notification_logs'),
                ('notification_templates'),
                ('patient_activity_logs'),
                ('patient_pre_answers'),
                ('patients'),
                ('payment_methods'),
                ('prices'),
                ('room_time_off'),
                ('rooms'),
                ('service_assignments'),
                ('service_pre_questions'),
                ('services'),
                ('specialties'),
                ('staff'),
                ('transactions'),
                ('waitlist')
        ) AS required_table(table_name)
        LEFT JOIN information_schema.columns column_info
            ON column_info.table_schema = 'geniusbot'
           AND column_info.table_name = required_table.table_name
           AND column_info.column_name = 'id'
           AND column_info.data_type = 'uuid'
        WHERE column_info.column_name IS NULL
    ),
    'One or more geniusbot tables do not use UUID id columns.'
);

-- ============================================================================
-- 6. Required Appointment Columns
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT required_column.column_name
        FROM (
            VALUES
                ('id'),
                ('clinic_id'),
                ('branch_id'),
                ('patient_id'),
                ('service_id'),
                ('doctor_id'),
                ('room_id'),
                ('conversation_id'),
                ('appointment_start'),
                ('appointment_end'),
                ('payment_method_id'),
                ('insurance_company_id'),
                ('insurance_class_id'),
                ('quoted_price'),
                ('currency'),
                ('status'),
                ('source'),
                ('notes'),
                ('created_at'),
                ('updated_at')
        ) AS required_column(column_name)
        LEFT JOIN information_schema.columns actual_column
            ON actual_column.table_schema = 'geniusbot'
           AND actual_column.table_name = 'appointments'
           AND actual_column.column_name = required_column.column_name
        WHERE actual_column.column_name IS NULL
    ),
    'One or more required appointments columns are missing.'
);

-- ============================================================================
-- 7. Required Patient Columns
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT required_column.column_name
        FROM (
            VALUES
                ('id'),
                ('clinic_id'),
                ('full_name'),
                ('phone_number'),
                ('whatsapp_id'),
                ('gender'),
                ('birth_date'),
                ('source'),
                ('notes'),
                ('first_seen_at'),
                ('last_seen_at'),
                ('created_at'),
                ('updated_at'),
                ('is_active'),
                ('email')
        ) AS required_column(column_name)
        LEFT JOIN information_schema.columns actual_column
            ON actual_column.table_schema = 'geniusbot'
           AND actual_column.table_name = 'patients'
           AND actual_column.column_name = required_column.column_name
        WHERE actual_column.column_name IS NULL
    ),
    'One or more required patients columns are missing.'
);

-- ============================================================================
-- 8. Required Foreign Keys
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'appointments'
          AND constraint_name = 'appointments_clinic_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
    ),
    'appointments.clinic_id foreign key is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'appointments'
          AND constraint_name = 'appointments_branch_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
    ),
    'appointments.branch_id foreign key is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'appointments'
          AND constraint_name = 'appointments_patient_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
    ),
    'appointments.patient_id foreign key is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'appointments'
          AND constraint_name = 'appointments_service_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
    ),
    'appointments.service_id foreign key is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'appointments'
          AND constraint_name = 'appointments_doctor_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
    ),
    'appointments.doctor_id foreign key is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'appointments'
          AND constraint_name = 'appointments_room_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
    ),
    'appointments.room_id foreign key is missing.'
);

-- ============================================================================
-- 9. Required Unique Constraints
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'patients'
          AND constraint_name = 'patients_clinic_id_phone_number_key'
          AND constraint_type = 'UNIQUE'
    ),
    'Patient phone uniqueness per clinic is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'branches'
          AND constraint_name = 'branches_clinic_id_name_key'
          AND constraint_type = 'UNIQUE'
    ),
    'Branch name uniqueness per clinic is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'services'
          AND constraint_name = 'services_clinic_id_name_key'
          AND constraint_type = 'UNIQUE'
    ),
    'Service name uniqueness per clinic is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'geniusbot'
          AND table_name = 'doctors'
          AND constraint_name = 'doctors_clinic_id_full_name_key'
          AND constraint_type = 'UNIQUE'
    ),
    'Doctor name uniqueness per clinic is missing.'
);

-- ============================================================================
-- 10. Appointment Status Constraint
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_constraint constraint_info
        INNER JOIN pg_class table_info
            ON table_info.oid = constraint_info.conrelid
        INNER JOIN pg_namespace schema_info
            ON schema_info.oid = table_info.relnamespace
        WHERE schema_info.nspname = 'geniusbot'
          AND table_info.relname = 'appointments'
          AND constraint_info.conname = 'appointments_status_check'
          AND constraint_info.contype = 'c'
    ),
    'Appointment status check constraint is missing.'
);

-- ============================================================================
-- 11. Appointment Time Constraint
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_constraint constraint_info
        INNER JOIN pg_class table_info
            ON table_info.oid = constraint_info.conrelid
        INNER JOIN pg_namespace schema_info
            ON schema_info.oid = table_info.relnamespace
        WHERE schema_info.nspname = 'geniusbot'
          AND table_info.relname = 'appointments'
          AND constraint_info.conname = 'appointments_check'
          AND constraint_info.contype = 'c'
    ),
    'Appointment end-after-start constraint is missing.'
);

-- ============================================================================
-- 12. Required Appointment Indexes
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'idx_appointments_branch_time'
    ),
    'Index idx_appointments_branch_time is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'idx_appointments_doctor_time'
    ),
    'Index idx_appointments_doctor_time is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'idx_appointments_patient_time'
    ),
    'Index idx_appointments_patient_time is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'idx_appointments_room_time'
    ),
    'Index idx_appointments_room_time is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'idx_appointments_status_time'
    ),
    'Index idx_appointments_status_time is missing.'
);

-- ============================================================================
-- 13. Required Scheduling Conflict Indexes
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'no_doctor_schedule_overlap'
    ),
    'Doctor scheduling overlap index is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'no_room_schedule_overlap'
    ),
    'Room scheduling overlap index is missing.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND tablename = 'appointments'
          AND indexname = 'no_patient_schedule_overlap'
    ),
    'Patient scheduling overlap index is missing.'
);

-- ============================================================================
-- 14. Referential Integrity Views
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.v_appointment_integrity_issues
    ),
    'Appointment tenant-integrity issues were detected.'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.v_price_integrity_issues
    ),
    'Price tenant-integrity issues were detected.'
);

-- ============================================================================
-- 15. Invalid Appointment Durations
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE appointment_end <= appointment_start
    ),
    'One or more appointments have invalid start/end times.'
);

-- ============================================================================
-- 16. Invalid Appointment Status Values
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE status NOT IN (
            'pending',
            'confirmed',
            'cancelled',
            'completed',
            'no_show',
            'rescheduled'
        )
    ),
    'One or more appointments contain invalid status values.'
);

-- ============================================================================
-- 17. Invalid Appointment Source Values
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments
        WHERE source NOT IN (
            'whatsapp_direct',
            'instagram_ad',
            'google',
            'referral',
            'walk_in',
            'unknown'
        )
    ),
    'One or more appointments contain invalid source values.'
);

-- ============================================================================
-- 18. Invalid Patient Source Values
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.patients
        WHERE source NOT IN (
            'whatsapp_direct',
            'instagram_ad',
            'google',
            'referral',
            'walk_in',
            'unknown'
        )
    ),
    'One or more patients contain invalid source values.'
);

-- ============================================================================
-- 19. Invalid Service Durations
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.services
        WHERE duration_minutes <= 0
    ),
    'One or more services have invalid durations.'
);

-- ============================================================================
-- 20. Invalid Prices
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.prices
        WHERE price < 0
    ),
    'One or more service prices are negative.'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.prices
        WHERE valid_to IS NOT NULL
          AND valid_to < valid_from
    ),
    'One or more service prices have invalid validity ranges.'
);

-- ============================================================================
-- 21. Invalid Transactions
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.transactions
        WHERE amount < 0
    ),
    'One or more transactions contain negative amounts.'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.transactions
        WHERE status NOT IN (
            'pending',
            'paid',
            'failed',
            'refunded',
            'partially_refunded'
        )
    ),
    'One or more transactions contain invalid status values.'
);

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.transactions
        WHERE payment_gateway NOT IN (
            'cash',
            'moyasar',
            'stripe',
            'bank_transfer',
            'other'
        )
    ),
    'One or more transactions contain invalid payment gateways.'
);

-- ============================================================================
-- 22. Invalid Branch Working Hours
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.branch_working_hours
        WHERE day_of_week < 0
           OR day_of_week > 6
           OR (
                is_closed = true
                AND (
                    opens_at IS NOT NULL
                    OR closes_at IS NOT NULL
                )
           )
           OR (
                is_closed = false
                AND (
                    opens_at IS NULL
                    OR closes_at IS NULL
                    OR closes_at <= opens_at
                )
           )
    ),
    'One or more branch working-hour records are invalid.'
);

-- ============================================================================
-- 23. Invalid Doctor Working Hours
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.doctor_working_hours
        WHERE day_of_week < 0
           OR day_of_week > 6
           OR end_time <= start_time
    ),
    'One or more doctor working-hour records are invalid.'
);

-- ============================================================================
-- 24. Invalid Clinic Holiday Hours
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.clinic_holidays
        WHERE (
                is_closed = true
                AND (
                    opens_at IS NOT NULL
                    OR closes_at IS NOT NULL
                )
              )
           OR (
                is_closed = false
                AND (
                    opens_at IS NULL
                    OR closes_at IS NULL
                    OR closes_at <= opens_at
                )
              )
    ),
    'One or more clinic holiday records are invalid.'
);

-- ============================================================================
-- 25. Invalid Doctor Time Off
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.doctor_time_off
        WHERE end_datetime <= start_datetime
    ),
    'One or more doctor time-off records are invalid.'
);

-- ============================================================================
-- 26. Invalid Room Time Off
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.room_time_off
        WHERE end_datetime <= start_datetime
    ),
    'One or more room time-off records are invalid.'
);

-- ============================================================================
-- 27. Invalid Waitlist Time Ranges
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.waitlist
        WHERE preferred_time_start IS NOT NULL
          AND preferred_time_end IS NOT NULL
          AND preferred_time_end <= preferred_time_start
    ),
    'One or more waitlist records have invalid preferred time ranges.'
);

-- ============================================================================
-- 28. Orphan Appointments
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments appointment_record
        LEFT JOIN geniusbot.clinics clinic_record
            ON clinic_record.id = appointment_record.clinic_id
        LEFT JOIN geniusbot.branches branch_record
            ON branch_record.id = appointment_record.branch_id
        LEFT JOIN geniusbot.patients patient_record
            ON patient_record.id = appointment_record.patient_id
        LEFT JOIN geniusbot.services service_record
            ON service_record.id = appointment_record.service_id
        WHERE clinic_record.id IS NULL
           OR branch_record.id IS NULL
           OR patient_record.id IS NULL
           OR service_record.id IS NULL
    ),
    'One or more appointments contain orphan required relationships.'
);

-- ============================================================================
-- 29. Cross-Clinic Appointment Relationships
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.appointments appointment_record
        INNER JOIN geniusbot.branches branch_record
            ON branch_record.id = appointment_record.branch_id
        INNER JOIN geniusbot.patients patient_record
            ON patient_record.id = appointment_record.patient_id
        INNER JOIN geniusbot.services service_record
            ON service_record.id = appointment_record.service_id
        LEFT JOIN geniusbot.doctors doctor_record
            ON doctor_record.id = appointment_record.doctor_id
        LEFT JOIN geniusbot.rooms room_record
            ON room_record.id = appointment_record.room_id
        LEFT JOIN geniusbot.branches room_branch
            ON room_branch.id = room_record.branch_id
        WHERE branch_record.clinic_id <> appointment_record.clinic_id
           OR patient_record.clinic_id <> appointment_record.clinic_id
           OR service_record.clinic_id <> appointment_record.clinic_id
           OR (
                doctor_record.id IS NOT NULL
                AND doctor_record.clinic_id <> appointment_record.clinic_id
              )
           OR (
                room_record.id IS NOT NULL
                AND room_branch.clinic_id <> appointment_record.clinic_id
              )
    ),
    'One or more appointments contain cross-clinic relationships.'
);

-- ============================================================================
-- 30. Service Assignment Tenant Integrity
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments assignment_record
        INNER JOIN geniusbot.branches branch_record
            ON branch_record.id = assignment_record.branch_id
        INNER JOIN geniusbot.services service_record
            ON service_record.id = assignment_record.service_id
        LEFT JOIN geniusbot.doctors doctor_record
            ON doctor_record.id = assignment_record.doctor_id
        LEFT JOIN geniusbot.rooms room_record
            ON room_record.id = assignment_record.room_id
        LEFT JOIN geniusbot.branches room_branch
            ON room_branch.id = room_record.branch_id
        WHERE branch_record.clinic_id <> assignment_record.clinic_id
           OR service_record.clinic_id <> assignment_record.clinic_id
           OR (
                doctor_record.id IS NOT NULL
                AND doctor_record.clinic_id <> assignment_record.clinic_id
              )
           OR (
                room_record.id IS NOT NULL
                AND room_branch.clinic_id <> assignment_record.clinic_id
              )
    ),
    'One or more service assignments contain cross-clinic relationships.'
);

-- ============================================================================
-- 31. Required Baseline Data
-- ============================================================================

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.clinics
    ),
    'No clinic records exist.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.branches
    ),
    'No branch records exist.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.services
    ),
    'No service records exist.'
);

SELECT pg_temp.assert_true(
    EXISTS (
        SELECT 1
        FROM geniusbot.payment_methods
    ),
    'No payment method records exist.'
);

-- ============================================================================
-- 32. Active Clinic Has Active Branch
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.clinics clinic_record
        WHERE clinic_record.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM geniusbot.branches branch_record
              WHERE branch_record.clinic_id = clinic_record.id
                AND branch_record.is_active = true
          )
    ),
    'One or more active clinics do not have an active branch.'
);

-- ============================================================================
-- 33. Active Clinic Has Active Service
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.clinics clinic_record
        WHERE clinic_record.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM geniusbot.services service_record
              WHERE service_record.clinic_id = clinic_record.id
                AND service_record.is_active = true
                AND service_record.is_booking_enabled = true
          )
    ),
    'One or more active clinics do not have a bookable active service.'
);

-- ============================================================================
-- 34. Bookable Services Have Valid Assignments
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.services service_record
        WHERE service_record.is_active = true
          AND service_record.is_booking_enabled = true
          AND NOT EXISTS (
              SELECT 1
              FROM geniusbot.service_assignments assignment_record
              WHERE assignment_record.clinic_id = service_record.clinic_id
                AND assignment_record.service_id = service_record.id
                AND assignment_record.is_active = true
          )
    ),
    'One or more bookable services do not have active service assignments.'
);

-- ============================================================================
-- 35. Service Assignment Resource Requirements
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments assignment_record
        INNER JOIN geniusbot.services service_record
            ON service_record.id = assignment_record.service_id
        WHERE assignment_record.is_active = true
          AND (
                (
                    service_record.requires_doctor = true
                    AND assignment_record.doctor_id IS NULL
                )
                OR
                (
                    service_record.requires_room = true
                    AND assignment_record.room_id IS NULL
                )
              )
    ),
    'One or more service assignments do not satisfy service resource requirements.'
);

-- ============================================================================
-- 36. Active Doctors Have Working Hours
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.doctors doctor_record
        WHERE doctor_record.is_active = true
          AND EXISTS (
              SELECT 1
              FROM geniusbot.service_assignments assignment_record
              WHERE assignment_record.doctor_id = doctor_record.id
                AND assignment_record.is_active = true
          )
          AND NOT EXISTS (
              SELECT 1
              FROM geniusbot.doctor_working_hours working_hour_record
              WHERE working_hour_record.doctor_id = doctor_record.id
                AND working_hour_record.is_active = true
          )
    ),
    'One or more assigned active doctors do not have active working hours.'
);

-- ============================================================================
-- 37. Branch Working Hours Coverage
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM geniusbot.branches branch_record
        WHERE branch_record.is_active = true
          AND (
              SELECT COUNT(DISTINCT working_hour_record.day_of_week)
              FROM geniusbot.branch_working_hours working_hour_record
              WHERE working_hour_record.branch_id = branch_record.id
          ) <> 7
    ),
    'One or more active branches do not have seven working-hour records.'
);

-- ============================================================================
-- 38. Duplicate Default Service Assignments
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT
            assignment_record.branch_id,
            assignment_record.service_id
        FROM geniusbot.service_assignments assignment_record
        WHERE assignment_record.is_default = true
          AND assignment_record.is_active = true
        GROUP BY
            assignment_record.branch_id,
            assignment_record.service_id
        HAVING COUNT(*) > 1
    ),
    'One or more branch/service combinations have multiple active defaults.'
);

-- ============================================================================
-- 39. Duplicate Patient Phones
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT
            patient_record.clinic_id,
            patient_record.phone_number
        FROM geniusbot.patients patient_record
        GROUP BY
            patient_record.clinic_id,
            patient_record.phone_number
        HAVING COUNT(*) > 1
    ),
    'Duplicate patient phone numbers exist within the same clinic.'
);

-- ============================================================================
-- 40. Duplicate Clinic Holiday Scope And Date
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT
            holiday_record.clinic_id,
            COALESCE(
                holiday_record.branch_id,
                '00000000-0000-0000-0000-000000000000'::uuid
            ) AS normalized_branch_id,
            holiday_record.holiday_date
        FROM geniusbot.clinic_holidays holiday_record
        GROUP BY
            holiday_record.clinic_id,
            COALESCE(
                holiday_record.branch_id,
                '00000000-0000-0000-0000-000000000000'::uuid
            ),
            holiday_record.holiday_date
        HAVING COUNT(*) > 1
    ),
    'Duplicate clinic holiday scope/date records exist.'
);

-- ============================================================================
-- 41. Schema Isolation
-- ============================================================================

SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints constraint_info
        WHERE constraint_info.constraint_schema = 'geniusbot'
          AND constraint_info.constraint_type = 'FOREIGN KEY'
          AND constraint_info.table_schema <> 'geniusbot'
    ),
    'Unexpected cross-schema constraint metadata was detected.'
);

-- ============================================================================
-- 42. Query Baseline
-- ============================================================================

PERFORM COUNT(*)
FROM geniusbot.clinics;

PERFORM COUNT(*)
FROM geniusbot.branches;

PERFORM COUNT(*)
FROM geniusbot.patients;

PERFORM COUNT(*)
FROM geniusbot.services;

PERFORM COUNT(*)
FROM geniusbot.doctors;

PERFORM COUNT(*)
FROM geniusbot.rooms;

PERFORM COUNT(*)
FROM geniusbot.appointments;

PERFORM COUNT(*)
FROM geniusbot.transactions;

-- ============================================================================
-- Success
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'GeniusBot database smoke tests passed successfully.';
    RAISE NOTICE 'Schema: geniusbot';
    RAISE NOTICE '===============================================================';
END;
$$;

ROLLBACK;
```
