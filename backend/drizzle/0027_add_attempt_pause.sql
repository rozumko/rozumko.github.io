-- Migration 0027: timer pause for blackouts (Phase B).
-- Adds accumulated grace-pause seconds and the last heartbeat timestamp to
-- attempts. The server measures the gap between heartbeats and credits capped
-- pause time, so a student cannot fabricate extra time client-side.
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe if columns were added manually.

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS paused_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
