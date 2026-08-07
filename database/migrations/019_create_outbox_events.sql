BEGIN;

CREATE TABLE IF NOT EXISTS geniusbot.outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz NULL,
    CONSTRAINT chk_outbox_events_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
);

COMMIT;
