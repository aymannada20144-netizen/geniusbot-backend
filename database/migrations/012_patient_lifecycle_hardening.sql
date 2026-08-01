BEGIN;

CREATE TEMP TABLE patient_lifecycle_migration_context AS
SELECT COUNT(*)::bigint AS before_count FROM geniusbot.patients;

DO $$
DECLARE
    v_before bigint;
BEGIN
    SELECT COUNT(*) INTO v_before FROM geniusbot.patients;
    RAISE NOTICE 'Patient lifecycle preflight: patients=%', v_before;

    IF EXISTS (
        SELECT 1
        FROM geniusbot.patients
        GROUP BY clinic_id,
            CASE
                WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^009665[0-9]{8}$'
                    THEN substring(regexp_replace(phone_number, '\D', '', 'g') FROM 3)
                WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^05[0-9]{8}$'
                    THEN '966' || substring(regexp_replace(phone_number, '\D', '', 'g') FROM 2)
                WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^5[0-9]{8}$'
                    THEN '966' || regexp_replace(phone_number, '\D', '', 'g')
                WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^9665[0-9]{8}$'
                    THEN regexp_replace(phone_number, '\D', '', 'g')
                ELSE NULL
            END
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Patient lifecycle migration stopped: duplicate normalized phones exist within a clinic.';
    END IF;

    IF EXISTS (SELECT 1 FROM geniusbot.patients WHERE is_active IS NULL) THEN
        RAISE EXCEPTION 'Patient lifecycle migration stopped: invalid activity value exists.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX uq_patients_clinic_normalized_phone
ON geniusbot.patients (
    clinic_id,
    (
        CASE
            WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^009665[0-9]{8}$'
                THEN substring(regexp_replace(phone_number, '\D', '', 'g') FROM 3)
            WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^05[0-9]{8}$'
                THEN '966' || substring(regexp_replace(phone_number, '\D', '', 'g') FROM 2)
            WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^5[0-9]{8}$'
                THEN '966' || regexp_replace(phone_number, '\D', '', 'g')
            WHEN regexp_replace(phone_number, '\D', '', 'g') ~ '^9665[0-9]{8}$'
                THEN regexp_replace(phone_number, '\D', '', 'g')
            ELSE NULL
        END
    )
);

ALTER TABLE geniusbot.booking_abandonments DROP CONSTRAINT booking_abandonments_patient_id_fkey,
    ADD CONSTRAINT booking_abandonments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.conversations DROP CONSTRAINT conversations_patient_id_fkey,
    ADD CONSTRAINT conversations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.missed_calls DROP CONSTRAINT missed_calls_patient_id_fkey,
    ADD CONSTRAINT missed_calls_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.notification_logs DROP CONSTRAINT notification_logs_patient_id_fkey,
    ADD CONSTRAINT notification_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.opportunity_events DROP CONSTRAINT opportunity_events_patient_id_fkey,
    ADD CONSTRAINT opportunity_events_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.patient_activity_logs DROP CONSTRAINT patient_activity_logs_patient_id_fkey,
    ADD CONSTRAINT patient_activity_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.reactivation_targets DROP CONSTRAINT reactivation_targets_patient_id_fkey,
    ADD CONSTRAINT reactivation_targets_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.recovery_attempts DROP CONSTRAINT recovery_attempts_patient_id_fkey,
    ADD CONSTRAINT recovery_attempts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.revenue_conversions DROP CONSTRAINT revenue_conversions_patient_id_fkey,
    ADD CONSTRAINT revenue_conversions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.revenue_opportunities DROP CONSTRAINT revenue_opportunities_patient_id_fkey,
    ADD CONSTRAINT revenue_opportunities_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;
ALTER TABLE geniusbot.waitlist DROP CONSTRAINT waitlist_patient_id_fkey,
    ADD CONSTRAINT waitlist_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES geniusbot.patients(id) ON DELETE RESTRICT;

DO $$
DECLARE
    v_after bigint;
BEGIN
    SELECT COUNT(*) INTO v_after FROM geniusbot.patients;
    IF v_after <> (SELECT before_count FROM patient_lifecycle_migration_context) THEN
        RAISE EXCEPTION 'Patient lifecycle row-count verification failed.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE confrelid = 'geniusbot.patients'::regclass
          AND confdeltype <> 'r'
    ) THEN
        RAISE EXCEPTION 'Patient lifecycle verification failed: a patient FK still permits destructive delete behavior.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'geniusbot' AND tablename = 'patients'
          AND indexname = 'uq_patients_clinic_normalized_phone'
    ) THEN
        RAISE EXCEPTION 'Patient lifecycle verification failed: normalized phone index is missing.';
    END IF;
END;
$$;

COMMIT;
