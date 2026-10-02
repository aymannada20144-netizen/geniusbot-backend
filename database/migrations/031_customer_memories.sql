BEGIN;

CREATE TABLE IF NOT EXISTS geniusbot.customer_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES geniusbot.clinics(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES geniusbot.patients(id) ON DELETE RESTRICT,
  memory_key text NOT NULL,
  memory_type text NOT NULL,
  value_json jsonb NOT NULL,
  source_conversation_id uuid REFERENCES geniusbot.conversations(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES geniusbot.messages(id) ON DELETE SET NULL,
  evidence_level text NOT NULL DEFAULT 'structured',
  first_observed_at timestamptz NOT NULL DEFAULT NOW(),
  last_confirmed_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  active boolean NOT NULL DEFAULT true,
  CHECK (btrim(memory_key) <> ''),
  CHECK (btrim(memory_type) <> ''),
  CHECK (evidence_level IN ('patient_record', 'structured', 'contextual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_memories_active_key
  ON geniusbot.customer_memories (clinic_id, patient_id, memory_key)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_customer_memories_patient_active_recency
  ON geniusbot.customer_memories (clinic_id, patient_id, last_confirmed_at DESC)
  WHERE active = true;

COMMIT;
