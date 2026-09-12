BEGIN;

-- One delivery receipt per existing domain event; no duplicate appointment event.
CREATE TABLE IF NOT EXISTS geniusbot.appointment_change_deliveries (
  outbox_event_id uuid PRIMARY KEY REFERENCES geniusbot.outbox_events(id),
  status text NOT NULL CHECK (status IN ('processing', 'sent', 'failed', 'uncertain')),
  attempts integer NOT NULL DEFAULT 1,
  retryable boolean NOT NULL DEFAULT false,
  retry_at timestamptz,
  wamid text,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'sent' OR wamid IS NOT NULL)
);

COMMIT;
