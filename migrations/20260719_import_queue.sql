-- Migration: import_queue — capacity/spec triage handoff table
-- Date: 2026-07-19
--
-- Context:
--   New Ashurbanipal Triage entries and the A-capacity-planner archive
--   reconciliation both land here for the planner to drain (js/triageQueue.js),
--   replacing the manual "Import candidates…" file-picker step. Same shape as
--   every other store — a JSONB `data` column, not flat columns — so it works
--   with js/db.js's existing generic get/getAll/put/putAll/delete with zero
--   table-specific code (per EXTENSION_MANIFEST.md's "New DB store" row).
--
-- Row shape (data column):
--   {
--     id:             string,   -- same value as the row's `id` column
--     sourceAdapter:  string,   -- 'filesystem' | 'triage'
--     nativeRef:      string,   -- e.g. claude-fs://<name>?path=... , or a Triage route ref
--     contentHash:    string,   -- sha256 of the source file's content — dedup key
--     title:          string,
--     content:        string,   -- full markdown, inlined (specs are small; avoids a
--                                --   second Storage round-trip before a decision is made)
--     extractedDates: { source: 'frontmatter'|'content'|'filename'|'mtime', date: string } | null,
--     folderStage:    string | null,
--     status:         'pending' | 'processed',
--     createdAt:      string,   -- ISO
--     processedAt:    string | null,
--   }
--
-- Apply:
--   Run this file via the Supabase SQL editor (self-host Studio) or `supabase db push`.
--
-- Rollback:
--   DROP TABLE import_queue;

CREATE TABLE import_queue (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    UUID NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent re-scans: a content hash already queued (pending or processed)
-- must not enqueue a second row. Partial-unique on the JSONB path, scoped
-- per user like every RLS policy below.
CREATE UNIQUE INDEX import_queue_content_hash_uniq
  ON import_queue (user_id, (data->>'contentHash'));

ALTER TABLE import_queue ENABLE ROW LEVEL SECURITY;

-- Same per-user policy shape used across every other table. The Mini-side
-- inserter (pipeline/triage/capacity_queue.py) uses the service-role key,
-- which bypasses RLS by design (Supabase/PostgREST convention) and sets
-- user_id explicitly — this app is single-user, so that's the one known id.
-- The browser's authenticated session is the only caller RLS actually gates.
CREATE POLICY "import_queue select own" ON import_queue FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "import_queue insert own" ON import_queue FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "import_queue update own" ON import_queue FOR UPDATE
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "import_queue delete own" ON import_queue FOR DELETE
  TO authenticated USING (user_id = auth.uid());
