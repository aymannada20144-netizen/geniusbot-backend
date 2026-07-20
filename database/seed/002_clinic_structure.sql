/*
===============================================================================
File: database/seed/002_clinic_structure.sql
Project: GeniusBot Backend
Schema: geniusbot
Purpose: Seed the demo clinic, branches, working hours, rooms, and specialties
Version: 2.0

Execution:
    psql -v ON_ERROR_STOP=1 -f database/seed/002_clinic_structure.sql

Dependencies:
    database/seed/001_reference_data.sql

Properties:
    - Idempotent
    - Uses deterministic UUID values
    - Safe to execute repeatedly
    - Friday closure is represented through recurring branch working hours
===============================================================================
*/

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- ============================================================================
-- Fixed Identifiers
-- ============================================================================

-- Clinic
-- 00000000-0000-0000-0000-000000000001

-- Branches
-- 00000000-0000-0000-0000-000000000101
-- 00000000-0000-0000-0000-000000000102

-- Rooms: Branch 1
-- 00000000-0000-0000-0000-000000000201
-- 00000000-0000-0000-0000-000000000202
-- 00000000-0000-0000-0000-000000000203
-- 00000000-0000-0000-0000-000000000204

-- Rooms: Branch 2
-- 00000000-0000-0000-0000-000000000211
-- 00000000-0000-0000-0000-000000000212
-- 00000000-0000-0000-0000-000000000213
-- 00000000-0000-0000-0000-000000000214

-- Specialties
-- 00000000-0000-0000-0000-000000000301
-- 00000000-0000-0000-0000-000000000302
-- 00000000-0000-0000-0000-000000000303
-- 00000000-0000-0000-0000-000000000304

-- ============================================================================
-- 1. Clinic
-- ============================================================================

INSERT INTO geniusbot.clinics (
    id,
    name,
    whatsapp_number,
    phone,
    timezone,
    default_language,
    is_active
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'عيادات أوريان للجلدية والليزر',
    '+966500000001',
    '+966112000001',
    'Asia/Riyadh',
    'ar',
    true
)
ON CONFLICT (id)
DO UPDATE SET
    name = EXCLUDED.name,
    whatsapp_number = EXCLUDED.whatsapp_number,
    phone = EXCLUDED.phone,
    timezone = EXCLUDED.timezone,
    default_language = EXCLUDED.default_language,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================================
-- 2. Branches
-- ============================================================================

INSERT INTO geniusbot.branches (
    id,
    clinic_id,
    name,
    address,
    google_maps_url,
    timezone,
    is_active
)
VALUES
    (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000001',
        'فرع الروضة',
        'حي الروضة، شارع الكيال، جدة، المملكة العربية السعودية',
        NULL,
        'Asia/Riyadh',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000001',
        'فرع الزهراء',
        'حي الزهراء، جدة، المملكة العربية السعودية',
        NULL,
        'Asia/Riyadh',
        true
    )
ON CONFLICT (id)
DO UPDATE SET
    clinic_id = EXCLUDED.clinic_id,
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    google_maps_url = EXCLUDED.google_maps_url,
    timezone = EXCLUDED.timezone,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================================
-- 3. Branch Working Hours
--
-- PostgreSQL EXTRACT(DOW):
-- 0 = Sunday
-- 1 = Monday
-- 2 = Tuesday
-- 3 = Wednesday
-- 4 = Thursday
-- 5 = Friday
-- 6 = Saturday
--
-- Both branches:
-- Saturday through Thursday: 10:00 - 22:00
-- Friday: Closed
-- ============================================================================

INSERT INTO geniusbot.branch_working_hours (
    id,
    branch_id,
    day_of_week,
    opens_at,
    closes_at,
    is_closed
)
VALUES
    -- ------------------------------------------------------------------------
    -- Branch 1: Al Rawdah
    -- ------------------------------------------------------------------------

    (
        '00000000-0000-0000-0000-000000001001',
        '00000000-0000-0000-0000-000000000101',
        0,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001002',
        '00000000-0000-0000-0000-000000000101',
        1,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001003',
        '00000000-0000-0000-0000-000000000101',
        2,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001004',
        '00000000-0000-0000-0000-000000000101',
        3,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001005',
        '00000000-0000-0000-0000-000000000101',
        4,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001006',
        '00000000-0000-0000-0000-000000000101',
        5,
        NULL,
        NULL,
        true
    ),
    (
        '00000000-0000-0000-0000-000000001007',
        '00000000-0000-0000-0000-000000000101',
        6,
        '10:00',
        '22:00',
        false
    ),

    -- ------------------------------------------------------------------------
    -- Branch 2: Al Zahra
    -- ------------------------------------------------------------------------

    (
        '00000000-0000-0000-0000-000000001011',
        '00000000-0000-0000-0000-000000000102',
        0,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001012',
        '00000000-0000-0000-0000-000000000102',
        1,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001013',
        '00000000-0000-0000-0000-000000000102',
        2,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001014',
        '00000000-0000-0000-0000-000000000102',
        3,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001015',
        '00000000-0000-0000-0000-000000000102',
        4,
        '10:00',
        '22:00',
        false
    ),
    (
        '00000000-0000-0000-0000-000000001016',
        '00000000-0000-0000-0000-000000000102',
        5,
        NULL,
        NULL,
        true
    ),
    (
        '00000000-0000-0000-0000-000000001017',
        '00000000-0000-0000-0000-000000000102',
        6,
        '10:00',
        '22:00',
        false
    )
ON CONFLICT (branch_id, day_of_week)
DO UPDATE SET
    opens_at = EXCLUDED.opens_at,
    closes_at = EXCLUDED.closes_at,
    is_closed = EXCLUDED.is_closed,
    updated_at = now();

-- ============================================================================
-- 4. Rooms: Al Rawdah Branch
-- ============================================================================

INSERT INTO geniusbot.rooms (
    id,
    branch_id,
    room_number,
    room_name,
    room_type,
    is_active
)
VALUES
    (
        '00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000101',
        '101',
        'غرفة الكشف 101',
        'consultation',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000202',
        '00000000-0000-0000-0000-000000000101',
        '102',
        'غرفة الجلدية 102',
        'dermatology',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000101',
        '201',
        'غرفة الليزر 201',
        'laser',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000204',
        '00000000-0000-0000-0000-000000000101',
        '301',
        'غرفة العناية بالبشرة 301',
        'skin_care',
        true
    )
ON CONFLICT (id)
DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    room_number = EXCLUDED.room_number,
    room_name = EXCLUDED.room_name,
    room_type = EXCLUDED.room_type,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================================
-- 5. Rooms: Al Zahra Branch
-- ============================================================================

INSERT INTO geniusbot.rooms (
    id,
    branch_id,
    room_number,
    room_name,
    room_type,
    is_active
)
VALUES
    (
        '00000000-0000-0000-0000-000000000211',
        '00000000-0000-0000-0000-000000000102',
        'A101',
        'غرفة الكشف A101',
        'consultation',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000212',
        '00000000-0000-0000-0000-000000000102',
        'A102',
        'غرفة الجلدية A102',
        'dermatology',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000213',
        '00000000-0000-0000-0000-000000000102',
        'A201',
        'غرفة الليزر A201',
        'laser',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000214',
        '00000000-0000-0000-0000-000000000102',
        'A301',
        'غرفة العناية بالبشرة A301',
        'skin_care',
        true
    )
ON CONFLICT (id)
DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    room_number = EXCLUDED.room_number,
    room_name = EXCLUDED.room_name,
    room_type = EXCLUDED.room_type,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================================
-- 6. Specialties
-- ============================================================================

INSERT INTO geniusbot.specialties (
    id,
    clinic_id,
    name,
    description,
    is_active
)
VALUES
    (
        '00000000-0000-0000-0000-000000000301',
        '00000000-0000-0000-0000-000000000001',
        'الأمراض الجلدية',
        'تشخيص وعلاج الأمراض والمشكلات الجلدية.',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000302',
        '00000000-0000-0000-0000-000000000001',
        'الجلدية التجميلية',
        'الخدمات والإجراءات التجميلية غير الجراحية.',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000303',
        '00000000-0000-0000-0000-000000000001',
        'الليزر',
        'خدمات الليزر وإزالة الشعر بالليزر.',
        true
    ),
    (
        '00000000-0000-0000-0000-000000000304',
        '00000000-0000-0000-0000-000000000001',
        'العناية بالبشرة',
        'تنظيف البشرة والتقشير والعلاجات المساندة.',
        true
    )
ON CONFLICT (id)
DO UPDATE SET
    clinic_id = EXCLUDED.clinic_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ============================================================================
-- 7. Clinic Bot Settings
-- ============================================================================

INSERT INTO geniusbot.bot_settings (
    id,
    clinic_id,
    setting_key,
    setting_value
)
VALUES
    (
        '00000000-0000-0000-0000-000000002001',
        '00000000-0000-0000-0000-000000000001',
        'clinic_display_name',
        'عيادات أوريان للجلدية والليزر'
    ),
    (
        '00000000-0000-0000-0000-000000002002',
        '00000000-0000-0000-0000-000000000001',
        'default_timezone',
        'Asia/Riyadh'
    ),
    (
        '00000000-0000-0000-0000-000000002003',
        '00000000-0000-0000-0000-000000000001',
        'default_language',
        'ar'
    ),
    (
        '00000000-0000-0000-0000-000000002004',
        '00000000-0000-0000-0000-000000000001',
        'currency',
        'SAR'
    ),
    (
        '00000000-0000-0000-0000-000000002005',
        '00000000-0000-0000-0000-000000000001',
        'adult_patients_only',
        'true'
    ),
    (
        '00000000-0000-0000-0000-000000002006',
        '00000000-0000-0000-0000-000000000001',
        'booking_slot_interval_minutes',
        '30'
    ),
    (
        '00000000-0000-0000-0000-000000002007',
        '00000000-0000-0000-0000-000000000001',
        'booking_minimum_notice_minutes',
        '60'
    ),
    (
        '00000000-0000-0000-0000-000000002008',
        '00000000-0000-0000-0000-000000000001',
        'booking_maximum_days_ahead',
        '90'
    )
ON CONFLICT (clinic_id, setting_key)
DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    updated_at = now();

-- ============================================================================
-- 8. Validate Clinic Structure
-- ============================================================================

DO $$
DECLARE
    clinic_count integer;
    branch_count integer;
    working_hours_count integer;
    room_count integer;
    specialty_count integer;
    friday_closed_count integer;
BEGIN
    SELECT COUNT(*)
    INTO clinic_count
    FROM geniusbot.clinics
    WHERE id = '00000000-0000-0000-0000-000000000001';

    IF clinic_count <> 1 THEN
        RAISE EXCEPTION
            'Clinic structure validation failed: expected one clinic, found %.',
            clinic_count;
    END IF;

    SELECT COUNT(*)
    INTO branch_count
    FROM geniusbot.branches
    WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
      AND id IN (
          '00000000-0000-0000-0000-000000000101',
          '00000000-0000-0000-0000-000000000102'
      );

    IF branch_count <> 2 THEN
        RAISE EXCEPTION
            'Clinic structure validation failed: expected two branches, found %.',
            branch_count;
    END IF;

    SELECT COUNT(*)
    INTO working_hours_count
    FROM geniusbot.branch_working_hours
    WHERE branch_id IN (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000102'
    );

    IF working_hours_count <> 14 THEN
        RAISE EXCEPTION
            'Clinic structure validation failed: expected 14 working-hour records, found %.',
            working_hours_count;
    END IF;

    SELECT COUNT(*)
    INTO friday_closed_count
    FROM geniusbot.branch_working_hours
    WHERE branch_id IN (
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000102'
    )
      AND day_of_week = 5
      AND is_closed = true
      AND opens_at IS NULL
      AND closes_at IS NULL;

    IF friday_closed_count <> 2 THEN
        RAISE EXCEPTION
            'Clinic structure validation failed: both branches must be closed every Friday.';
    END IF;

    SELECT COUNT(*)
    INTO room_count
    FROM geniusbot.rooms r
    INNER JOIN geniusbot.branches b
        ON b.id = r.branch_id
    WHERE b.clinic_id = '00000000-0000-0000-0000-000000000001'
      AND r.id IN (
          '00000000-0000-0000-0000-000000000201',
          '00000000-0000-0000-0000-000000000202',
          '00000000-0000-0000-0000-000000000203',
          '00000000-0000-0000-0000-000000000204',
          '00000000-0000-0000-0000-000000000211',
          '00000000-0000-0000-0000-000000000212',
          '00000000-0000-0000-0000-000000000213',
          '00000000-0000-0000-0000-000000000214'
      );

    IF room_count <> 8 THEN
        RAISE EXCEPTION
            'Clinic structure validation failed: expected eight rooms, found %.',
            room_count;
    END IF;

    SELECT COUNT(*)
    INTO specialty_count
    FROM geniusbot.specialties
    WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
      AND id IN (
          '00000000-0000-0000-0000-000000000301',
          '00000000-0000-0000-0000-000000000302',
          '00000000-0000-0000-0000-000000000303',
          '00000000-0000-0000-0000-000000000304'
      );

    IF specialty_count <> 4 THEN
        RAISE EXCEPTION
            'Clinic structure validation failed: expected four specialties, found %.',
            specialty_count;
    END IF;
END;
$$;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'GeniusBot clinic structure installed successfully.';
    RAISE NOTICE 'Clinic: 1';
    RAISE NOTICE 'Branches: 2';
    RAISE NOTICE 'Branch working-hour records: 14';
    RAISE NOTICE 'Rooms: 8';
    RAISE NOTICE 'Specialties: 4';
    RAISE NOTICE 'Recurring Friday closure: enabled for both branches';
    RAISE NOTICE '===============================================================';
END;
$$;