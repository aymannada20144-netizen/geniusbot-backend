BEGIN;

ALTER TABLE geniusbot.staff
  ADD COLUMN IF NOT EXISTS username VARCHAR(50);

WITH normalized AS (
  SELECT
    id,
    lower(
      trim(
        BOTH '.-' FROM regexp_replace(
          regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]+', '-', 'g'),
          '[._-]+',
          '-',
          'g'
        )
      )
    ) AS candidate
  FROM geniusbot.staff
  WHERE username IS NULL
),
bases AS (
  SELECT
    id,
    CASE
      WHEN length(candidate) BETWEEN 3 AND 50
        THEN candidate
      ELSE 'user'
    END AS base
  FROM normalized
),
ranked AS (
  SELECT
    id,
    base,
    count(*) OVER (PARTITION BY base) AS base_count
  FROM bases
)
UPDATE geniusbot.staff AS staff
SET username = CASE
  WHEN ranked.base_count = 1 THEN ranked.base
  ELSE left(ranked.base, 37) || '-' || left(replace(ranked.id::text, '-', ''), 12)
END
FROM ranked
WHERE staff.id = ranked.id
  AND staff.username IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM geniusbot.staff WHERE username IS NULL) THEN
    RAISE EXCEPTION 'staff username backfill left NULL values';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS staff_username_lower_uidx
  ON geniusbot.staff (lower(username));

ALTER TABLE geniusbot.staff
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE geniusbot.staff
  DROP CONSTRAINT IF EXISTS staff_username_format_check;

ALTER TABLE geniusbot.staff
  ADD CONSTRAINT staff_username_format_check
  CHECK (
    username = lower(username)
    AND username ~ '^[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]$'
  );

COMMIT;
