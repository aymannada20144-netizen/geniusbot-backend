BEGIN;

DO $$
DECLARE
  updated_count integer;
BEGIN
WITH classification(id, role, concept, qualifier) AS (
  VALUES
    ('00000000-0000-0000-0000-000000003013'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('00000000-0000-0000-0000-000000003011'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000019'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000018'::uuid, 'DISCOVERY', 'UNWANTED_HAIR', NULL),
    ('00000000-0000-0000-0000-000000003009'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('00000000-0000-0000-0000-000000003015'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000016'::uuid, 'DISCOVERY', 'EXPRESSION_LINES', NULL),
    ('bd010000-0000-4000-8000-000000000017'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000015'::uuid, 'DISCOVERY', 'EXPRESSION_LINES', NULL),
    ('bd010000-0000-4000-8000-000000000006'::uuid, 'DISCOVERY', 'ACNE_ACTIVE', NULL),
    ('bd010000-0000-4000-8000-000000000007'::uuid, 'DISCOVERY', 'ACNE_ACTIVE', NULL),
    ('bd010000-0000-4000-8000-000000000008'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000005'::uuid, 'DISCOVERY', 'ACNE_ACTIVE', NULL),
    ('00000000-0000-0000-0000-000000003014'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000014'::uuid, 'DISCOVERY', 'VOLUME_LOSS', NULL),
    ('00000000-0000-0000-0000-000000003012'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000013'::uuid, 'DISCOVERY', 'FACIAL_CONTOUR', NULL),
    ('00000000-0000-0000-0000-000000003010'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000002'::uuid, 'DISCOVERY', 'PIGMENTATION', 'SUN_EXPOSURE'),
    ('bd010000-0000-4000-8000-000000000004'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000003'::uuid, 'DISCOVERY', 'PIGMENTATION', NULL),
    ('bd010000-0000-4000-8000-000000000001'::uuid, 'DISCOVERY', 'PIGMENTATION', NULL),
    ('bd010000-0000-4000-8000-000000000010'::uuid, 'DISCOVERY', 'ACNE_SCARRING', NULL),
    ('bd010000-0000-4000-8000-000000000012'::uuid, 'SERVICE_INFORMATION', NULL, NULL),
    ('bd010000-0000-4000-8000-000000000011'::uuid, 'DISCOVERY', 'SKIN_TEXTURE', NULL),
    ('bd010000-0000-4000-8000-000000000009'::uuid, 'DISCOVERY', 'SKIN_TEXTURE', NULL)
), cleaned AS (
  SELECT kb.id,
         ARRAY(
           SELECT keyword
             FROM unnest(COALESCE(kb.keywords, ARRAY[]::text[])) keyword
            WHERE keyword !~ '^(knowledge_role|concept|qualifier):'
         ) AS human_keywords,
         classification.role,
         classification.concept,
         classification.qualifier
    FROM geniusbot.knowledge_base kb
    JOIN classification ON classification.id = kb.id
)
UPDATE geniusbot.knowledge_base kb
     SET keywords = cleaned.human_keywords
       || ARRAY['knowledge_role:' || cleaned.role]
       || CASE WHEN cleaned.concept IS NULL THEN ARRAY[]::text[]
               ELSE ARRAY['concept:' || cleaned.concept] END
       || CASE WHEN cleaned.qualifier IS NULL THEN ARRAY[]::text[]
               ELSE ARRAY['qualifier:' || cleaned.qualifier] END
    FROM cleaned
   WHERE kb.id = cleaned.id;

GET DIAGNOSTICS updated_count = ROW_COUNT;
IF updated_count <> 26 THEN
  RAISE EXCEPTION 'SB-01 expected 26 Knowledge rows, updated %', updated_count;
END IF;
END
$$;

COMMIT;
