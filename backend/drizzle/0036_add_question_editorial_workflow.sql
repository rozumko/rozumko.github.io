-- Migration 0036: auditable editorial workflow for the question bank.
-- Existing content is already live, so it is backfilled as published. New
-- questions default to draft and only published rows may reach child surfaces.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "img" text,
  ADD COLUMN IF NOT EXISTS "image_alt" text,
  ADD COLUMN IF NOT EXISTS "edit_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "editorial_status" text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "created_by" text,
  ADD COLUMN IF NOT EXISTS "updated_by" text,
  ADD COLUMN IF NOT EXISTS "reviewed_by" text,
  ADD COLUMN IF NOT EXISTS "published_by" text,
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "published_at" timestamptz;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_editorial_status_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_editorial_status_check
  CHECK (editorial_status IN ('draft', 'review', 'published', 'archived'));
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_edit_version_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_edit_version_check CHECK (edit_version >= 1);

ALTER TABLE public.questions ALTER COLUMN editorial_status SET DEFAULT 'draft';
UPDATE public.questions
SET published_at = COALESCE(published_at, updated_at, created_at, now())
WHERE editorial_status = 'published' AND published_at IS NULL;

CREATE TABLE IF NOT EXISTS public.question_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  edit_version integer NOT NULL,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_revisions_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT question_revisions_action_check
    CHECK (action IN ('create', 'update', 'status', 'restore', 'backfill')),
  CONSTRAINT question_revisions_question_edit_version_uq
    UNIQUE (question_id, edit_version)
);

INSERT INTO public.question_revisions
  (question_id, edit_version, action, snapshot, changed_by, created_at)
SELECT
  q.id,
  q.edit_version,
  'backfill',
  to_jsonb(q),
  q.updated_by,
  COALESCE(q.updated_at, q.created_at, now())
FROM public.questions q
ON CONFLICT (question_id, edit_version) DO NOTHING;

CREATE INDEX IF NOT EXISTS questions_editorial_status_updated_idx
  ON public.questions (editorial_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS question_revisions_question_created_idx
  ON public.question_revisions (question_id, created_at DESC);

ALTER TABLE public.question_revisions ENABLE ROW LEVEL SECURITY;
