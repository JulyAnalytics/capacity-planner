-- Migration: cycles + strategic_sessions — the strategic layer's two stores
-- Date: 2026-07-28
--
-- Context:
--   The strategic layer (ADR-0012, ADR-0013) adds a Cycle above the sprint
--   lattice and a Session recording the planning run that produced it. Every
--   other spec entity dissolves into fields on existing records: EpicCandidate
--   is an EPIC_STATUS (ADR-0011), FocusThesis is an embedded array on the
--   cycle, StrategicTheme is an array on the focus, and Roadmap is a view over
--   story.sprintId — so these two tables are the whole schema cost.
--
--   Same shape as every other store — a JSONB `data` column, not flat columns —
--   so js/db.js's generic get/getAll/put/putAll/delete need zero table-specific
--   code (per EXTENSION_MANIFEST.md's "New DB store" row).
--
-- cycles row shape (data column):
--   {
--     id:            string,        -- same value as the row's `id` column
--     name:          string,        -- "Off Season Prep"
--     startDate:     string,        -- ISO yyyy-mm-dd
--     endDate:       string,        -- ISO yyyy-mm-dd
--     status:        'planning' | 'active' | 'closed',
--     thesis:        string,
--     endState:      string[],      -- observable conditions at close
--     constraints:   string[],
--     nonGoals:      string[],      -- what this cycle explicitly excludes
--     killCriterion: string,        -- dated, binary, observable
--     focuses: [{                   -- the spec's FocusThesis, embedded
--       focusId, rank, targetPct, classification, strategicRole,
--       thesis, endState, nonGoals, themeIds: string[], status
--     }],
--     closedSnapshot: {             -- written once, at close; see ADR-0012
--       sprintIds: string[], epicIds: string[],
--       focusActualPct: { [focusId]: number }, closedAt: string
--     } | null,
--     attachments:   [...],         -- the cycle free-write .md (pointer objects)
--     createdAt:     string,
--     updatedAt:     string
--   }
--
-- strategic_sessions row shape (data column):
--   {
--     id:              string,
--     cycleId:         string,
--     kind:            'full' | 'recut' | 'backfill',
--     parentSessionId: string | null,   -- set for 'recut'
--     status:          'active' | 'committed',
--     startedAt:       string,
--     committedAt:     string | null,
--     rituals:         { [ritualId]: { status, completedAt, attachmentId } },
--     proposedRoadmap: [{ epicId, sprintId, order }],
--     dependencies:    [{ epicId, requiresEpicId?, requiresEvent? }],
--     adjustments:     [{ epicId, direction, reason, at }],
--     ledger:          [{ candidateId, epicId, focusId, wsjf, sprintSlot, targetPct }]
--   }
--
--   'backfill' marks a session reconstructed from the Obsidian corpus rather
--   than run in the app, so the outcome funnel never claims in-app provenance
--   for work that predates the feature.
--
-- Note: NO uniqueness index on cycle dates. The "cycles never overlap"
-- invariant is enforced in js/strategyModel.validateCycle, not in SQL — an
-- exclusion constraint over a JSONB date range would need a btree_gist index on
-- expressions and could not express the shared-boundary tolerance that
-- validateLocationPeriod already establishes for the analogous case.
--
-- Apply:
--   Run this file via the Supabase SQL editor (self-host Studio) or `supabase db push`.
--   NOTE: migrations/20260719_import_queue.sql is still unapplied as of this date
--   (docs/architecture/STATE.md) — apply both in the same session.
--
-- Rollback:
--   DROP TABLE strategic_sessions; DROP TABLE cycles;

CREATE TABLE cycles (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    UUID NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cycles select own" ON cycles FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cycles insert own" ON cycles FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "cycles update own" ON cycles FOR UPDATE
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cycles delete own" ON cycles FOR DELETE
  TO authenticated USING (user_id = auth.uid());

CREATE TABLE strategic_sessions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    UUID NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strategic_sessions_cycle_idx
  ON strategic_sessions (user_id, (data->>'cycleId'));

ALTER TABLE strategic_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategic_sessions select own" ON strategic_sessions FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "strategic_sessions insert own" ON strategic_sessions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "strategic_sessions update own" ON strategic_sessions FOR UPDATE
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "strategic_sessions delete own" ON strategic_sessions FOR DELETE
  TO authenticated USING (user_id = auth.uid());
