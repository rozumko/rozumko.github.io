-- Migration 0015: Home Mode slice 1 (parent lead + consent + demo attempt/report).
-- Contract: docs/home-demo-contract.md. Child data exists only under a parent
-- lead created with explicit consent. No linkage to school sessions or their
-- tokens. Raw demo telemetry is stored as jsonb; trusted scoring happens on the
-- backend at submission time. Idempotent (CREATE TABLE IF NOT EXISTS) to match
-- the hand-written migration history.

CREATE TABLE IF NOT EXISTS public.home_leads (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_email"           text NOT NULL,
  "consent_policy_version" text NOT NULL,
  "consent_accepted_at"    timestamptz NOT NULL,
  "created_at"             timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_child_profiles (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id"      uuid NOT NULL REFERENCES public.home_leads("id") ON DELETE CASCADE,
  "display_name" text,
  "grade"        integer NOT NULL,
  "created_at"   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_demo_attempts (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "child_profile_id"   uuid NOT NULL REFERENCES public.home_child_profiles("id") ON DELETE CASCADE,
  "mission_id"         text NOT NULL,
  "mission_version"    integer NOT NULL,
  "track"              text NOT NULL,
  "grade"              integer NOT NULL,
  "events"             jsonb NOT NULL,
  "client_started_at"  timestamptz,
  "client_finished_at" timestamptz,
  "created_at"         timestamptz DEFAULT now(),
  CONSTRAINT "home_demo_attempts_profile_mission_uq" UNIQUE ("child_profile_id", "mission_id")
);

CREATE TABLE IF NOT EXISTS public.home_demo_reports (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "attempt_id"     uuid NOT NULL REFERENCES public.home_demo_attempts("id") ON DELETE CASCADE,
  "report"         jsonb NOT NULL,
  "report_version" integer NOT NULL DEFAULT 1,
  "created_at"     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "home_child_profiles_lead_id_idx" ON public.home_child_profiles ("lead_id");
CREATE INDEX IF NOT EXISTS "home_demo_attempts_child_profile_id_idx" ON public.home_demo_attempts ("child_profile_id");
CREATE INDEX IF NOT EXISTS "home_demo_reports_attempt_id_idx" ON public.home_demo_reports ("attempt_id");

ALTER TABLE public.home_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_demo_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_demo_reports ENABLE ROW LEVEL SECURITY;
