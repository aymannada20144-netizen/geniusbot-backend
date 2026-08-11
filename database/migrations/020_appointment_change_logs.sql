BEGIN;

CREATE TABLE IF NOT EXISTS geniusbot.appointment_change_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    operation text NOT NULL,
    change_types text[] NOT NULL,
    before_state jsonb NOT NULL,
    after_state jsonb NOT NULL,
    changed_by_staff_id uuid NULL,
    actor_type text NOT NULL,
    actor_id uuid NULL,
    source text NOT NULL,
    reason text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_appointment_change_logs_appointment
        FOREIGN KEY (appointment_id)
        REFERENCES geniusbot.appointments(id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    CONSTRAINT fk_appointment_change_logs_clinic
        FOREIGN KEY (clinic_id)
        REFERENCES geniusbot.clinics(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_change_logs_staff
        FOREIGN KEY (changed_by_staff_id)
        REFERENCES geniusbot.staff(id)
        ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT chk_appointment_change_logs_operation
        CHECK (operation IN ('cancel', 'reschedule', 'modify')),
    CONSTRAINT chk_appointment_change_logs_change_types
        CHECK (cardinality(change_types) > 0),
    CONSTRAINT chk_appointment_change_logs_before_object
        CHECK (jsonb_typeof(before_state) = 'object'),
    CONSTRAINT chk_appointment_change_logs_after_object
        CHECK (jsonb_typeof(after_state) = 'object'),
    CONSTRAINT chk_appointment_change_logs_actor_type
        CHECK (actor_type IN ('staff', 'patient', 'system')),
    CONSTRAINT chk_appointment_change_logs_source
        CHECK (source IN ('dashboard', 'shaden', 'api', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_change_logs_appointment_created
    ON geniusbot.appointment_change_logs (appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_change_logs_clinic_created
    ON geniusbot.appointment_change_logs (clinic_id, created_at DESC);

COMMIT;
