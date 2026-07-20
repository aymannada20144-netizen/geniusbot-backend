```sql
-- =====================================================================
-- GeniusBot Database Seed
-- File: database/seed/004_booking_scenarios.sql
-- Target schema: geniusbot
--
-- Depends on:
--   database/seed/001_reference_data.sql
--   database/seed/002_clinic_structure.sql
--   database/seed/003_operational_data.sql
--
-- Contains:
--   1. Demo patients
--   2. Booking scenarios
--   3. Appointment status logs
--   4. Appointment reminders
--   5. Final validation
-- =====================================================================

BEGIN;

SET LOCAL search_path TO geniusbot, public;

-- =====================================================================
-- Stable UUIDs
-- =====================================================================
-- Clinic:
--   00000000-0000-0000-0000-000000000001
--
-- Branch:
--   00000000-0000-0000-0000-000000000101
--
-- Services:
--   401 = Consultation
--   402 = Laser
--   403 = Peeling
--   404 = Facial cleaning
--   405 = Cosmetic injections
--
-- Doctors:
--   501 = Consultation
--   502 = Laser
--   503 = Peeling
--   504 = Facial cleaning
--   505 = Cosmetic injections
--
-- Rooms:
--   601 = Consultation
--   602 = Laser
--   603 = Peeling
--   604 = Facial cleaning
--   605 = Cosmetic injections
--
-- Payment methods:
--   801 = Cash
--   802 = Insurance
-- =====================================================================

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

        SELECT 'service:00000000-0000-0000-0000-000000000401'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.services
            WHERE id = '00000000-0000-0000-0000-000000000401'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'service:00000000-0000-0000-0000-000000000402'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.services
            WHERE id = '00000000-0000-0000-0000-000000000402'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'service:00000000-0000-0000-0000-000000000403'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.services
            WHERE id = '00000000-0000-0000-0000-000000000403'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'service:00000000-0000-0000-0000-000000000404'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.services
            WHERE id = '00000000-0000-0000-0000-000000000404'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'service:00000000-0000-0000-0000-000000000405'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.services
            WHERE id = '00000000-0000-0000-0000-000000000405'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'doctor:00000000-0000-0000-0000-000000000501'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.doctors
            WHERE id = '00000000-0000-0000-0000-000000000501'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'doctor:00000000-0000-0000-0000-000000000502'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.doctors
            WHERE id = '00000000-0000-0000-0000-000000000502'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'doctor:00000000-0000-0000-0000-000000000503'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.doctors
            WHERE id = '00000000-0000-0000-0000-000000000503'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'doctor:00000000-0000-0000-0000-000000000504'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.doctors
            WHERE id = '00000000-0000-0000-0000-000000000504'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'doctor:00000000-0000-0000-0000-000000000505'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.doctors
            WHERE id = '00000000-0000-0000-0000-000000000505'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000601'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000601'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000602'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000602'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000603'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000603'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000604'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000604'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'room:00000000-0000-0000-0000-000000000605'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.rooms
            WHERE id = '00000000-0000-0000-0000-000000000605'::uuid
              AND branch_id = '00000000-0000-0000-0000-000000000101'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'payment_method:00000000-0000-0000-0000-000000000801'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.payment_methods
            WHERE id = '00000000-0000-0000-0000-000000000801'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND code = 'cash'
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'payment_method:00000000-0000-0000-0000-000000000802'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.payment_methods
            WHERE id = '00000000-0000-0000-0000-000000000802'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND code = 'insurance'
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'insurance_company:00000000-0000-0000-0000-000000000901'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.insurance_companies
            WHERE id = '00000000-0000-0000-0000-000000000901'::uuid
              AND clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
              AND is_active = TRUE
        )

        UNION ALL

        SELECT 'insurance_class:00000000-0000-0000-0000-000000000912'
        WHERE NOT EXISTS (
            SELECT 1
            FROM geniusbot.insurance_classes
            WHERE id = '00000000-0000-0000-0000-000000000912'::uuid
              AND insurance_company_id = '00000000-0000-0000-0000-000000000901'::uuid
              AND is_accepted = TRUE
        )
    ) AS missing;

    IF v_missing_items IS NOT NULL THEN
        RAISE EXCEPTION
            '004_booking_scenarios.sql prerequisite validation failed. Missing or mismatched records: %',
            array_to_string(v_missing_items, ', ');
    END IF;
END
$$;

-- =====================================================================
-- 1. Demo patients
-- =====================================================================

INSERT INTO geniusbot.patients (
    id,
    clinic_id,
    full_name,
    phone_number,
    whatsapp_id,
    gender,
    birth_date,
    source,
    notes
)
VALUES
(
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000000001',
    'نورة أحمد',
    '966555000001',
    '966555000001',
    'female',
    DATE '1994-05-12',
    'whatsapp_direct',
    'مريضة تجريبية مرتبطة بموعد مؤكد.'
),
(
    '00000000-0000-0000-0000-000000002002',
    '00000000-0000-0000-0000-000000000001',
    'ريم خالد',
    '966555000002',
    '966555000002',
    'female',
    DATE '1990-09-20',
    'instagram_ad',
    'مريضة تجريبية مرتبطة بموعد قيد التأكيد.'
),
(
    '00000000-0000-0000-0000-000000002003',
    '00000000-0000-0000-0000-000000000001',
    'سارة محمد',
    '966555000003',
    '966555000003',
    'female',
    DATE '1988-03-07',
    'google',
    'مريضة تجريبية مرتبطة بموعد مكتمل.'
),
(
    '00000000-0000-0000-0000-000000002004',
    '00000000-0000-0000-0000-000000000001',
    'هدى علي',
    '966555000004',
    '966555000004',
    'female',
    DATE '1997-11-14',
    'referral',
    'مريضة تجريبية مرتبطة بموعد ملغي.'
),
(
    '00000000-0000-0000-0000-000000002005',
    '00000000-0000-0000-0000-000000000001',
    'منال يوسف',
    '966555000005',
    '966555000005',
    'female',
    DATE '1985-01-24',
    'walk_in',
    'مريضة تجريبية مرتبطة بحالة عدم حضور.'
),
(
    '00000000-0000-0000-0000-000000002006',
    '00000000-0000-0000-0000-000000000001',
    'عبير حسن',
    '966555000006',
    '966555000006',
    'female',
    DATE '1992-06-18',
    'whatsapp_direct',
    'مريضة تجريبية مرتبطة بموعد أعيدت جدولته.'
),
(
    '00000000-0000-0000-0000-000000002007',
    '00000000-0000-0000-0000-000000000001',
    'أمل عبدالله',
    '966555000007',
    '966555000007',
    'female',
    DATE '1999-08-03',
    'instagram_ad',
    'مريضة تجريبية مرتبطة بحجز نقدي مستقبلي.'
),
(
    '00000000-0000-0000-0000-000000002008',
    '00000000-0000-0000-0000-000000000001',
    'لينا محمود',
    '966555000008',
    '966555000008',
    'female',
    DATE '1995-12-29',
    'google',
    'مريضة تجريبية مرتبطة بحجز تأمين مستقبلي.'
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id    = EXCLUDED.clinic_id,
    full_name    = EXCLUDED.full_name,
    phone_number = EXCLUDED.phone_number,
    whatsapp_id  = EXCLUDED.whatsapp_id,
    gender       = EXCLUDED.gender,
    birth_date   = EXCLUDED.birth_date,
    source       = EXCLUDED.source,
    notes        = EXCLUDED.notes,
    last_seen_at = NOW(),
    updated_at   = NOW();

-- =====================================================================
-- 2. Booking scenarios
--
-- Scenario 2301:
--   Confirmed consultation paid by cash.
--
-- Scenario 2302:
--   Pending laser appointment paid by insurance.
--
-- Scenario 2303:
--   Completed peeling appointment.
--
-- Scenario 2304:
--   Cancelled facial appointment.
--
-- Scenario 2305:
--   No-show cosmetic injection appointment.
--
-- Scenario 2306:
--   Historical rescheduled appointment.
--
-- Scenario 2307:
--   Replacement confirmed appointment for scenario 2306.
--
-- Scenario 2308:
--   Future confirmed cash appointment.
--
-- Scenario 2309:
--   Future pending insurance appointment.
--
-- Cancelled, completed, no-show and rescheduled records do not block
-- active appointment slots under the approved exclusion constraints.
-- =====================================================================

INSERT INTO geniusbot.appointments (
    id,
    clinic_id,
    branch_id,
    patient_id,
    service_id,
    doctor_id,
    room_id,
    conversation_id,
    appointment_start,
    appointment_end,
    payment_method_id,
    insurance_company_id,
    insurance_class_id,
    quoted_price,
    currency,
    status,
    source,
    notes
)
VALUES
(
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002001',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000601',
    NULL,
    TIMESTAMPTZ '2026-07-12 10:00:00+03',
    TIMESTAMPTZ '2026-07-12 10:30:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    150.00,
    'SAR',
    'confirmed',
    'whatsapp_direct',
    'سيناريو موعد مؤكد لخدمة الكشف والاستشارة والدفع نقدًا.'
),
(
    '00000000-0000-0000-0000-000000002302',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002002',
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000602',
    NULL,
    TIMESTAMPTZ '2026-07-12 14:00:00+03',
    TIMESTAMPTZ '2026-07-12 14:30:00+03',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000912',
    50.00,
    'SAR',
    'pending',
    'instagram_ad',
    'سيناريو موعد ليزر قيد التأكيد باستخدام تأمين بوبا فئة A.'
),
(
    '00000000-0000-0000-0000-000000002303',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002003',
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000603',
    NULL,
    TIMESTAMPTZ '2026-07-05 10:00:00+03',
    TIMESTAMPTZ '2026-07-05 10:30:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    300.00,
    'SAR',
    'completed',
    'google',
    'سيناريو موعد تقشير مكتمل.'
),
(
    '00000000-0000-0000-0000-000000002304',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002004',
    '00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000604',
    NULL,
    TIMESTAMPTZ '2026-07-06 12:00:00+03',
    TIMESTAMPTZ '2026-07-06 12:45:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    220.00,
    'SAR',
    'cancelled',
    'referral',
    'سيناريو موعد تنظيف بشرة ملغي.'
),
(
    '00000000-0000-0000-0000-000000002305',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002005',
    '00000000-0000-0000-0000-000000000405',
    '00000000-0000-0000-0000-000000000505',
    '00000000-0000-0000-0000-000000000605',
    NULL,
    TIMESTAMPTZ '2026-07-07 14:00:00+03',
    TIMESTAMPTZ '2026-07-07 14:30:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    500.00,
    'SAR',
    'no_show',
    'walk_in',
    'سيناريو موعد حقن تجميلية لم تحضر إليه المريضة.'
),
(
    '00000000-0000-0000-0000-000000002306',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002006',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000601',
    NULL,
    TIMESTAMPTZ '2026-07-13 11:00:00+03',
    TIMESTAMPTZ '2026-07-13 11:30:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    150.00,
    'SAR',
    'rescheduled',
    'whatsapp_direct',
    'الموعد الأصلي قبل إعادة الجدولة. الموعد البديل هو 00000000-0000-0000-0000-000000002307.'
),
(
    '00000000-0000-0000-0000-000000002307',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002006',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000601',
    NULL,
    TIMESTAMPTZ '2026-07-14 11:00:00+03',
    TIMESTAMPTZ '2026-07-14 11:30:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    150.00,
    'SAR',
    'confirmed',
    'whatsapp_direct',
    'الموعد البديل المؤكد بعد إعادة جدولة الموعد 00000000-0000-0000-0000-000000002306.'
),
(
    '00000000-0000-0000-0000-000000002308',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002007',
    '00000000-0000-0000-0000-000000000404',
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000604',
    NULL,
    TIMESTAMPTZ '2026-07-15 12:00:00+03',
    TIMESTAMPTZ '2026-07-15 12:45:00+03',
    '00000000-0000-0000-0000-000000000801',
    NULL,
    NULL,
    220.00,
    'SAR',
    'confirmed',
    'instagram_ad',
    'سيناريو حجز مستقبلي مؤكد لخدمة تنظيف البشرة والدفع نقدًا.'
),
(
    '00000000-0000-0000-0000-000000002309',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000002008',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000601',
    NULL,
    TIMESTAMPTZ '2026-07-16 10:00:00+03',
    TIMESTAMPTZ '2026-07-16 10:30:00+03',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000912',
    50.00,
    'SAR',
    'pending',
    'google',
    'سيناريو حجز مستقبلي قيد التأكيد باستخدام تأمين بوبا فئة A.'
)
ON CONFLICT (id) DO UPDATE
SET
    clinic_id            = EXCLUDED.clinic_id,
    branch_id            = EXCLUDED.branch_id,
    patient_id           = EXCLUDED.patient_id,
    service_id           = EXCLUDED.service_id,
    doctor_id            = EXCLUDED.doctor_id,
    room_id              = EXCLUDED.room_id,
    conversation_id      = EXCLUDED.conversation_id,
    appointment_start    = EXCLUDED.appointment_start,
    appointment_end      = EXCLUDED.appointment_end,
    payment_method_id    = EXCLUDED.payment_method_id,
    insurance_company_id = EXCLUDED.insurance_company_id,
    insurance_class_id   = EXCLUDED.insurance_class_id,
    quoted_price         = EXCLUDED.quoted_price,
    currency             = EXCLUDED.currency,
    status               = EXCLUDED.status,
    source               = EXCLUDED.source,
    notes                = EXCLUDED.notes,
    updated_at           = NOW();

-- =====================================================================
-- 3. Appointment status logs
-- =====================================================================

INSERT INTO geniusbot.appointment_status_logs (
    id,
    appointment_id,
    old_status,
    new_status,
    changed_by_staff_id,
    notes,
    created_at
)
VALUES
(
    '00000000-0000-0000-0000-000000002401',
    '00000000-0000-0000-0000-000000002301',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد بحالة pending.',
    TIMESTAMPTZ '2026-07-10 09:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002402',
    '00000000-0000-0000-0000-000000002301',
    'pending',
    'confirmed',
    NULL,
    'تم تأكيد الموعد.',
    TIMESTAMPTZ '2026-07-10 09:05:00+03'
),
(
    '00000000-0000-0000-0000-000000002403',
    '00000000-0000-0000-0000-000000002302',
    NULL,
    'pending',
    NULL,
    'تم إنشاء موعد التأمين وهو في انتظار التأكيد.',
    TIMESTAMPTZ '2026-07-10 09:10:00+03'
),
(
    '00000000-0000-0000-0000-000000002404',
    '00000000-0000-0000-0000-000000002303',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد.',
    TIMESTAMPTZ '2026-07-04 10:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002405',
    '00000000-0000-0000-0000-000000002303',
    'pending',
    'confirmed',
    NULL,
    'تم تأكيد الموعد.',
    TIMESTAMPTZ '2026-07-04 10:10:00+03'
),
(
    '00000000-0000-0000-0000-000000002406',
    '00000000-0000-0000-0000-000000002303',
    'confirmed',
    'completed',
    NULL,
    'تم إكمال الموعد بنجاح.',
    TIMESTAMPTZ '2026-07-05 10:35:00+03'
),
(
    '00000000-0000-0000-0000-000000002407',
    '00000000-0000-0000-0000-000000002304',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد.',
    TIMESTAMPTZ '2026-07-05 11:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002408',
    '00000000-0000-0000-0000-000000002304',
    'pending',
    'cancelled',
    NULL,
    'تم إلغاء الموعد بناءً على طلب المريضة.',
    TIMESTAMPTZ '2026-07-05 15:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002409',
    '00000000-0000-0000-0000-000000002305',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد.',
    TIMESTAMPTZ '2026-07-06 14:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002410',
    '00000000-0000-0000-0000-000000002305',
    'pending',
    'confirmed',
    NULL,
    'تم تأكيد الموعد.',
    TIMESTAMPTZ '2026-07-06 14:10:00+03'
),
(
    '00000000-0000-0000-0000-000000002411',
    '00000000-0000-0000-0000-000000002305',
    'confirmed',
    'no_show',
    NULL,
    'لم تحضر المريضة إلى الموعد.',
    TIMESTAMPTZ '2026-07-07 14:35:00+03'
),
(
    '00000000-0000-0000-0000-000000002412',
    '00000000-0000-0000-0000-000000002306',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد الأصلي.',
    TIMESTAMPTZ '2026-07-09 10:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002413',
    '00000000-0000-0000-0000-000000002306',
    'pending',
    'confirmed',
    NULL,
    'تم تأكيد الموعد الأصلي.',
    TIMESTAMPTZ '2026-07-09 10:05:00+03'
),
(
    '00000000-0000-0000-0000-000000002414',
    '00000000-0000-0000-0000-000000002306',
    'confirmed',
    'rescheduled',
    NULL,
    'تم نقل الموعد إلى 2026-07-14 الساعة 11:00.',
    TIMESTAMPTZ '2026-07-10 08:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002415',
    '00000000-0000-0000-0000-000000002307',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد البديل.',
    TIMESTAMPTZ '2026-07-10 08:00:01+03'
),
(
    '00000000-0000-0000-0000-000000002416',
    '00000000-0000-0000-0000-000000002307',
    'pending',
    'confirmed',
    NULL,
    'تم تأكيد الموعد البديل.',
    TIMESTAMPTZ '2026-07-10 08:00:02+03'
),
(
    '00000000-0000-0000-0000-000000002417',
    '00000000-0000-0000-0000-000000002308',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد المستقبلي.',
    TIMESTAMPTZ '2026-07-10 10:00:00+03'
),
(
    '00000000-0000-0000-0000-000000002418',
    '00000000-0000-0000-0000-000000002308',
    'pending',
    'confirmed',
    NULL,
    'تم تأكيد الموعد المستقبلي.',
    TIMESTAMPTZ '2026-07-10 10:05:00+03'
),
(
    '00000000-0000-0000-0000-000000002419',
    '00000000-0000-0000-0000-000000002309',
    NULL,
    'pending',
    NULL,
    'تم إنشاء الموعد وهو في انتظار التأكيد.',
    TIMESTAMPTZ '2026-07-10 10:10:00+03'
)
ON CONFLICT (id) DO UPDATE
SET
    appointment_id     = EXCLUDED.appointment_id,
    old_status         = EXCLUDED.old_status,
    new_status         = EXCLUDED.new_status,
    changed_by_staff_id = EXCLUDED.changed_by_staff_id,
    notes              = EXCLUDED.notes,
    created_at         = EXCLUDED.created_at;

-- =====================================================================
-- 4. Appointment reminders
--
-- Only active future appointments receive pending reminders.
-- Terminal and rescheduled appointments use cancelled or sent reminders.
-- =====================================================================

INSERT INTO geniusbot.appointment_reminders (
    id,
    appointment_id,
    reminder_type,
    scheduled_at,
    sent_at,
    status
)
VALUES
(
    '00000000-0000-0000-0000-000000002501',
    '00000000-0000-0000-0000-000000002301',
    '24h',
    TIMESTAMPTZ '2026-07-11 10:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002502',
    '00000000-0000-0000-0000-000000002301',
    '1h',
    TIMESTAMPTZ '2026-07-12 09:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002503',
    '00000000-0000-0000-0000-000000002302',
    '24h',
    TIMESTAMPTZ '2026-07-11 14:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002504',
    '00000000-0000-0000-0000-000000002302',
    '1h',
    TIMESTAMPTZ '2026-07-12 13:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002505',
    '00000000-0000-0000-0000-000000002303',
    '24h',
    TIMESTAMPTZ '2026-07-04 10:00:00+03',
    TIMESTAMPTZ '2026-07-04 10:00:15+03',
    'sent'
),
(
    '00000000-0000-0000-0000-000000002506',
    '00000000-0000-0000-0000-000000002303',
    'followup',
    TIMESTAMPTZ '2026-07-06 10:30:00+03',
    TIMESTAMPTZ '2026-07-06 10:30:10+03',
    'sent'
),
(
    '00000000-0000-0000-0000-000000002507',
    '00000000-0000-0000-0000-000000002304',
    '24h',
    TIMESTAMPTZ '2026-07-05 12:00:00+03',
    NULL,
    'cancelled'
),
(
    '00000000-0000-0000-0000-000000002508',
    '00000000-0000-0000-0000-000000002305',
    '24h',
    TIMESTAMPTZ '2026-07-06 14:00:00+03',
    TIMESTAMPTZ '2026-07-06 14:00:10+03',
    'sent'
),
(
    '00000000-0000-0000-0000-000000002509',
    '00000000-0000-0000-0000-000000002306',
    '24h',
    TIMESTAMPTZ '2026-07-12 11:00:00+03',
    NULL,
    'cancelled'
),
(
    '00000000-0000-0000-0000-000000002510',
    '00000000-0000-0000-0000-000000002307',
    '24h',
    TIMESTAMPTZ '2026-07-13 11:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002511',
    '00000000-0000-0000-0000-000000002307',
    '1h',
    TIMESTAMPTZ '2026-07-14 10:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002512',
    '00000000-0000-0000-0000-000000002308',
    '24h',
    TIMESTAMPTZ '2026-07-14 12:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002513',
    '00000000-0000-0000-0000-000000002308',
    '1h',
    TIMESTAMPTZ '2026-07-15 11:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002514',
    '00000000-0000-0000-0000-000000002309',
    '24h',
    TIMESTAMPTZ '2026-07-15 10:00:00+03',
    NULL,
    'pending'
),
(
    '00000000-0000-0000-0000-000000002515',
    '00000000-0000-0000-0000-000000002309',
    '1h',
    TIMESTAMPTZ '2026-07-16 09:00:00+03',
    NULL,
    'pending'
)
ON CONFLICT (id) DO UPDATE
SET
    appointment_id = EXCLUDED.appointment_id,
    reminder_type  = EXCLUDED.reminder_type,
    scheduled_at   = EXCLUDED.scheduled_at,
    sent_at        = EXCLUDED.sent_at,
    status         = EXCLUDED.status,
    updated_at     = NOW();

-- =====================================================================
-- Final validation
-- =====================================================================

DO $$
DECLARE
    v_patients_count                  integer;
    v_appointments_count              integer;
    v_status_logs_count               integer;
    v_reminders_count                 integer;
    v_pending_count                   integer;
    v_confirmed_count                 integer;
    v_completed_count                 integer;
    v_cancelled_count                 integer;
    v_no_show_count                   integer;
    v_rescheduled_count               integer;
    v_invalid_patient_count           integer;
    v_invalid_appointment_count       integer;
    v_invalid_payment_count           integer;
    v_invalid_assignment_count        integer;
    v_invalid_reminder_count          integer;
    v_active_overlap_count            integer;
BEGIN
    SELECT COUNT(*)
    INTO v_patients_count
    FROM geniusbot.patients
    WHERE id IN (
        '00000000-0000-0000-0000-000000002001'::uuid,
        '00000000-0000-0000-0000-000000002002'::uuid,
        '00000000-0000-0000-0000-000000002003'::uuid,
        '00000000-0000-0000-0000-000000002004'::uuid,
        '00000000-0000-0000-0000-000000002005'::uuid,
        '00000000-0000-0000-0000-000000002006'::uuid,
        '00000000-0000-0000-0000-000000002007'::uuid,
        '00000000-0000-0000-0000-000000002008'::uuid
    );

    SELECT COUNT(*)
    INTO v_appointments_count
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    );

    SELECT COUNT(*)
    INTO v_status_logs_count
    FROM geniusbot.appointment_status_logs
    WHERE id BETWEEN
        '00000000-0000-0000-0000-000000002401'::uuid
        AND
        '00000000-0000-0000-0000-000000002419'::uuid;

    SELECT COUNT(*)
    INTO v_reminders_count
    FROM geniusbot.appointment_reminders
    WHERE id BETWEEN
        '00000000-0000-0000-0000-000000002501'::uuid
        AND
        '00000000-0000-0000-0000-000000002515'::uuid;

    SELECT COUNT(*) FILTER (WHERE status = 'pending'),
           COUNT(*) FILTER (WHERE status = 'confirmed'),
           COUNT(*) FILTER (WHERE status = 'completed'),
           COUNT(*) FILTER (WHERE status = 'cancelled'),
           COUNT(*) FILTER (WHERE status = 'no_show'),
           COUNT(*) FILTER (WHERE status = 'rescheduled')
    INTO
        v_pending_count,
        v_confirmed_count,
        v_completed_count,
        v_cancelled_count,
        v_no_show_count,
        v_rescheduled_count
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    );

    SELECT COUNT(*)
    INTO v_invalid_patient_count
    FROM geniusbot.patients p
    WHERE p.id IN (
        '00000000-0000-0000-0000-000000002001'::uuid,
        '00000000-0000-0000-0000-000000002002'::uuid,
        '00000000-0000-0000-0000-000000002003'::uuid,
        '00000000-0000-0000-0000-000000002004'::uuid,
        '00000000-0000-0000-0000-000000002005'::uuid,
        '00000000-0000-0000-0000-000000002006'::uuid,
        '00000000-0000-0000-0000-000000002007'::uuid,
        '00000000-0000-0000-0000-000000002008'::uuid
    )
      AND (
          p.clinic_id <> '00000000-0000-0000-0000-000000000001'::uuid
          OR p.full_name IS NULL
          OR BTRIM(p.full_name) = ''
          OR p.phone_number IS NULL
          OR BTRIM(p.phone_number) = ''
      );

    SELECT COUNT(*)
    INTO v_invalid_appointment_count
    FROM geniusbot.appointments a
    JOIN geniusbot.branches b
      ON b.id = a.branch_id
    JOIN geniusbot.patients p
      ON p.id = a.patient_id
    JOIN geniusbot.services s
      ON s.id = a.service_id
    JOIN geniusbot.doctors d
      ON d.id = a.doctor_id
    JOIN geniusbot.rooms r
      ON r.id = a.room_id
    WHERE a.id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND (
          a.clinic_id <> '00000000-0000-0000-0000-000000000001'::uuid
          OR b.clinic_id <> a.clinic_id
          OR p.clinic_id <> a.clinic_id
          OR s.clinic_id <> a.clinic_id
          OR d.clinic_id <> a.clinic_id
          OR r.branch_id <> a.branch_id
          OR a.appointment_end <= a.appointment_start
          OR a.currency <> 'SAR'
          OR a.quoted_price < 0
      );

    SELECT COUNT(*)
    INTO v_invalid_payment_count
    FROM geniusbot.appointments a
    JOIN geniusbot.payment_methods pm
      ON pm.id = a.payment_method_id
    LEFT JOIN geniusbot.insurance_companies ic
      ON ic.id = a.insurance_company_id
    LEFT JOIN geniusbot.insurance_classes cls
      ON cls.id = a.insurance_class_id
    WHERE a.id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND (
          pm.clinic_id <> a.clinic_id
          OR (
              pm.code = 'cash'
              AND (
                  a.insurance_company_id IS NOT NULL
                  OR a.insurance_class_id IS NOT NULL
              )
          )
          OR (
              pm.code = 'insurance'
              AND (
                  a.insurance_company_id IS NULL
                  OR a.insurance_class_id IS NULL
                  OR ic.clinic_id <> a.clinic_id
                  OR cls.insurance_company_id <> a.insurance_company_id
                  OR cls.is_accepted IS NOT TRUE
              )
          )
      );

    SELECT COUNT(*)
    INTO v_invalid_assignment_count
    FROM geniusbot.appointments a
    WHERE a.id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND NOT EXISTS (
          SELECT 1
          FROM geniusbot.service_assignments sa
          WHERE sa.clinic_id = a.clinic_id
            AND sa.branch_id = a.branch_id
            AND sa.service_id = a.service_id
            AND sa.doctor_id = a.doctor_id
            AND sa.room_id = a.room_id
            AND sa.is_active = TRUE
      );

    SELECT COUNT(*)
    INTO v_invalid_reminder_count
    FROM geniusbot.appointment_reminders ar
    JOIN geniusbot.appointments a
      ON a.id = ar.appointment_id
    WHERE ar.id BETWEEN
        '00000000-0000-0000-0000-000000002501'::uuid
        AND
        '00000000-0000-0000-0000-000000002515'::uuid
      AND (
          ar.reminder_type NOT IN ('24h', '1h', 'followup', 'custom')
          OR ar.status NOT IN ('pending', 'sent', 'failed', 'cancelled')
          OR (
              ar.status = 'sent'
              AND ar.sent_at IS NULL
          )
          OR (
              ar.status = 'pending'
              AND ar.sent_at IS NOT NULL
          )
          OR (
              ar.reminder_type IN ('24h', '1h')
              AND ar.scheduled_at >= a.appointment_start
          )
      );

    SELECT COUNT(*)
    INTO v_active_overlap_count
    FROM geniusbot.appointments a1
    JOIN geniusbot.appointments a2
      ON a1.id < a2.id
     AND a1.status IN ('pending', 'confirmed')
     AND a2.status IN ('pending', 'confirmed')
     AND tstzrange(
            a1.appointment_start,
            a1.appointment_end,
            '[)'
         ) && tstzrange(
            a2.appointment_start,
            a2.appointment_end,
            '[)'
         )
     AND (
            a1.doctor_id = a2.doctor_id
         OR a1.room_id = a2.room_id
         OR a1.patient_id = a2.patient_id
     )
    WHERE a1.id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND a2.id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    );

    IF v_patients_count <> 8 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 8 patients, found %.',
            v_patients_count;
    END IF;

    IF v_appointments_count <> 9 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 9 appointments, found %.',
            v_appointments_count;
    END IF;

    IF v_status_logs_count <> 19 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 19 appointment status logs, found %.',
            v_status_logs_count;
    END IF;

    IF v_reminders_count <> 15 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 15 appointment reminders, found %.',
            v_reminders_count;
    END IF;

    IF v_pending_count <> 2 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 2 pending appointments, found %.',
            v_pending_count;
    END IF;

    IF v_confirmed_count <> 3 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 3 confirmed appointments, found %.',
            v_confirmed_count;
    END IF;

    IF v_completed_count <> 1 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 1 completed appointment, found %.',
            v_completed_count;
    END IF;

    IF v_cancelled_count <> 1 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 1 cancelled appointment, found %.',
            v_cancelled_count;
    END IF;

    IF v_no_show_count <> 1 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 1 no-show appointment, found %.',
            v_no_show_count;
    END IF;

    IF v_rescheduled_count <> 1 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: expected 1 rescheduled appointment, found %.',
            v_rescheduled_count;
    END IF;

    IF v_invalid_patient_count <> 0 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: % invalid patient records.',
            v_invalid_patient_count;
    END IF;

    IF v_invalid_appointment_count <> 0 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: % invalid appointment records.',
            v_invalid_appointment_count;
    END IF;

    IF v_invalid_payment_count <> 0 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: % invalid appointment payment records.',
            v_invalid_payment_count;
    END IF;

    IF v_invalid_assignment_count <> 0 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: % appointments do not match active service assignments.',
            v_invalid_assignment_count;
    END IF;

    IF v_invalid_reminder_count <> 0 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: % invalid reminder records.',
            v_invalid_reminder_count;
    END IF;

    IF v_active_overlap_count <> 0 THEN
        RAISE EXCEPTION
            '004_booking_scenarios validation failed: % active appointment overlaps found.',
            v_active_overlap_count;
    END IF;

    RAISE NOTICE '004_booking_scenarios.sql validation passed.';
    RAISE NOTICE 'Patients: %', v_patients_count;
    RAISE NOTICE 'Appointments: %', v_appointments_count;
    RAISE NOTICE 'Pending appointments: %', v_pending_count;
    RAISE NOTICE 'Confirmed appointments: %', v_confirmed_count;
    RAISE NOTICE 'Completed appointments: %', v_completed_count;
    RAISE NOTICE 'Cancelled appointments: %', v_cancelled_count;
    RAISE NOTICE 'No-show appointments: %', v_no_show_count;
    RAISE NOTICE 'Rescheduled appointments: %', v_rescheduled_count;
    RAISE NOTICE 'Appointment status logs: %', v_status_logs_count;
    RAISE NOTICE 'Appointment reminders: %', v_reminders_count;
END
$$;

-- =====================================================================
-- Validation result set
-- =====================================================================

SELECT
    validation_order,
    validation_name,
    expected_value,
    actual_value,
    CASE
        WHEN actual_value = expected_value THEN 'PASS'
        ELSE 'FAIL'
    END AS validation_status
FROM (
    SELECT
        1 AS validation_order,
        'seeded_patients'::text AS validation_name,
        8::bigint AS expected_value,
        COUNT(*)::bigint AS actual_value
    FROM geniusbot.patients
    WHERE id IN (
        '00000000-0000-0000-0000-000000002001'::uuid,
        '00000000-0000-0000-0000-000000002002'::uuid,
        '00000000-0000-0000-0000-000000002003'::uuid,
        '00000000-0000-0000-0000-000000002004'::uuid,
        '00000000-0000-0000-0000-000000002005'::uuid,
        '00000000-0000-0000-0000-000000002006'::uuid,
        '00000000-0000-0000-0000-000000002007'::uuid,
        '00000000-0000-0000-0000-000000002008'::uuid
    )

    UNION ALL

    SELECT
        2,
        'seeded_appointments',
        9,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )

    UNION ALL

    SELECT
        3,
        'pending_appointments',
        2,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND status = 'pending'

    UNION ALL

    SELECT
        4,
        'confirmed_appointments',
        3,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND status = 'confirmed'

    UNION ALL

    SELECT
        5,
        'completed_appointments',
        1,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND status = 'completed'

    UNION ALL

    SELECT
        6,
        'cancelled_appointments',
        1,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND status = 'cancelled'

    UNION ALL

    SELECT
        7,
        'no_show_appointments',
        1,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND status = 'no_show'

    UNION ALL

    SELECT
        8,
        'rescheduled_appointments',
        1,
        COUNT(*)
    FROM geniusbot.appointments
    WHERE id IN (
        '00000000-0000-0000-0000-000000002301'::uuid,
        '00000000-0000-0000-0000-000000002302'::uuid,
        '00000000-0000-0000-0000-000000002303'::uuid,
        '00000000-0000-0000-0000-000000002304'::uuid,
        '00000000-0000-0000-0000-000000002305'::uuid,
        '00000000-0000-0000-0000-000000002306'::uuid,
        '00000000-0000-0000-0000-000000002307'::uuid,
        '00000000-0000-0000-0000-000000002308'::uuid,
        '00000000-0000-0000-0000-000000002309'::uuid
    )
      AND status = 'rescheduled'

    UNION ALL

    SELECT
        9,
        'appointment_status_logs',
        19,
        COUNT(*)
    FROM geniusbot.appointment_status_logs
    WHERE id BETWEEN
        '00000000-0000-0000-0000-000000002401'::uuid
        AND
        '00000000-0000-0000-0000-000000002419'::uuid

    UNION ALL

    SELECT
        10,
        'appointment_reminders',
        15,
        COUNT(*)
    FROM geniusbot.appointment_reminders
    WHERE id BETWEEN
        '00000000-0000-0000-0000-000000002501'::uuid
        AND
        '00000000-0000-0000-0000-000000002515'::uuid
) AS validation
ORDER BY validation_order;

-- =====================================================================
-- Booking scenario summary
-- =====================================================================

SELECT
    a.id AS appointment_id,
    p.full_name AS patient_name,
    s.name AS service_name,
    CONCAT_WS(' ', d.title, d.full_name) AS doctor_name,
    r.room_name,
    a.appointment_start,
    a.appointment_end,
    pm.name AS payment_method,
    ic.name AS insurance_company,
    cls.class_name AS insurance_class,
    a.quoted_price,
    a.currency,
    a.status,
    a.source,
    a.notes
FROM geniusbot.appointments a
JOIN geniusbot.patients p
  ON p.id = a.patient_id
JOIN geniusbot.services s
  ON s.id = a.service_id
LEFT JOIN geniusbot.doctors d
  ON d.id = a.doctor_id
LEFT JOIN geniusbot.rooms r
  ON r.id = a.room_id
LEFT JOIN geniusbot.payment_methods pm
  ON pm.id = a.payment_method_id
LEFT JOIN geniusbot.insurance_companies ic
  ON ic.id = a.insurance_company_id
LEFT JOIN geniusbot.insurance_classes cls
  ON cls.id = a.insurance_class_id
WHERE a.id IN (
    '00000000-0000-0000-0000-000000002301'::uuid,
    '00000000-0000-0000-0000-000000002302'::uuid,
    '00000000-0000-0000-0000-000000002303'::uuid,
    '00000000-0000-0000-0000-000000002304'::uuid,
    '00000000-0000-0000-0000-000000002305'::uuid,
    '00000000-0000-0000-0000-000000002306'::uuid,
    '00000000-0000-0000-0000-000000002307'::uuid,
    '00000000-0000-0000-0000-000000002308'::uuid,
    '00000000-0000-0000-0000-000000002309'::uuid
)
ORDER BY a.appointment_start, a.id;

COMMIT;
```
