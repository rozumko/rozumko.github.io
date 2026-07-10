-- Migration 0031: server persistence for Home learning-path progress.
-- Browser results remain client-unverified practice evidence. They never
-- become official scores, trusted reports or diploma authority.

CREATE TABLE public.home_path_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id uuid NOT NULL REFERENCES public.home_child_profiles(id) ON DELETE CASCADE,
  path_id text NOT NULL,
  point_id text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  best_stars integer NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  last_completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_path_progress_status_ck CHECK (status = 'completed'),
  CONSTRAINT home_path_progress_stars_ck CHECK (best_stars BETWEEN 0 AND 3),
  CONSTRAINT home_path_progress_attempts_ck CHECK (attempts >= 1),
  CONSTRAINT home_path_progress_profile_path_point_uq UNIQUE (child_profile_id, path_id, point_id)
);

CREATE TABLE public.home_path_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id uuid NOT NULL REFERENCES public.home_child_profiles(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  path_id text NOT NULL,
  point_id text NOT NULL,
  activity_results jsonb NOT NULL,
  trust text NOT NULL DEFAULT 'client-unverified',
  client_completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_path_events_trust_ck CHECK (trust = 'client-unverified'),
  CONSTRAINT home_path_events_profile_event_key_uq UNIQUE (child_profile_id, event_key)
);

CREATE INDEX home_path_progress_profile_path_idx
  ON public.home_path_progress (child_profile_id, path_id);

CREATE INDEX home_path_events_profile_path_idx
  ON public.home_path_events (child_profile_id, path_id, created_at DESC);

ALTER TABLE public.home_path_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_path_events ENABLE ROW LEVEL SECURITY;
