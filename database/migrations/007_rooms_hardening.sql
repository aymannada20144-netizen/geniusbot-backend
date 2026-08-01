BEGIN;

LOCK TABLE geniusbot.rooms IN SHARE ROW EXCLUSIVE MODE;

DO $validation$
DECLARE
    v_unknown_values text;
BEGIN
    SELECT string_agg(DISTINCT quote_nullable(room_type), ', ' ORDER BY quote_nullable(room_type))
      INTO v_unknown_values
      FROM geniusbot.rooms
     WHERE room_type IS NULL
        OR room_type NOT IN (
            'Consultation',
            'consultation',
            'Laser',
            'laser',
            'ليزر',
            'Peeling',
            'peeling',
            'Injection',
            'injection',
            'skin_care'
        );

    IF v_unknown_values IS NOT NULL THEN
        RAISE EXCEPTION
            'Rooms migration aborted: unmapped room_type values found: %',
            v_unknown_values;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM geniusbot.rooms
         WHERE btrim(room_number) = ''
            OR room_name IS NULL
            OR btrim(room_name) = ''
    ) THEN
        RAISE EXCEPTION
            'Rooms migration aborted: room_number and room_name must contain non-whitespace values.';
    END IF;
END;
$validation$ LANGUAGE plpgsql;

DO $integrity$
DECLARE
    v_invalid_assignments text;
    v_invalid_appointments text;
BEGIN
    SELECT string_agg(sa.id::text, ', ' ORDER BY sa.id::text)
      INTO v_invalid_assignments
      FROM geniusbot.service_assignments AS sa
      JOIN geniusbot.rooms AS r ON r.id = sa.room_id
     WHERE sa.room_id IS NOT NULL
       AND (
           r.branch_id <> sa.branch_id
           OR (sa.is_active IS TRUE AND r.is_active IS NOT TRUE)
       );

    IF v_invalid_assignments IS NOT NULL THEN
        RAISE EXCEPTION
            'Rooms migration aborted: inconsistent service assignment IDs: %',
            v_invalid_assignments;
    END IF;

    SELECT string_agg(a.id::text, ', ' ORDER BY a.id::text)
      INTO v_invalid_appointments
      FROM geniusbot.appointments AS a
      JOIN geniusbot.rooms AS r ON r.id = a.room_id
     WHERE a.room_id IS NOT NULL
       AND a.status IN ('pending', 'confirmed')
       AND (
           r.branch_id <> a.branch_id
           OR r.is_active IS NOT TRUE
       );

    IF v_invalid_appointments IS NOT NULL THEN
        RAISE EXCEPTION
            'Rooms migration aborted: inconsistent active appointment IDs: %',
            v_invalid_appointments;
    END IF;
END;
$integrity$ LANGUAGE plpgsql;

UPDATE geniusbot.rooms
   SET room_number = btrim(room_number),
       room_name = btrim(room_name),
       room_type = CASE room_type
           WHEN 'Consultation' THEN 'consultation'
           WHEN 'consultation' THEN 'consultation'
           WHEN 'Laser' THEN 'laser'
           WHEN 'laser' THEN 'laser'
           WHEN 'ليزر' THEN 'laser'
           WHEN 'Peeling' THEN 'peeling'
           WHEN 'peeling' THEN 'peeling'
           WHEN 'Injection' THEN 'injection'
           WHEN 'injection' THEN 'injection'
           WHEN 'skin_care' THEN 'skin_care'
       END;

ALTER TABLE geniusbot.rooms
    ALTER COLUMN room_name SET NOT NULL,
    ALTER COLUMN room_type SET NOT NULL;

ALTER TABLE geniusbot.rooms
    DROP CONSTRAINT IF EXISTS chk_rooms_room_number_not_blank,
    DROP CONSTRAINT IF EXISTS chk_rooms_room_name_not_blank,
    DROP CONSTRAINT IF EXISTS chk_rooms_room_type;

ALTER TABLE geniusbot.rooms
    ADD CONSTRAINT chk_rooms_room_number_not_blank
        CHECK (btrim(room_number) <> ''),
    ADD CONSTRAINT chk_rooms_room_name_not_blank
        CHECK (btrim(room_name) <> ''),
    ADD CONSTRAINT chk_rooms_room_type
        CHECK (
            room_type IN (
                'consultation',
                'laser',
                'peeling',
                'injection',
                'skin_care'
            )
        );

ALTER TABLE geniusbot.rooms
    DROP CONSTRAINT IF EXISTS rooms_branch_id_fkey;

ALTER TABLE geniusbot.rooms
    ADD CONSTRAINT rooms_branch_id_fkey
        FOREIGN KEY (branch_id)
        REFERENCES geniusbot.branches(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;

ALTER TABLE geniusbot.room_time_off
    DROP CONSTRAINT IF EXISTS room_time_off_room_id_fkey;

ALTER TABLE geniusbot.room_time_off
    ADD CONSTRAINT room_time_off_room_id_fkey
        FOREIGN KEY (room_id)
        REFERENCES geniusbot.rooms(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION geniusbot.enforce_room_branch_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_room_branch_id uuid;
    v_room_active boolean;
BEGIN
    IF NEW.room_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT branch_id, is_active
      INTO v_room_branch_id, v_room_active
      FROM geniusbot.rooms
     WHERE id = NEW.room_id;

    IF v_room_branch_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_room_branch_id <> NEW.branch_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                CONSTRAINT = CASE TG_TABLE_NAME
                    WHEN 'service_assignments' THEN 'chk_service_assignment_room_branch'
                    ELSE 'chk_appointment_room_branch'
                END,
                MESSAGE = 'Room branch does not match the record branch.';
    END IF;

    IF v_room_active IS NOT TRUE THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                CONSTRAINT = CASE TG_TABLE_NAME
                    WHEN 'service_assignments' THEN 'chk_service_assignment_room_active'
                    ELSE 'chk_appointment_room_active'
                END,
                MESSAGE = 'Inactive rooms cannot be used.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_assignments_room_integrity
    ON geniusbot.service_assignments;

CREATE TRIGGER trg_service_assignments_room_integrity
BEFORE INSERT OR UPDATE
ON geniusbot.service_assignments
FOR EACH ROW
WHEN (NEW.room_id IS NOT NULL)
EXECUTE FUNCTION geniusbot.enforce_room_branch_integrity();

DROP TRIGGER IF EXISTS trg_appointments_room_integrity
    ON geniusbot.appointments;

CREATE TRIGGER trg_appointments_room_integrity
BEFORE INSERT OR UPDATE
ON geniusbot.appointments
FOR EACH ROW
WHEN (
    NEW.room_id IS NOT NULL
    AND NEW.status IN ('pending', 'confirmed')
)
EXECUTE FUNCTION geniusbot.enforce_room_branch_integrity();

DO $validation$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM geniusbot.rooms
         WHERE room_type NOT IN (
             'consultation',
             'laser',
             'peeling',
             'injection',
             'skin_care'
         )
            OR room_type IS NULL
    ) THEN
        RAISE EXCEPTION
            'Rooms migration validation failed: room_type normalization is incomplete.';
    END IF;
END;
$validation$ LANGUAGE plpgsql;

COMMIT;
