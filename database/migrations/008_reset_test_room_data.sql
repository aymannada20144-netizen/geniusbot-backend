BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE geniusbot.appointments,
           geniusbot.service_assignments,
           geniusbot.room_time_off,
           geniusbot.rooms
    IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
    v_clinic_id constant uuid := '00000000-0000-0000-0000-000000000001';
    v_appointment_count integer;
    v_assignment_count integer;
    v_room_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM geniusbot.clinics
        WHERE id = v_clinic_id
          AND name = 'VIP عيادات أوريان'
    ) THEN
        RAISE EXCEPTION
            'Test room reset aborted: the expected test clinic identity is missing.';
    END IF;

    IF (
        SELECT count(*)
        FROM geniusbot.branches
        WHERE clinic_id = v_clinic_id
          AND name IN (
              'فرع الحمدانية — جدة',
              'فرع الصالحية — جدة'
          )
    ) <> 2 THEN
        RAISE EXCEPTION
            'Test room reset aborted: the expected Hamdaniyah and Salihiyah branches were not found.';
    END IF;

    SELECT count(*) INTO v_appointment_count
    FROM geniusbot.appointments
    WHERE clinic_id = v_clinic_id;

    SELECT count(*) INTO v_assignment_count
    FROM geniusbot.service_assignments
    WHERE clinic_id = v_clinic_id;

    SELECT count(*) INTO v_room_count
    FROM geniusbot.rooms AS r
    JOIN geniusbot.branches AS b ON b.id = r.branch_id
    WHERE b.clinic_id = v_clinic_id;

    IF v_appointment_count <> 4
       OR v_assignment_count <> 20
       OR v_room_count <> 12 THEN
        RAISE EXCEPTION
            'Test room reset aborted: audited counts drifted (appointments %, assignments %, rooms %).',
            v_appointment_count, v_assignment_count, v_room_count;
    END IF;

    IF EXISTS (
        SELECT required_service.name
        FROM (
            VALUES
                ('إزالة الشعر بالليزر'),
                ('بوتوكس'),
                ('البلازما PRP'),
                ('استشارة جلدية'),
                ('تقشير كيميائي'),
                ('علاج حب الشباب'),
                ('تنظيف بشرة'),
                ('فيلر')
        ) AS required_service(name)
        LEFT JOIN geniusbot.services AS s
          ON s.clinic_id = v_clinic_id
         AND s.name = required_service.name
         AND s.is_active IS TRUE
        WHERE s.id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Test room reset aborted: one or more required active services are missing.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM geniusbot.doctors AS d
        JOIN geniusbot.doctor_working_hours AS dwh ON dwh.doctor_id = d.id
        JOIN geniusbot.branches AS b ON b.id = dwh.branch_id
        WHERE d.id = '11111111-1111-1111-1111-111111111999'
          AND d.clinic_id = v_clinic_id
          AND d.is_active IS TRUE
          AND b.name = 'فرع الصالحية — جدة'
          AND dwh.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION
            'Test room reset aborted: the seeded Salihiyah doctor or working hours are missing.';
    END IF;
END;
$preflight$ LANGUAGE plpgsql;

-- Appointment child rows with CASCADE are removed by the appointment delete.
-- SET NULL dependants are retained as historical/operational data, without a
-- dangling appointment association.
DELETE FROM geniusbot.appointments
WHERE clinic_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM geniusbot.service_assignments
WHERE clinic_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM geniusbot.room_time_off AS rto
USING geniusbot.rooms AS r, geniusbot.branches AS b
WHERE rto.room_id = r.id
  AND r.branch_id = b.id
  AND b.clinic_id = '00000000-0000-0000-0000-000000000001'
  AND b.name IN (
      'فرع الحمدانية — جدة',
      'فرع الصالحية — جدة'
  );

DELETE FROM geniusbot.rooms AS r
USING geniusbot.branches AS b
WHERE r.branch_id = b.id
  AND b.clinic_id = '00000000-0000-0000-0000-000000000001'
  AND b.name IN (
      'فرع الحمدانية — جدة',
      'فرع الصالحية — جدة'
  );

INSERT INTO geniusbot.rooms (
    id,
    branch_id,
    room_number,
    room_name,
    room_type,
    is_active
)
SELECT seeded.id, b.id, seeded.room_number, seeded.room_name,
       seeded.room_type, TRUE
FROM (
    VALUES
        ('00000000-0000-0000-0000-000000000211'::uuid, 'فرع الحمدانية — جدة', '201', 'غرفة ليزر', 'laser'),
        ('00000000-0000-0000-0000-000000000212'::uuid, 'فرع الحمدانية — جدة', '202', 'غرفة تقشير', 'peeling'),
        ('00000000-0000-0000-0000-000000000213'::uuid, 'فرع الحمدانية — جدة', '301', 'غرفة كشف', 'consultation'),
        ('00000000-0000-0000-0000-000000000221'::uuid, 'فرع الصالحية — جدة', '102', 'غرفة ليزر 2', 'laser'),
        ('00000000-0000-0000-0000-000000000222'::uuid, 'فرع الصالحية — جدة', '201', 'غرفة تقشير', 'peeling'),
        ('00000000-0000-0000-0000-000000000223'::uuid, 'فرع الصالحية — جدة', '202', 'غرفة كشف', 'consultation'),
        ('00000000-0000-0000-0000-000000000224'::uuid, 'فرع الصالحية — جدة', '203', 'غرفة عناية بالبشرة', 'skin_care'),
        ('00000000-0000-0000-0000-000000000225'::uuid, 'فرع الصالحية — جدة', '301', 'غرفة حقن', 'injection')
) AS seeded(id, branch_name, room_number, room_name, room_type)
JOIN geniusbot.branches AS b
  ON b.clinic_id = '00000000-0000-0000-0000-000000000001'
 AND b.name = seeded.branch_name;

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
SELECT seeded.id,
       '00000000-0000-0000-0000-000000000001',
       b.id,
       s.id,
       '11111111-1111-1111-1111-111111111999',
       r.id,
       TRUE,
       TRUE
FROM (
    VALUES
        ('00000000-0000-0000-0000-000000000801'::uuid, 'إزالة الشعر بالليزر', '102'),
        ('00000000-0000-0000-0000-000000000802'::uuid, 'بوتوكس', '301'),
        ('00000000-0000-0000-0000-000000000803'::uuid, 'البلازما PRP', '301'),
        ('00000000-0000-0000-0000-000000000804'::uuid, 'استشارة جلدية', '202'),
        ('00000000-0000-0000-0000-000000000805'::uuid, 'تقشير كيميائي', '201'),
        ('00000000-0000-0000-0000-000000000806'::uuid, 'علاج حب الشباب', '202'),
        ('00000000-0000-0000-0000-000000000807'::uuid, 'تنظيف بشرة', '203'),
        ('00000000-0000-0000-0000-000000000808'::uuid, 'فيلر', '301')
) AS seeded(id, service_name, room_number)
JOIN geniusbot.branches AS b
  ON b.clinic_id = '00000000-0000-0000-0000-000000000001'
 AND b.name = 'فرع الصالحية — جدة'
JOIN geniusbot.services AS s
  ON s.clinic_id = '00000000-0000-0000-0000-000000000001'
 AND s.name = seeded.service_name
 AND s.is_active IS TRUE
JOIN geniusbot.rooms AS r
  ON r.branch_id = b.id
 AND r.room_number = seeded.room_number
 AND r.is_active IS TRUE;

DO $validation$
DECLARE
    v_clinic_id constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
    IF (SELECT count(*) FROM geniusbot.appointments WHERE clinic_id = v_clinic_id) <> 0 THEN
        RAISE EXCEPTION 'Test room reset validation failed: appointments remain.';
    END IF;

    IF (SELECT count(*) FROM geniusbot.service_assignments WHERE clinic_id = v_clinic_id) <> 8 THEN
        RAISE EXCEPTION 'Test room reset validation failed: expected 8 assignments.';
    END IF;

    IF (
        SELECT count(*)
        FROM geniusbot.rooms AS r
        JOIN geniusbot.branches AS b ON b.id = r.branch_id
        WHERE b.clinic_id = v_clinic_id
    ) <> 12 THEN
        RAISE EXCEPTION 'Test room reset validation failed: expected 12 rooms.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.rooms AS r
        JOIN geniusbot.branches AS b ON b.id = r.branch_id
        WHERE b.clinic_id = v_clinic_id
          AND (
              r.room_number IS NULL
              OR btrim(r.room_number) = ''
              OR r.room_name IS NULL
              OR btrim(r.room_name) = ''
              OR r.room_type IS NULL
              OR r.room_type NOT IN (
                  'consultation', 'laser', 'peeling', 'injection', 'skin_care'
              )
              OR r.is_active IS NOT TRUE
          )
    ) THEN
        RAISE EXCEPTION 'Test room reset validation failed: invalid room data remains.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.rooms AS r
        JOIN geniusbot.branches AS b ON b.id = r.branch_id
        WHERE b.clinic_id = v_clinic_id
        GROUP BY r.branch_id, r.room_number
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Test room reset validation failed: duplicate room numbers remain.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments AS sa
        JOIN geniusbot.rooms AS r ON r.id = sa.room_id
        JOIN geniusbot.branches AS b ON b.id = sa.branch_id
        JOIN geniusbot.services AS s ON s.id = sa.service_id
        JOIN geniusbot.doctors AS d ON d.id = sa.doctor_id
        WHERE sa.clinic_id = v_clinic_id
          AND (
              b.clinic_id <> sa.clinic_id
              OR r.branch_id <> sa.branch_id
              OR r.is_active IS NOT TRUE
              OR s.clinic_id <> sa.clinic_id
              OR d.clinic_id <> sa.clinic_id
              OR sa.is_active IS NOT TRUE
              OR r.room_type <> CASE s.name
                  WHEN 'إزالة الشعر بالليزر' THEN 'laser'
                  WHEN 'بوتوكس' THEN 'injection'
                  WHEN 'البلازما PRP' THEN 'injection'
                  WHEN 'استشارة جلدية' THEN 'consultation'
                  WHEN 'تقشير كيميائي' THEN 'peeling'
                  WHEN 'علاج حب الشباب' THEN 'consultation'
                  WHEN 'تنظيف بشرة' THEN 'skin_care'
                  WHEN 'فيلر' THEN 'injection'
              END
          )
    ) THEN
        RAISE EXCEPTION 'Test room reset validation failed: assignment mismatch remains.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.service_assignments
        WHERE clinic_id = v_clinic_id
        GROUP BY clinic_id, branch_id, service_id, doctor_id, room_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Test room reset validation failed: duplicate assignments remain.';
    END IF;
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
