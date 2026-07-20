/*
===============================================================================
File: database/seed/001_reference_data.sql
Project: GeniusBot Backend
Schema: geniusbot
Purpose: Seed global reference data
Version: 2.0

Execution:
    psql -v ON_ERROR_STOP=1 -f database/seed/001_reference_data.sql

Properties:
    - Idempotent
    - Safe to execute multiple times
    - Contains global reference data only
    - Does not insert clinic-specific records
===============================================================================
*/

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- ============================================================================
-- 1. Booking Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        'booking_create',
        'إنشاء حجز',
        'يرغب المريض في إنشاء موعد جديد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        'booking_reschedule',
        'إعادة جدولة حجز',
        'يرغب المريض في تغيير تاريخ أو وقت موعد قائم.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        'booking_cancel',
        'إلغاء حجز',
        'يرغب المريض في إلغاء موعد قائم.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000004',
        'booking_confirm',
        'تأكيد حجز',
        'يرغب المريض في تأكيد موعد قائم.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000005',
        'booking_status',
        'حالة الحجز',
        'يسأل المريض عن حالة موعده الحالي.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000006',
        'booking_upcoming',
        'الموعد القادم',
        'يسأل المريض عن أقرب موعد قادم له.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 2. Availability Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000011',
        'availability_check',
        'التحقق من المواعيد المتاحة',
        'يسأل المريض عن المواعيد المتاحة لخدمة أو طبيب أو فرع.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000012',
        'availability_date',
        'توفر تاريخ محدد',
        'يسأل المريض عن التوفر في تاريخ محدد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000013',
        'availability_time',
        'توفر وقت محدد',
        'يسأل المريض عن التوفر في وقت محدد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000014',
        'availability_doctor',
        'توفر طبيب',
        'يسأل المريض عن توفر طبيب محدد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000015',
        'availability_branch',
        'توفر فرع',
        'يسأل المريض عن التوفر في فرع محدد.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 3. Service Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000021',
        'service_list',
        'قائمة الخدمات',
        'يسأل المريض عن الخدمات التي تقدمها العيادة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000022',
        'service_details',
        'تفاصيل خدمة',
        'يسأل المريض عن تفاصيل خدمة محددة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000023',
        'service_duration',
        'مدة الخدمة',
        'يسأل المريض عن المدة المتوقعة لخدمة محددة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000024',
        'service_price',
        'سعر الخدمة',
        'يسأل المريض عن سعر خدمة محددة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000025',
        'service_preparation',
        'الاستعداد للخدمة',
        'يسأل المريض عن تعليمات الاستعداد قبل الخدمة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000026',
        'service_aftercare',
        'تعليمات ما بعد الخدمة',
        'يسأل المريض عن تعليمات العناية بعد الخدمة.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 4. Doctor Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000031',
        'doctor_list',
        'قائمة الأطباء',
        'يسأل المريض عن الأطباء المتاحين في العيادة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000032',
        'doctor_details',
        'تفاصيل الطبيب',
        'يسأل المريض عن طبيب محدد أو تخصصه أو خبرته.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000033',
        'doctor_services',
        'خدمات الطبيب',
        'يسأل المريض عن الخدمات التي يقدمها طبيب محدد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000034',
        'doctor_schedule',
        'جدول الطبيب',
        'يسأل المريض عن أيام أو ساعات عمل طبيب محدد.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 5. Branch Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000041',
        'branch_list',
        'قائمة الفروع',
        'يسأل المريض عن فروع العيادة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000042',
        'branch_location',
        'موقع الفرع',
        'يسأل المريض عن عنوان أو موقع فرع محدد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000043',
        'branch_working_hours',
        'ساعات عمل الفرع',
        'يسأل المريض عن ساعات عمل فرع محدد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000044',
        'branch_contact',
        'بيانات اتصال الفرع',
        'يسأل المريض عن رقم الهاتف أو وسيلة الاتصال بالفرع.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 6. Payment And Insurance Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000051',
        'payment_methods',
        'طرق الدفع',
        'يسأل المريض عن طرق الدفع المقبولة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000052',
        'payment_status',
        'حالة الدفع',
        'يسأل المريض عن حالة دفع مرتبطة بموعد.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000053',
        'insurance_companies',
        'شركات التأمين',
        'يسأل المريض عن شركات التأمين المقبولة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000054',
        'insurance_coverage',
        'تغطية التأمين',
        'يسأل المريض عما إذا كانت خدمته أو فئته التأمينية مقبولة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000055',
        'refund_request',
        'طلب استرداد',
        'يرغب المريض في الاستفسار عن استرداد دفعة أو طلبه.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 7. Patient Information Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000061',
        'patient_history',
        'سجل المريض',
        'يسأل المريض عن مواعيده أو زياراته السابقة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000062',
        'patient_update_details',
        'تحديث بيانات المريض',
        'يرغب المريض في تعديل اسمه أو هاتفه أو بريده الإلكتروني.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000063',
        'patient_visit_count',
        'عدد الزيارات',
        'يسأل المريض عن عدد زياراته السابقة.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 8. Conversation And Support Intents
-- ============================================================================

INSERT INTO geniusbot.intents (
    id,
    code,
    name,
    description,
    is_active
)
VALUES
    (
        '10000000-0000-0000-0000-000000000071',
        'greeting',
        'تحية',
        'يبدأ المستخدم المحادثة بتحية.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000072',
        'goodbye',
        'إنهاء المحادثة',
        'ينهي المستخدم المحادثة أو يوجه الشكر.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000073',
        'human_handover',
        'التحويل إلى موظف',
        'يطلب المستخدم التحدث مع موظف بشري.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000074',
        'complaint',
        'شكوى',
        'يرغب المستخدم في تقديم شكوى.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000075',
        'feedback',
        'ملاحظة أو تقييم',
        'يرغب المستخدم في تقديم ملاحظة أو تقييم.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000076',
        'faq',
        'سؤال عام',
        'يسأل المستخدم سؤالًا عامًا عن العيادة.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000077',
        'unknown',
        'نية غير معروفة',
        'تعذر تحديد نية المستخدم بدرجة كافية.',
        true
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 9. Validate Reference Data
-- ============================================================================

DO $$
DECLARE
    required_intent_count integer := 41;
    actual_intent_count integer;
BEGIN
    SELECT COUNT(*)
    INTO actual_intent_count
    FROM geniusbot.intents
    WHERE code IN (
        'booking_create',
        'booking_reschedule',
        'booking_cancel',
        'booking_confirm',
        'booking_status',
        'booking_upcoming',

        'availability_check',
        'availability_date',
        'availability_time',
        'availability_doctor',
        'availability_branch',

        'service_list',
        'service_details',
        'service_duration',
        'service_price',
        'service_preparation',
        'service_aftercare',

        'doctor_list',
        'doctor_details',
        'doctor_services',
        'doctor_schedule',

        'branch_list',
        'branch_location',
        'branch_working_hours',
        'branch_contact',

        'payment_methods',
        'payment_status',
        'insurance_companies',
        'insurance_coverage',
        'refund_request',

        'patient_history',
        'patient_update_details',
        'patient_visit_count',

        'greeting',
        'goodbye',
        'human_handover',
        'complaint',
        'feedback',
        'faq',
        'unknown'
    );

    IF actual_intent_count <> required_intent_count THEN
        RAISE EXCEPTION
            'Reference seed validation failed. Expected % intents, found %.',
            required_intent_count,
            actual_intent_count;
    END IF;
END;
$$;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'GeniusBot global reference data installed successfully.';
    RAISE NOTICE 'Seeded table: geniusbot.intents';
    RAISE NOTICE '===============================================================';
END;
$$;