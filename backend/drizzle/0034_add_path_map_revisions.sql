-- Migration 0034: immutable learning-path revisions.
--
-- Static path bundles can remain cached or offline after an administrator
-- saves a newer map. Keep every published revision so client-unverified
-- practice progress is validated against the exact bundle version used by
-- the child instead of being rejected or reinterpreted as current content.

CREATE TABLE public.path_map_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id text NOT NULL REFERENCES public.path_maps(path_id) ON DELETE CASCADE,
  version integer NOT NULL,
  grade integer NOT NULL,
  title text NOT NULL,
  points jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT path_map_revisions_path_version_uq UNIQUE (path_id, version),
  CONSTRAINT path_map_revisions_version_ck CHECK (version >= 1),
  CONSTRAINT path_map_revisions_grade_ck CHECK (grade BETWEEN 1 AND 4)
);

ALTER TABLE public.path_map_revisions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.path_map_revisions (path_id, version, grade, title, points)
SELECT path_id, version, grade, title, points
FROM public.path_maps
ON CONFLICT (path_id, version) DO NOTHING;

ALTER TABLE public.home_path_events
  ADD COLUMN path_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.home_path_events
  ADD CONSTRAINT home_path_events_path_version_ck CHECK (path_version >= 1);
