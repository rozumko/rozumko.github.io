-- Migration 0019: Club practice mission attempts (paid Home content).
-- Unlike demo attempts these are repeatable: no UNIQUE(profile, mission).
-- Access is decided by the backend entitlement gate (hasHomeAccess) BEFORE
-- any row is written; entitlement state never changes how answers are scored
-- (docs/security-model.md). Raw events keep the same telemetry contract as
-- the demo (docs/home-demo-contract.md); the server-built report is stored
-- inline with its version plus the correct/total aggregate for progress lists.

CREATE TABLE IF NOT EXISTS public.home_mission_attempts (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "child_profile_id"   uuid NOT NULL REFERENCES public.home_child_profiles("id") ON DELETE CASCADE,
  "mission_id"         text NOT NULL,
  "mission_version"    integer NOT NULL,
  "track"              text NOT NULL,
  "grade"              integer NOT NULL,
  "events"             jsonb NOT NULL,
  "report"             jsonb NOT NULL,
  "report_version"     integer NOT NULL DEFAULT 1,
  "correct"            integer NOT NULL,
  "total"              integer NOT NULL,
  "client_started_at"  timestamptz,
  "client_finished_at" timestamptz,
  "created_at"         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "home_mission_attempts_child_profile_id_idx"
  ON public.home_mission_attempts ("child_profile_id");

ALTER TABLE public.home_mission_attempts ENABLE ROW LEVEL SECURITY;
