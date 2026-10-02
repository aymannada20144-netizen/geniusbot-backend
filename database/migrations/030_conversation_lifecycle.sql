BEGIN;

ALTER TABLE geniusbot.conversations
  ADD COLUMN IF NOT EXISTS channel_identity text,
  ADD COLUMN IF NOT EXISTS last_customer_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason varchar(32);

-- Existing conversations stored their canonical WhatsApp identity in state.
UPDATE geniusbot.conversations
SET channel_identity = NULLIF(btrim(state_payload ->> 'channelIdentity'), '')
WHERE channel_identity IS NULL;

-- Preserve history and use the same timestamp semantic as message persistence.
UPDATE geniusbot.conversations c
SET last_customer_activity_at = COALESCE((
  SELECT max(m.created_at)
  FROM geniusbot.messages m
  WHERE m.conversation_id = c.id
    AND m.sender_type = 'patient'
), c.started_at)
WHERE c.last_customer_activity_at IS NULL;

-- A partial unique index requires legacy duplicate open identities to be
-- reconciled without deletion. The newest remains operational; older history
-- remains closed and queryable.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY clinic_id, channel, channel_identity
      ORDER BY started_at DESC, id DESC
    ) AS position
  FROM geniusbot.conversations
  WHERE status = 'open' AND channel_identity IS NOT NULL
)
UPDATE geniusbot.conversations c
SET status = 'closed',
    ended_at = COALESCE(c.ended_at, NOW()),
    closed_reason = 'inactivity_timeout'
FROM ranked
WHERE c.id = ranked.id AND ranked.position > 1;

ALTER TABLE geniusbot.conversations
  DROP CONSTRAINT IF EXISTS chk_conversations_status,
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE geniusbot.conversations
  ADD CONSTRAINT chk_conversations_status
  CHECK (status IN ('open', 'closed', 'archived'));

ALTER TABLE geniusbot.conversations
  DROP CONSTRAINT IF EXISTS chk_conversations_closed_reason;

ALTER TABLE geniusbot.conversations
  ADD CONSTRAINT chk_conversations_closed_reason
  CHECK (
    closed_reason IS NULL
    OR closed_reason IN ('inactivity_timeout', 'operator_close')
  );

CREATE INDEX IF NOT EXISTS idx_conversations_channel_identity_lookup
  ON geniusbot.conversations (clinic_id, channel, channel_identity, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_open_channel_identity
  ON geniusbot.conversations (clinic_id, channel, channel_identity)
  WHERE status = 'open' AND channel_identity IS NOT NULL;

CREATE OR REPLACE FUNCTION geniusbot.touch_customer_conversation_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sender_type = 'patient' THEN
    UPDATE geniusbot.conversations
    SET last_customer_activity_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_customer_conversation_activity ON geniusbot.messages;
CREATE TRIGGER trg_messages_customer_conversation_activity
AFTER INSERT ON geniusbot.messages
FOR EACH ROW
EXECUTE FUNCTION geniusbot.touch_customer_conversation_activity();

COMMIT;
