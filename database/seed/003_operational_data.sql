```sql
-- =====================================================================
-- GeniusBot Database Seed
-- File: database/seed/003_operational_data.sql
-- Target schema: geniusbot
--
-- Depends on:
--   database/seed/001_reference_data.sql
--   database/seed/002_clinic_structure.sql
--
-- Contains:
--   1. Services
--   2. Doctors
--   3. Doctor specialties
--   4. Doctor working hours
--   5. Payment methods
--   6. Insurance companies and classes
--   7. Prices
--   8. Service assignments
--
-- Does not contain:
--   - Patients
--   - Appointments
-- =====================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- =====================================================================
-- Stable UUIDs used by this seed
-- =====================================================================
-- Clinic:
--   00000000-0000-0000-0000-000000000001
--
-- Branch:
--   00000000-0000-0000-0000-000000000101
--
-- Specialty:
--   00000000-0000-0000-0000-000000000301
--
-- Rooms:
--   00000000-0000-0000-0000-000000000601
--   00000000-0000-0000-0000-000000000602
--   00000000-0000-0000-0000-000000000603
--   00000000-0000-0000-0000-000000000604
--   00000000-0000-0000-0000-000000000605

-- =====================================================================
-- Prerequisite validation
-- =====================================================================

DO $$
DECLARE
    v_missing_items text[];
BEGIN
    SELECT ARRAY_AGG(required_item ORDER BY required_item)
    INTO v_missing_items
    FROM (
        SELECT 'clinic:00000000-0000-0000-0000-000000000001' AS required_item
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.clinics
            WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
        )

        UNION ALL

        SELECT 'branch:00000000-0000-0000-0000-000000000101'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.branches
            WHERE id = '00000000-0000-0000-0000-000000000101'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
        )

        UNION ALL

        SELECT 'specialty:00000000-0000-0000-0000-000000000301'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.specialties
            WHERE id = '00000000-0000-0000-0000-000000000301'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000601'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000601'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000602'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000602'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000603'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000603'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000604'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000604'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000605'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000605'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
        )
    ) AS missing;

    IF v_missing_items IS NOT NULL THEN
        RAISE EXCEPTION
            '003_operational_data.sql prerequisite validation failed. Missing or mismatched records: %',
            array_to_string(v_missing_items, ', ');
    END IF;
END
$$;

-- =====================================================================
-- 1. Services
-- =====================================================================

INSERT INTO geniusbot.services (
    id,
    clinic_id,
    specialty_id,
    name,
    aliases,
    description,
    duration_minutes,
    requires_doctor,
    requires_room,
    is_booking_enabled,
    is_active,
    display_order
)
VALUES
(
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    'كشف/استشارة',
    ARRAY[
        'كشف',
        'استشارة',
        'استشاره',
        'كشف جلدية',
        'استشارة جلدية',
        'دكتور جلدية'
    ]::text[],
    'كشف أو استشارة في الجلدية والتجميل. يتم تحديد التشخيص والخطة العلاجية بواسطة الطبيب بعد المعاينة.',
    30,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    1
),
(
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    'ليزر',
    ARRAY[
        'ليزر',
        'جلسة ليزر',
        'إزالة شعر',
        'ازالة شعر',
        'ليزر إزالة الشعر',
        'ليزر ازالة الشعر'
    ]::text[],
    'خدمة الليزر وإزالة الشعر. يحدد المختص ملاءمة الخدمة وعدد الجلسات بعد التقييم.',
    30,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    2
),
(
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    'تقشير',
    ARRAY[
        'تقشير',
        'تقشير بشرة',
        'تقشير كيميائي',
        'جلسة تقشير',
        'نضارة'
    ]::text[],
    'خدمة تقشير البشرة حسب الحالة وبعد تقييم الطبيب أو المختص.',
    30,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    3
),
(
    '00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    'تنظيف بشرة',
    ARRAY[
        'تنظيف',
        'تنظيف بشرة',
        'جلسة تنظيف',
        'عناية بالبشرة',
        'فيشل'
    ]::text[],
    'خدمة تنظيف البشرة والعناية بها حسب احتياج الحالة.',
    45,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    4
),
(
    '00000000-0000-0000-0000-000000000405',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    'حقن تجميلية',
    ARRAY[
        'حقن',
        'حقن تجميلية',
        'بوتكس',
        'فيلر',
        'بوتوكس',
        'فيلر وبوتكس'
    ]::text[],
    'خدمات الحقن التجميلية. يحدد الطبيب نوع الإجراء والكمية المناسبة بعد المعاينة.',
    30,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    5
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id          = EXCLUDED.clinic_id,
    specialty_id       = EXCLUDED.specialty_id,
    name               = EXCLUDED.name,
    aliases            = EXCLUDED.aliases,
    description        = EXCLUDED.description,
    duration_minutes   = EXCLUDED.duration_minutes,
    requires_doctor    = EXCLUDED.requires_doctor,
    requires_room      = EXCLUDED.requires_room,
    is_booking_enabled = EXCLUDED.is_booking_enabled,
    is_active          = EXCLUDED.is_active,
    display_order      = EXCLUDED.display_order,
    updated_at         = NOW();

-- =====================================================================
-- 2. Doctors
-- =====================================================================

INSERT INTO geniusbot.doctors (
    id,
    clinic_id,
    full_name,
    title,
    gender,
    bio,
    is_active
)
VALUES
(
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000001',
    'منه ندا',
    'د.',
    'female',
    'طبيبة متخصصة في الكشف والاستشارات الجلدية والتجميلية.',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000001',
    'إسراء أيمن',
    'د.',
    'female',
    'طبيبة متخصصة في خدمات الليزر وإزالة الشعر.',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000001',
    'آلاء ندا',
    'د.',
    'female',
    'طبيبة متخصصة في خدمات التقشير والعناية بالبشرة.',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000001',
    'سارة الشمري',
    'د.',
    'female',
    'طبيبة متخصصة في تنظيف البشرة والعناية بها.',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000505',
    '00000000-0000-0000-0000-000000000001',
    'عنود القحطاني',
    'د.',
    'female',
    'طبيبة متخصصة في الحقن والإجراءات التجميلية.',
    TRUE
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id = EXCLUDED.clinic_id,
    full_name = EXCLUDED.full_name,
    title      = EXCLUDED.title,
    gender     = EXCLUDED.gender,
    bio        = EXCLUDED.bio,
    is_active  = EXCLUDED.is_active,
    updated_at = NOW();

-- =====================================================================
-- 3. Doctor specialties
-- =====================================================================

INSERT INTO geniusbot.doctor_specialties (
    id,
    doctor_id,
    specialty_id
)
VALUES
(
    '00000000-0000-0000-0000-000000000551',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000301'
),
(
    '00000000-0000-0000-0000-000000000552',
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000301'
),
(
    '00000000-0000-0000-0000-000000000553',
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000301'
),
(
    '00000000-0000-0000-0000-000000000554',
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000301'
),
(
    '00000000-0000-0000-0000-000000000555',
    '00000000-0000-0000-0000-000000000505',
    '00000000-0000-0000-0000-000000000301'
)
ON CONFLICT (doctor_id, specialty_id) DO NOTHING;

-- =====================================================================
-- 4. Doctor working hours
-- Day mapping:
--   0 = Sunday
--   1 = Monday
--   2 = Tuesday
--   3 = Wednesday
--   4 = Thursday
--   5 = Friday
--   6 = Saturday
--
-- Friday is closed, so no active Friday rows are inserted.
-- =====================================================================

INSERT INTO geniusbot.doctor_working_hours (
    id,
    doctor_id,
    branch_id,
    day_of_week,
    start_time,
    end_time,
    is_active
)
VALUES
-- Doctor 501
('00000000-0000-0000-0001-000000000501', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 0, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000511', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 1, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000521', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 2, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000531', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 3, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000541', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 4, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000561', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 6, '10:00', '18:00', TRUE),

-- Doctor 502
('00000000-0000-0000-0001-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 0, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000512', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 1, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000522', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 2, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000532', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 3, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000542', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 4, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000562', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 6, '14:00', '22:00', TRUE),

-- Doctor 503
('00000000-0000-0000-0001-000000000503', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', 0, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000513', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', 1, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000523', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', 2, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000533', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', 3, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000543', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', 4, '10:00', '18:00', TRUE),
('00000000-0000-0000-0001-000000000563', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000101', 6, '10:00', '18:00', TRUE),

-- Doctor 504
('00000000-0000-0000-0001-000000000504', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', 0, '12:00', '20:00', TRUE),
('00000000-0000-0000-0001-000000000514', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', 1, '12:00', '20:00', TRUE),
('00000000-0000-0000-0001-000000000524', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', 2, '12:00', '20:00', TRUE),
('00000000-0000-0000-0001-000000000534', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', 3, '12:00', '20:00', TRUE),
('00000000-0000-0000-0001-000000000544', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', 4, '12:00', '20:00', TRUE),
('00000000-0000-0000-0001-000000000564', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000101', 6, '12:00', '20:00', TRUE),

-- Doctor 505
('00000000-0000-0000-0001-000000000505', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', 0, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000515', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', 1, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000525', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', 2, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000535', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', 3, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000545', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', 4, '14:00', '22:00', TRUE),
('00000000-0000-0000-0001-000000000565', '00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000101', 6, '14:00', '22:00', TRUE)
ON CONFLICT (id) DO UPDATE
SET
    doctor_id  = EXCLUDED.doctor_id,
    branch_id  = EXCLUDED.branch_id,
    day_of_week = EXCLUDED.day_of_week,
    start_time = EXCLUDED.start_time,
    end_time   = EXCLUDED.end_time,
    is_active  = EXCLUDED.is_active,
    updated_at = NOW();

-- =====================================================================
-- 5. Payment methods
-- =====================================================================

INSERT INTO geniusbot.payment_methods (
    id,
    clinic_id,
    name,
    code,
    is_active
)
VALUES
(
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000001',
    'كاش',
    'cash',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000001',
    'تأمين',
    'insurance',
    TRUE
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id = EXCLUDED.clinic_id,
    name       = EXCLUDED.name,
    code       = EXCLUDED.code,
    is_active  = EXCLUDED.is_active,
    updated_at = NOW();

-- =====================================================================
-- 6. Insurance companies and classes
-- =====================================================================

INSERT INTO geniusbot.insurance_companies (
    id,
    clinic_id,
    name,
    is_active
)
VALUES
(
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000001',
    'بوبا العربية',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000001',
    'التعاونية للتأمين',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000001',
    'ميدغلف',
    TRUE
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id = EXCLUDED.clinic_id,
    name       = EXCLUDED.name,
    is_active  = EXCLUDED.is_active,
    updated_at = NOW();

INSERT INTO geniusbot.insurance_classes (
    id,
    insurance_company_id,
    class_name,
    is_accepted
)
VALUES
-- Bupa
(
    '00000000-0000-0000-0000-000000000911',
    '00000000-0000-0000-0000-000000000901',
    'VIP',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000912',
    '00000000-0000-0000-0000-000000000901',
    'A',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000913',
    '00000000-0000-0000-0000-000000000901',
    'B',
    FALSE
),
(
    '00000000-0000-0000-0000-000000000914',
    '00000000-0000-0000-0000-000000000901',
    'C',
    FALSE
),

-- Tawuniya
(
    '00000000-0000-0000-0000-000000000921',
    '00000000-0000-0000-0000-000000000902',
    'VIP',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000922',
    '00000000-0000-0000-0000-000000000902',
    'A',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000923',
    '00000000-0000-0000-0000-000000000902',
    'B',
    FALSE
),
(
    '00000000-0000-0000-0000-000000000924',
    '00000000-0000-0000-0000-000000000902',
    'C',
    FALSE
),

-- MedGulf
(
    '00000000-0000-0000-0000-000000000931',
    '00000000-0000-0000-0000-000000000903',
    'VIP',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000932',
    '00000000-0000-0000-0000-000000000903',
    'A',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000933',
    '00000000-0000-0000-0000-000000000903',
    'B',
    FALSE
),
(
    '00000000-0000-0000-0000-000000000934',
    '00000000-0000-0000-0000-000000000903',
    'C',
    FALSE
)
ON CONFLICT (id) DO UPDATE
SET
    insurance_company_id = EXCLUDED.insurance_company_id,
    class_name            = EXCLUDED.class_name,
    is_accepted           = EXCLUDED.is_accepted,
    updated_at            = NOW();

-- =====================================================================
-- 7. Prices
--
-- Fixed valid_from date is intentional:
-- using CURRENT_DATE would create a new pricing key on later executions.
-- =====================================================================

INSERT INTO geniusbot.prices (
    id,
    clinic_id,
    service_id,
    payment_method_id,
    insurance_company_id,
    insurance_class_id,
    price,
    currency,
    valid_from,
    valid_to,
    is_active
)
VALUES
-- ---------------------------------------------------------------------
-- Cash prices
-- ---------------------------------------------------------------------
(
    '00000000-0000-0000-0000-000000001101',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    150.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001102',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    250.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001103',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    300.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001104',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    220.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001105',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000405',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    500.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),

-- ---------------------------------------------------------------------
-- Bupa VIP and A consultation prices
-- ---------------------------------------------------------------------
(
    '00000000-0000-0000-0000-000000001111',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000911',
    0.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001112',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000912',
    50.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),

-- ---------------------------------------------------------------------
-- Tawuniya VIP and A consultation prices
-- ---------------------------------------------------------------------
(
    '00000000-0000-0000-0000-000000001121',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000921',
    0.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001122',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000922',
    50.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),

-- ---------------------------------------------------------------------
-- MedGulf VIP and A consultation prices
-- ---------------------------------------------------------------------
(
    '00000000-0000-0000-0000-000000001131',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000931',
    0.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
),
(
    '00000000-0000-0000-0000-000000001132',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000932',
    50.00,
    'SAR',
    DATE '2026-01-01',
    NULL,
    TRUE
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id           = EXCLUDED.clinic_id,
    service_id          = EXCLUDED.service_id,
    payment_method_id   = EXCLUDED.payment_method_id,
    insurance_company_id = EXCLUDED.insurance_company_id,
    insurance_class_id  = EXCLUDED.insurance_class_id,
    price               = EXCLUDED.price,
    currency            = EXCLUDED.currency,
    valid_from          = EXCLUDED.valid_from,
    valid_to            = EXCLUDED.valid_to,
    is_active           = EXCLUDED.is_active,
    updated_at          = NOW();

-- =====================================================================
-- 8. Service assignments
-- =====================================================================

INSERT INTO geniusbot.service_assignments (
    id,
    clinic_id,
    branch_id,
    service_id,
    doctor_id,
    room_id,
    is_default,
    is_active
)
VALUES
(
    '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000601',
    TRUE,
    TRUE
),
(
    '00000000-0000-0000-0000-000000000702',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000602',
    TRUE,
    TRUE
),
(
    '00000000-0000-0000-0000-000000000703',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000603',
    TRUE,
    TRUE
),
(
    '00000000-0000-0000-0000-000000000704',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000604',
    TRUE,
    TRUE
),
(
    '00000000-0000-0000-0000-000000000705',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000405',
    '00000000-0000-0000-0000-000000000505',
    '00000000-0000-0000-0000-000000000605',
    TRUE,
    TRUE
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id  = EXCLUDED.clinic_id,
    branch_id  = EXCLUDED.branch_id,
    service_id = EXCLUDED.service_id,
    doctor_id  = EXCLUDED.doctor_id,
    room_id    = EXCLUDED.room_id,
    is_default = EXCLUDED.is_default,
    is_active  = EXCLUDED.is_active,
    updated_at = NOW();

-- =====================================================================
-- Final validation
-- =====================================================================

DO $$
DECLARE
    v_services_count               integer;
    v_doctors_count                integer;
    v_doctor_specialties_count     integer;
    v_doctor_working_hours_count   integer;
    v_payment_methods_count        integer;
    v_insurance_companies_count    integer;
    v_insurance_classes_count      integer;
    v_prices_count                 integer;
    v_service_assignments_count    integer;
    v_invalid_services_count       integer;
    v_invalid_doctors_count        integer;
    v_invalid_working_hours_count  integer;
    v_invalid_prices_count         integer;
    v_invalid_assignments_count    integer;
    v_patient_count                integer;
    v_appointment_count            integer;
BEGIN
    SELECT COUNT(*)
    INTO v_services_count
    FROM geniusbot.services
    WHERE id IN (
        '00000000-0000-0000-0000-000000000401'::uuid,
        '00000000-0000-0000-0000-000000000402'::uuid,
        '00000000-0000-0000-0000-000000000403'::uuid,
        '00000000-0000-0000-0000-000000000404'::uuid,
        '00000000-0000-0000-0000-000000000405'::uuid
    )
      AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid;

    SELECT COUNT(*)
    INTO v_doctors_count
    FROM geniusbot.doctors
    WHERE id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid;

    SELECT COUNT(*)
    INTO v_doctor_specialties_count
    FROM geniusbot.doctor_specialties
    WHERE doctor_id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND specialty_id = '00000000-0000-0000-0000-000000000301'::uuid;

    SELECT COUNT(*)
    INTO v_doctor_working_hours_count
    FROM geniusbot.doctor_working_hours
    WHERE doctor_id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
      AND day_of_week IN (0, 1, 2, 3, 4, 6)
      AND is_active = TRUE;

    SELECT COUNT(*)
    INTO v_payment_methods_count
    FROM geniusbot.payment_methods
    WHERE id IN (
        '00000000-0000-0000-0000-000000000801'::uuid,
        '00000000-0000-0000-0000-000000000802'::uuid
    )
      AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid;

    SELECT COUNT(*)
    INTO v_insurance_companies_count
    FROM geniusbot.insurance_companies
    WHERE id IN (
        '00000000-0000-0000-0000-000000000901'::uuid,
        '00000000-0000-0000-0000-000000000902'::uuid,
        '00000000-0000-0000-0000-000000000903'::uuid
    )
      AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid;

    SELECT COUNT(*)
    INTO v_insurance_classes_count
    FROM geniusbot.insurance_classes
    WHERE id IN (
        '00000000-0000-0000-0000-000000000911'::uuid,
        '00000000-0000-0000-0000-000000000912'::uuid,
        '00000000-0000-0000-0000-000000000913'::uuid,
        '00000000-0000-0000-0000-000000000914'::uuid,
        '00000000-0000-0000-0000-000000000921'::uuid,
        '00000000-0000-0000-0000-000000000922'::uuid,
        '00000000-0000-0000-0000-000000000923'::uuid,
        '00000000-0000-0000-0000-000000000924'::uuid,
        '00000000-0000-0000-0000-000000000931'::uuid,
        '00000000-0000-0000-0000-000000000932'::uuid,
        '00000000-0000-0000-0000-000000000933'::uuid,
        '00000000-0000-0000-0000-000000000934'::uuid
    );

    SELECT COUNT(*)
    INTO v_prices_count
    FROM geniusbot.prices
    WHERE id IN (
        '00000000-0000-0000-0000-000000001101'::uuid,
        '00000000-0000-0000-0000-000000001102'::uuid,
        '00000000-0000-0000-0000-000000001103'::uuid,
        '00000000-0000-0000-0000-000000001104'::uuid,
        '00000000-0000-0000-0000-000000001105'::uuid,
        '00000000-0000-0000-0000-000000001111'::uuid,
        '00000000-0000-0000-0000-000000001112'::uuid,
        '00000000-0000-0000-0000-000000001121'::uuid,
        '00000000-0000-0000-0000-000000001122'::uuid,
        '00000000-0000-0000-0000-000000001131'::uuid,
        '00000000-0000-0000-0000-000000001132'::uuid
    )
      AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid;

    SELECT COUNT(*)
    INTO v_service_assignments_count
    FROM geniusbot.service_assignments
    WHERE id IN (
        '00000000-0000-0000-0000-000000000701'::uuid,
        '00000000-0000-0000-0000-000000000702'::uuid,
        '00000000-0000-0000-0000-000000000703'::uuid,
        '00000000-0000-0000-0000-000000000704'::uuid,
        '00000000-0000-0000-0000-000000000705'::uuid
    )
      AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid;

    SELECT COUNT(*)
    INTO v_invalid_services_count
    FROM geniusbot.services s
    WHERE s.id IN (
        '00000000-0000-0000-0000-000000000401'::uuid,
        '00000000-0000-0000-0000-000000000402'::uuid,
        '00000000-0000-0000-0000-000000000403'::uuid,
        '00000000-0000-0000-0000-000000000404'::uuid,
        '00000000-0000-0000-0000-000000000405'::uuid
    )
      AND (
          s.clinic_id <> '00000000-0000-0000-0000-000000000001'::uuid
          OR s.specialty_id <> '00000000-0000-0000-0000-000000000301'::uuid
          OR s.duration_minutes <= 0
          OR s.requires_doctor IS NOT TRUE
          OR s.requires_room IS NOT TRUE
          OR s.is_booking_enabled IS NOT TRUE
          OR s.is_active IS NOT TRUE
      );

    SELECT COUNT(*)
    INTO v_invalid_doctors_count
    FROM geniusbot.doctors d
    WHERE d.id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND (
          d.clinic_id <> '00000000-0000-0000-0000-000000000001'::uuid
          OR d.is_active IS NOT TRUE
      );

    SELECT COUNT(*)
    INTO v_invalid_working_hours_count
    FROM geniusbot.doctor_working_hours dwh
    WHERE dwh.doctor_id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND (
          dwh.branch_id <> '00000000-0000-0000-0000-000000000101'::uuid
          OR dwh.day_of_week = 5
          OR dwh.end_time <= dwh.start_time
          OR dwh.is_active IS NOT TRUE
      );

    SELECT COUNT(*)
    INTO v_invalid_prices_count
    FROM geniusbot.prices p
    JOIN geniusbot.services s
      ON s.id = p.service_id
    JOIN geniusbot.payment_methods pm
      ON pm.id = p.payment_method_id
    LEFT JOIN geniusbot.insurance_companies ic
      ON ic.id = p.insurance_company_id
    LEFT JOIN geniusbot.insurance_classes cls
      ON cls.id = p.insurance_class_id
    WHERE p.id IN (
        '00000000-0000-0000-0000-000000001101'::uuid,
        '00000000-0000-0000-0000-000000001102'::uuid,
        '00000000-0000-0000-0000-000000001103'::uuid,
        '00000000-0000-0000-0000-000000001104'::uuid,
        '00000000-0000-0000-0000-000000001105'::uuid,
        '00000000-0000-0000-0000-000000001111'::uuid,
        '00000000-0000-0000-0000-000000001112'::uuid,
        '00000000-0000-0000-0000-000000001121'::uuid,
        '00000000-0000-0000-0000-000000001122'::uuid,
        '00000000-0000-0000-0000-000000001131'::uuid,
        '00000000-0000-0000-0000-000000001132'::uuid
    )
      AND (
          p.clinic_id <> '00000000-0000-0000-0000-000000000001'::uuid
          OR s.clinic_id <> p.clinic_id
          OR pm.clinic_id <> p.clinic_id
          OR p.price < 0
          OR p.currency <> 'SAR'
          OR p.valid_from <> DATE '2026-01-01'
          OR p.is_active IS NOT TRUE
          OR (
              pm.code = 'cash'
              AND (
                  p.insurance_company_id IS NOT NULL
                  OR p.insurance_class_id IS NOT NULL
              )
          )
          OR (
              pm.code = 'insurance'
              AND (
                  p.insurance_company_id IS NULL
                  OR p.insurance_class_id IS NULL
                  OR ic.clinic_id <> p.clinic_id
                  OR cls.insurance_company_id <> p.insurance_company_id
                  OR cls.is_accepted IS NOT TRUE
              )
          )
      );

    SELECT COUNT(*)
    INTO v_invalid_assignments_count
    FROM geniusbot.service_assignments sa
    JOIN geniusbot.services s
      ON s.id = sa.service_id
    JOIN geniusbot.doctors d
      ON d.id = sa.doctor_id
    JOIN geniusbot.rooms r
      ON r.id = sa.room_id
    JOIN geniusbot.branches b
      ON b.id = sa.branch_id
    WHERE sa.id IN (
        '00000000-0000-0000-0000-000000000701'::uuid,
        '00000000-0000-0000-0000-000000000702'::uuid,
        '00000000-0000-0000-0000-000000000703'::uuid,
        '00000000-0000-0000-0000-000000000704'::uuid,
        '00000000-0000-0000-0000-000000000705'::uuid
    )
      AND (
          sa.clinic_id <> '00000000-0000-0000-0000-000000000001'::uuid
          OR sa.branch_id <> '00000000-0000-0000-0000-000000000101'::uuid
          OR s.clinic_id <> sa.clinic_id
          OR d.clinic_id <> sa.clinic_id
          OR b.clinic_id <> sa.clinic_id
          OR r.branch_id <> sa.branch_id
          OR sa.is_default IS NOT TRUE
          OR sa.is_active IS NOT TRUE
      );

    SELECT COUNT(*)
    INTO v_patient_count
    FROM geniusbot.patients
    WHERE id::text LIKE '00000000-0000-0000-0000-%';

    SELECT COUNT(*)
    INTO v_appointment_count
    FROM geniusbot.appointments
    WHERE id::text LIKE '00000000-0000-0000-0000-%';

    IF v_services_count <> 5 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 5 services, found %.',
            v_services_count;
    END IF;

    IF v_doctors_count <> 5 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 5 doctors, found %.',
            v_doctors_count;
    END IF;

    IF v_doctor_specialties_count <> 5 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 5 doctor specialty records, found %.',
            v_doctor_specialties_count;
    END IF;

    IF v_doctor_working_hours_count <> 30 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 30 active doctor working-hour records, found %.',
            v_doctor_working_hours_count;
    END IF;

    IF v_payment_methods_count <> 2 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 2 payment methods, found %.',
            v_payment_methods_count;
    END IF;

    IF v_insurance_companies_count <> 3 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 3 insurance companies, found %.',
            v_insurance_companies_count;
    END IF;

    IF v_insurance_classes_count <> 12 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 12 insurance classes, found %.',
            v_insurance_classes_count;
    END IF;

    IF v_prices_count <> 11 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 11 price records, found %.',
            v_prices_count;
    END IF;

    IF v_service_assignments_count <> 5 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: expected 5 service assignments, found %.',
            v_service_assignments_count;
    END IF;

    IF v_invalid_services_count <> 0 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: % invalid service records.',
            v_invalid_services_count;
    END IF;

    IF v_invalid_doctors_count <> 0 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: % invalid doctor records.',
            v_invalid_doctors_count;
    END IF;

    IF v_invalid_working_hours_count <> 0 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: % invalid doctor working-hour records.',
            v_invalid_working_hours_count;
    END IF;

    IF v_invalid_prices_count <> 0 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: % invalid price records.',
            v_invalid_prices_count;
    END IF;

    IF v_invalid_assignments_count <> 0 THEN
        RAISE EXCEPTION
            '003_operational_data validation failed: % invalid service assignments.',
            v_invalid_assignments_count;
    END IF;

    RAISE NOTICE '003_operational_data.sql validation passed.';
    RAISE NOTICE 'Services: %', v_services_count;
    RAISE NOTICE 'Doctors: %', v_doctors_count;
    RAISE NOTICE 'Doctor specialties: %', v_doctor_specialties_count;
    RAISE NOTICE 'Doctor working hours: %', v_doctor_working_hours_count;
    RAISE NOTICE 'Payment methods: %', v_payment_methods_count;
    RAISE NOTICE 'Insurance companies: %', v_insurance_companies_count;
    RAISE NOTICE 'Insurance classes: %', v_insurance_classes_count;
    RAISE NOTICE 'Prices: %', v_prices_count;
    RAISE NOTICE 'Service assignments: %', v_service_assignments_count;
    RAISE NOTICE 'Existing seeded patients were not modified. Current matching count: %', v_patient_count;
    RAISE NOTICE 'Existing seeded appointments were not modified. Current matching count: %', v_appointment_count;
END
$$;

-- =====================================================================
-- Validation result set
-- =====================================================================

SELECT
    entity_name,
    expected_count,
    actual_count,
    CASE
        WHEN actual_count = expected_count THEN 'PASS'
        ELSE 'FAIL'
    END AS validation_status
FROM (
    SELECT
        1 AS display_order,
        'services'::text AS entity_name,
        5::bigint AS expected_count,
        COUNT(*)::bigint AS actual_count
    FROM geniusbot.services
    WHERE id IN (
        '00000000-0000-0000-0000-000000000401'::uuid,
        '00000000-0000-0000-0000-000000000402'::uuid,
        '00000000-0000-0000-0000-000000000403'::uuid,
        '00000000-0000-0000-0000-000000000404'::uuid,
        '00000000-0000-0000-0000-000000000405'::uuid
    )

    UNION ALL

    SELECT
        2,
        'doctors',
        5,
        COUNT(*)
    FROM geniusbot.doctors
    WHERE id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )

    UNION ALL

    SELECT
        3,
        'doctor_specialties',
        5,
        COUNT(*)
    FROM geniusbot.doctor_specialties
    WHERE doctor_id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND specialty_id = '00000000-0000-0000-0000-000000000301'::uuid

    UNION ALL

    SELECT
        4,
        'doctor_working_hours',
        30,
        COUNT(*)
    FROM geniusbot.doctor_working_hours
    WHERE doctor_id IN (
        '00000000-0000-0000-0000-000000000501'::uuid,
        '00000000-0000-0000-0000-000000000502'::uuid,
        '00000000-0000-0000-0000-000000000503'::uuid,
        '00000000-0000-0000-0000-000000000504'::uuid,
        '00000000-0000-0000-0000-000000000505'::uuid
    )
      AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
      AND day_of_week IN (0, 1, 2, 3, 4, 6)
      AND is_active = TRUE

    UNION ALL

    SELECT
        5,
        'payment_methods',
        2,
        COUNT(*)
    FROM geniusbot.payment_methods
    WHERE id IN (
        '00000000-0000-0000-0000-000000000801'::uuid,
        '00000000-0000-0000-0000-000000000802'::uuid
    )

    UNION ALL

    SELECT
        6,
        'insurance_companies',
        3,
        COUNT(*)
    FROM geniusbot.insurance_companies
    WHERE id IN (
        '00000000-0000-0000-0000-000000000901'::uuid,
        '00000000-0000-0000-0000-000000000902'::uuid,
        '00000000-0000-0000-0000-000000000903'::uuid
    )

    UNION ALL

    SELECT
        7,
        'insurance_classes',
        12,
        COUNT(*)
    FROM geniusbot.insurance_classes
    WHERE id IN (
        '00000000-0000-0000-0000-000000000911'::uuid,
        '00000000-0000-0000-0000-000000000912'::uuid,
        '00000000-0000-0000-0000-000000000913'::uuid,
        '00000000-0000-0000-0000-000000000914'::uuid,
        '00000000-0000-0000-0000-000000000921'::uuid,
        '00000000-0000-0000-0000-000000000922'::uuid,
        '00000000-0000-0000-0000-000000000923'::uuid,
        '00000000-0000-0000-0000-000000000924'::uuid,
        '00000000-0000-0000-0000-000000000931'::uuid,
        '00000000-0000-0000-0000-000000000932'::uuid,
        '00000000-0000-0000-0000-000000000933'::uuid,
        '00000000-0000-0000-0000-000000000934'::uuid
    )

    UNION ALL

    SELECT
        8,
        'prices',
        11,
        COUNT(*)
    FROM geniusbot.prices
    WHERE id IN (
        '00000000-0000-0000-0000-000000001101'::uuid,
        '00000000-0000-0000-0000-000000001102'::uuid,
        '00000000-0000-0000-0000-000000001103'::uuid,
        '00000000-0000-0000-0000-000000001104'::uuid,
        '00000000-0000-0000-0000-000000001105'::uuid,
        '00000000-0000-0000-0000-000000001111'::uuid,
        '00000000-0000-0000-0000-000000001112'::uuid,
        '00000000-0000-0000-0000-000000001121'::uuid,
        '00000000-0000-0000-0000-000000001122'::uuid,
        '00000000-0000-0000-0000-000000001131'::uuid,
        '00000000-0000-0000-0000-000000001132'::uuid
    )

    UNION ALL

    SELECT
        9,
        'service_assignments',
        5,
        COUNT(*)
    FROM geniusbot.service_assignments
    WHERE id IN (
        '00000000-0000-0000-0000-000000000701'::uuid,
        '00000000-0000-0000-0000-000000000702'::uuid,
        '00000000-0000-0000-0000-000000000703'::uuid,
        '00000000-0000-0000-0000-000000000704'::uuid,
        '00000000-0000-0000-0000-000000000705'::uuid
    )
) AS validation
ORDER BY display_order;

COMMIT;
```
