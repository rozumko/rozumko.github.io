-- Migration 0038: admin-authored question-set missions with immutable history.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS edit_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS published_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS published_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_status_check;
UPDATE public.missions SET status = 'published' WHERE status = 'active';
ALTER TABLE public.missions ADD CONSTRAINT missions_status_check
  CHECK (status IN ('draft', 'review', 'published', 'archived'));
ALTER TABLE public.missions ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_edit_version_check;
ALTER TABLE public.missions ADD CONSTRAINT missions_edit_version_check CHECK (edit_version >= 1);
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_published_version_check;
ALTER TABLE public.missions ADD CONSTRAINT missions_published_version_check
  CHECK (published_version IS NULL OR published_version >= 1);

UPDATE public.missions
SET
  published_version = version,
  published_snapshot = jsonb_build_object(
    'id', id, 'title', title, 'kind', kind, 'track', track,
    'grade', grade, 'version', version, 'config', config
  ),
  published_at = COALESCE(published_at, updated_at, created_at, now())
WHERE status = 'published' AND published_version IS NULL;

CREATE TABLE IF NOT EXISTS public.mission_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  edit_version integer NOT NULL,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_revisions_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT mission_revisions_action_check
    CHECK (action IN ('create', 'update', 'status', 'restore', 'backfill')),
  CONSTRAINT mission_revisions_mission_edit_version_uq UNIQUE (mission_id, edit_version)
);

INSERT INTO public.mission_revisions
  (mission_id, edit_version, action, snapshot, changed_by, created_at)
SELECT id, edit_version, 'backfill', to_jsonb(missions), updated_by,
  COALESCE(updated_at, created_at, now())
FROM public.missions
ON CONFLICT (mission_id, edit_version) DO NOTHING;

CREATE INDEX IF NOT EXISTS mission_revisions_mission_created_idx
  ON public.mission_revisions (mission_id, created_at DESC);
ALTER TABLE public.mission_revisions ENABLE ROW LEVEL SECURITY;
