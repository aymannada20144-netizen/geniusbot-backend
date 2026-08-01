BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot' AND tablename = 'patients'
          AND indexname = 'uq_patients_clinic_normalized_phone'
    ) THEN
        RAISE EXCEPTION 'Normalized patient phone uniqueness is missing.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE confrelid = 'geniusbot.patients'::regclass
          AND confdeltype <> 'r'
    ) THEN
        RAISE EXCEPTION 'A patient relationship still permits cascade or nullification.';
    END IF;
END;
$$;

SAVEPOINT lifecycle_data;

DO $$
DECLARE
    v_clinic uuid;
    v_patient uuid;
BEGIN
    SELECT id INTO v_clinic FROM geniusbot.clinics ORDER BY created_at LIMIT 1;
    INSERT INTO geniusbot.patients (
        clinic_id, full_name, phone_number, source, is_active
    ) VALUES (
        v_clinic, 'Lifecycle Test', '+966599999991', 'unknown', false
    ) RETURNING id INTO v_patient;

    UPDATE geniusbot.patients SET is_active = true WHERE id = v_patient;
    IF NOT EXISTS (
        SELECT 1 FROM geniusbot.patients
        WHERE id = v_patient AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Reactivation did not preserve the patient ID.';
    END IF;

    BEGIN
        INSERT INTO geniusbot.patients (
            clinic_id, full_name, phone_number, source, is_active
        ) VALUES (
            v_clinic, 'Duplicate Lifecycle Test', '05 9999 9991', 'unknown', true
        );
        RAISE EXCEPTION 'Duplicate normalized phone was accepted.';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    DELETE FROM geniusbot.patients WHERE id = v_patient;
    IF EXISTS (SELECT 1 FROM geniusbot.patients WHERE id = v_patient) THEN
        RAISE EXCEPTION 'Unused patient was not deleted.';
    END IF;
END;
$$;

ROLLBACK TO SAVEPOINT lifecycle_data;
ROLLBACK;
