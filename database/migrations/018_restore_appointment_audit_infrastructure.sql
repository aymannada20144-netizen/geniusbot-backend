BEGIN;

CREATE OR REPLACE FUNCTION geniusbot.log_appointment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_changed_by_staff_id uuid;
    v_notes text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO geniusbot.appointment_status_logs (
            appointment_id,
            old_status,
            new_status,
            changed_by_staff_id,
            notes,
            created_at
        )
        VALUES (
            NEW.id,
            NULL,
            NEW.status,
            NULL,
            'Appointment created.',
            pg_catalog.now()
        );

        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    BEGIN
        v_changed_by_staff_id :=
            NULLIF(
                pg_catalog.current_setting(
                    'geniusbot.changed_by_staff_id',
                    true
                ),
                ''
            )::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_changed_by_staff_id := NULL;
    END;

    v_notes :=
        NULLIF(
            pg_catalog.current_setting(
                'geniusbot.status_change_notes',
                true
            ),
            ''
        );

    INSERT INTO geniusbot.appointment_status_logs (
        appointment_id,
        old_status,
        new_status,
        changed_by_staff_id,
        notes,
        created_at
    )
    VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        v_changed_by_staff_id,
        v_notes,
        pg_catalog.now()
    );

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION geniusbot.log_appointment_status_change() IS
    'Creates an immutable audit record when an appointment is created or its status changes.';

DROP TRIGGER IF EXISTS trg_appointments_log_status_insert
    ON geniusbot.appointments;

CREATE TRIGGER trg_appointments_log_status_insert
AFTER INSERT ON geniusbot.appointments
FOR EACH ROW
EXECUTE FUNCTION geniusbot.log_appointment_status_change();

DROP TRIGGER IF EXISTS trg_appointments_log_status_update
    ON geniusbot.appointments;

CREATE TRIGGER trg_appointments_log_status_update
AFTER UPDATE OF status ON geniusbot.appointments
FOR EACH ROW
EXECUTE FUNCTION geniusbot.log_appointment_status_change();

COMMIT;
