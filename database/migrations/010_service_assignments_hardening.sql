BEGIN;

DO $preflight$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count
    FROM geniusbot.service_assignments sa
    LEFT JOIN geniusbot.clinics c ON c.id = sa.clinic_id
    LEFT JOIN geniusbot.branches b ON b.id = sa.branch_id
    LEFT JOIN geniusbot.services s ON s.id = sa.service_id
    LEFT JOIN geniusbot.doctors d ON d.id = sa.doctor_id
    LEFT JOIN geniusbot.rooms r ON r.id = sa.room_id
    LEFT JOIN geniusbot.branches rb ON rb.id = r.branch_id
    WHERE c.id IS NULL OR b.id IS NULL OR s.id IS NULL
       OR (sa.doctor_id IS NOT NULL AND d.id IS NULL)
       OR (sa.room_id IS NOT NULL AND r.id IS NULL);
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % orphan reference(s).', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM geniusbot.service_assignments sa
    JOIN geniusbot.branches b ON b.id = sa.branch_id
    JOIN geniusbot.services s ON s.id = sa.service_id
    LEFT JOIN geniusbot.doctors d ON d.id = sa.doctor_id
    LEFT JOIN geniusbot.rooms r ON r.id = sa.room_id
    LEFT JOIN geniusbot.branches rb ON rb.id = r.branch_id
    WHERE b.clinic_id IS DISTINCT FROM sa.clinic_id
       OR s.clinic_id IS DISTINCT FROM sa.clinic_id
       OR (sa.doctor_id IS NOT NULL AND d.clinic_id IS DISTINCT FROM sa.clinic_id)
       OR (sa.room_id IS NOT NULL AND rb.clinic_id IS DISTINCT FROM sa.clinic_id);
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % cross-clinic relation(s).', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM geniusbot.service_assignments sa
    JOIN geniusbot.rooms r ON r.id = sa.room_id
    WHERE r.branch_id IS DISTINCT FROM sa.branch_id;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % cross-branch room relation(s).', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM geniusbot.service_assignments sa
    JOIN geniusbot.services s ON s.id = sa.service_id
    WHERE (s.requires_doctor AND sa.doctor_id IS NULL)
       OR (s.requires_room AND sa.room_id IS NULL);
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % assignment(s) miss a service-required resource.', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM geniusbot.service_assignments sa
    JOIN geniusbot.clinics c ON c.id = sa.clinic_id
    JOIN geniusbot.branches b ON b.id = sa.branch_id
    JOIN geniusbot.services s ON s.id = sa.service_id
    LEFT JOIN geniusbot.doctors d ON d.id = sa.doctor_id
    LEFT JOIN geniusbot.rooms r ON r.id = sa.room_id
    WHERE sa.is_active
      AND (NOT c.is_active OR NOT b.is_active OR NOT s.is_active
           OR NOT s.is_booking_enabled
           OR (sa.doctor_id IS NOT NULL AND NOT d.is_active)
           OR (sa.room_id IS NOT NULL AND NOT r.is_active));
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % active assignment(s) use inactive or unbookable resources.', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM geniusbot.service_assignments sa
    JOIN geniusbot.services s ON s.id = sa.service_id
    WHERE sa.is_active AND s.requires_doctor
      AND NOT EXISTS (
          SELECT 1
          FROM geniusbot.doctor_working_hours dwh
          WHERE dwh.doctor_id = sa.doctor_id
            AND dwh.branch_id = sa.branch_id
            AND dwh.is_active
      );
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % active doctor assignment(s) have no working hours in the branch.', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM (
        SELECT branch_id, service_id,
               COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid)
        FROM geniusbot.service_assignments
        GROUP BY 1, 2, 3, 4
        HAVING count(*) > 1
    ) duplicates;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % exact duplicate group(s).', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM (
        SELECT clinic_id, branch_id, service_id
        FROM geniusbot.service_assignments
        WHERE is_active AND is_default
        GROUP BY 1, 2, 3
        HAVING count(*) > 1
    ) defaults;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Service assignments preflight failed: % duplicate active default group(s).', v_count;
    END IF;
END;
$preflight$ LANGUAGE plpgsql;

ALTER TABLE geniusbot.service_assignments
    DROP CONSTRAINT IF EXISTS chk_service_assignments_resource;

DROP INDEX IF EXISTS geniusbot.service_assignments_unique_assignment;
DROP INDEX IF EXISTS geniusbot.unique_service_assignment_scope;
DROP INDEX IF EXISTS geniusbot.unique_default_service_assignment;

CREATE UNIQUE INDEX unique_service_assignment_scope
    ON geniusbot.service_assignments (
        clinic_id,
        branch_id,
        service_id,
        COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE UNIQUE INDEX unique_default_service_assignment
    ON geniusbot.service_assignments (clinic_id, branch_id, service_id)
    WHERE is_active AND is_default;

CREATE INDEX IF NOT EXISTS idx_service_assignments_booking_lookup
    ON geniusbot.service_assignments (
        clinic_id, branch_id, service_id, is_default DESC, created_at, id
    )
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_service_assignments_admin_lookup
    ON geniusbot.service_assignments (clinic_id, is_active, branch_id, service_id);

CREATE INDEX IF NOT EXISTS idx_service_assignments_doctor
    ON geniusbot.service_assignments (doctor_id, branch_id, service_id)
    WHERE doctor_id IS NOT NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_service_assignments_room
    ON geniusbot.service_assignments (room_id, branch_id, service_id)
    WHERE room_id IS NOT NULL AND is_active;

CREATE OR REPLACE FUNCTION geniusbot.validate_service_assignment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_clinic_active boolean;
    v_branch_clinic_id uuid;
    v_branch_active boolean;
    v_service_clinic_id uuid;
    v_service_active boolean;
    v_service_booking_enabled boolean;
    v_requires_doctor boolean;
    v_requires_room boolean;
    v_doctor_clinic_id uuid;
    v_doctor_active boolean;
    v_room_clinic_id uuid;
    v_room_branch_id uuid;
    v_room_active boolean;
BEGIN
    SELECT is_active INTO v_clinic_active
    FROM geniusbot.clinics WHERE id = NEW.clinic_id FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_service_assignments_clinic',
            MESSAGE = 'Service assignment clinic does not exist.';
    END IF;

    SELECT clinic_id, is_active INTO v_branch_clinic_id, v_branch_active
    FROM geniusbot.branches WHERE id = NEW.branch_id FOR KEY SHARE;
    IF NOT FOUND OR v_branch_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_branch_scope',
            MESSAGE = 'Service assignment branch is outside the clinic.';
    END IF;

    SELECT clinic_id, is_active, is_booking_enabled, requires_doctor, requires_room
    INTO v_service_clinic_id, v_service_active, v_service_booking_enabled,
         v_requires_doctor, v_requires_room
    FROM geniusbot.services WHERE id = NEW.service_id FOR KEY SHARE;
    IF NOT FOUND OR v_service_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_service_scope',
            MESSAGE = 'Service assignment service is outside the clinic.';
    END IF;

    IF v_requires_doctor AND NEW.doctor_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_doctor_required',
            MESSAGE = 'The selected service requires a doctor.';
    END IF;
    IF v_requires_room AND NEW.room_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_room_required',
            MESSAGE = 'The selected service requires a room.';
    END IF;

    IF NEW.doctor_id IS NOT NULL THEN
        SELECT clinic_id, is_active INTO v_doctor_clinic_id, v_doctor_active
        FROM geniusbot.doctors WHERE id = NEW.doctor_id FOR KEY SHARE;
        IF NOT FOUND OR v_doctor_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_doctor_scope',
                MESSAGE = 'Service assignment doctor is outside the clinic.';
        END IF;
    END IF;

    IF NEW.room_id IS NOT NULL THEN
        SELECT b.clinic_id, r.branch_id, r.is_active
        INTO v_room_clinic_id, v_room_branch_id, v_room_active
        FROM geniusbot.rooms r
        JOIN geniusbot.branches b ON b.id = r.branch_id
        WHERE r.id = NEW.room_id
        FOR KEY SHARE OF r, b;
        IF NOT FOUND OR v_room_clinic_id IS DISTINCT FROM NEW.clinic_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_room_scope',
                MESSAGE = 'Service assignment room is outside the clinic.';
        END IF;
        IF v_room_branch_id IS DISTINCT FROM NEW.branch_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_room_branch',
                MESSAGE = 'Service assignment room is outside the branch.';
        END IF;
    END IF;

    IF NEW.is_active THEN
        IF NOT v_clinic_active THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_clinic_active',
                MESSAGE = 'Active assignments require an active clinic.';
        END IF;
        IF NOT v_branch_active THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_branch_active',
                MESSAGE = 'Active assignments require an active branch.';
        END IF;
        IF NOT v_service_active OR NOT v_service_booking_enabled THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_service_bookable',
                MESSAGE = 'Active assignments require an active bookable service.';
        END IF;
        IF NEW.doctor_id IS NOT NULL AND NOT v_doctor_active THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_doctor_active',
                MESSAGE = 'Active assignments cannot use an inactive doctor.';
        END IF;
        IF NEW.room_id IS NOT NULL AND NOT v_room_active THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_room_active',
                MESSAGE = 'Active assignments cannot use an inactive room.';
        END IF;
        IF v_requires_doctor AND NOT EXISTS (
            SELECT 1 FROM geniusbot.doctor_working_hours dwh
            WHERE dwh.doctor_id = NEW.doctor_id
              AND dwh.branch_id = NEW.branch_id
              AND dwh.is_active
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'chk_service_assignment_doctor_working_branch',
                MESSAGE = 'The doctor has no active working hours in this branch.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_assignments_room_integrity
    ON geniusbot.service_assignments;
DROP TRIGGER IF EXISTS trg_service_assignments_validate_integrity
    ON geniusbot.service_assignments;
CREATE TRIGGER trg_service_assignments_validate_integrity
BEFORE INSERT OR UPDATE ON geniusbot.service_assignments
FOR EACH ROW EXECUTE FUNCTION geniusbot.validate_service_assignment_integrity();

DO $validation$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND indexname = 'unique_service_assignment_scope'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot'
          AND indexname = 'unique_default_service_assignment'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'geniusbot.service_assignments'::regclass
          AND tgname = 'trg_service_assignments_validate_integrity'
          AND NOT tgisinternal
    ) OR to_regprocedure('geniusbot.validate_service_assignment_integrity()') IS NULL THEN
        RAISE EXCEPTION 'Service assignments hardening validation failed.';
    END IF;
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
