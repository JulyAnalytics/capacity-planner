-- Migration: R07 — Enforce epicId NOT NULL on stories table
-- Date: 2026-04-14
--
-- Context:
--   Stories are stored as a JSONB `data` column. The epicId field lives at
--   data->>'epicId', not as a top-level column. A column-level NOT NULL is
--   therefore inapplicable; this CHECK constraint is the Supabase equivalent.
--
-- Pre-flight: run the query below BEFORE applying the constraint.
-- If it returns > 0, stop. Identify and remediate those records first
-- (backfill epicId or delete orphaned rows). The constraint will fail
-- if any existing row has a null or missing epicId.
--
--   SELECT id, data->>'epicId' AS epic_id
--   FROM stories
--   WHERE (data->>'epicId') IS NULL;
--
-- Apply:
--   Run this file via the Supabase SQL editor or `supabase db push`.
--
-- Rollback:
--   ALTER TABLE stories DROP CONSTRAINT stories_epic_id_not_null;

-- Step 1: confirm zero null-epicId rows (informational — does not block)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO null_count
    FROM stories
   WHERE (data->>'epicId') IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Pre-flight failed: % story row(s) have null epicId. Remediate before applying constraint.',
      null_count;
  END IF;
END $$;

-- Step 2: add the constraint
ALTER TABLE stories
  ADD CONSTRAINT stories_epic_id_not_null
  CHECK ((data->>'epicId') IS NOT NULL);
