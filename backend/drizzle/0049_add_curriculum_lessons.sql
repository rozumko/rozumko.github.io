-- Migration 0049: Lesson Engine editorial storage (docs/lesson-engine/README.md, stage C).
-- One row per logical curriculum lesson. draft_content is the full
-- LessonDefinitionV1 being edited (server-only answer keys included);
-- published_snapshot is the last published definition, which runs and exports
-- read. Editing a published lesson changes only the draft; the snapshot moves
-- only on the next publish. Additive: no existing table is touched (ADR-0008).

CREATE TABLE IF NOT EXISTS public.curriculum_lessons (
  id text PRIMARY KEY,
  subject_pack_id text NOT NULL,
  subject text NOT NULL,
  grade integer NOT NULL,
  module_id text,
  lesson_number integer,
  title text NOT NULL,
  schema_version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  edit_version integer NOT NULL DEFAULT 1,
  content_version integer NOT NULL DEFAULT 1,
  published_version integer,
  draft_content jsonb NOT NULL,
  published_snapshot jsonb,
  created_by text,
  updated_by text,
  reviewed_by text,
  published_by text,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_lessons_id_check CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT curriculum_lessons_pack_check CHECK (subject_pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT curriculum_lessons_grade_check CHECK (grade BETWEEN 0 AND 12),
  CONSTRAINT curriculum_lessons_schema_version_check CHECK (schema_version = 1),
  CONSTRAINT curriculum_lessons_status_check
    CHECK (status IN ('draft', 'review', 'published', 'archived')),
  CONSTRAINT curriculum_lessons_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT curriculum_lessons_content_version_check CHECK (content_version >= 1),
  CONSTRAINT curriculum_lessons_published_pair_check
    CHECK ((published_version IS NULL) = (published_snapshot IS NULL)),
  CONSTRAINT curriculum_lessons_published_version_check
    CHECK (published_version IS NULL OR (published_version >= 1 AND published_version <= content_version)),
  CONSTRAINT curriculum_lessons_published_status_check
    CHECK (status <> 'published' OR published_version = content_version)
);

CREATE INDEX IF NOT EXISTS curriculum_lessons_pack_grade_idx
  ON public.curriculum_lessons (subject_pack_id, grade, module_id, lesson_number);

ALTER TABLE public.curriculum_lessons ENABLE ROW LEVEL SECURITY;

-- A published version is immutable: the snapshot may change only together
-- with a strictly newer published_version, and a version is never unpublished.
CREATE OR REPLACE FUNCTION public.curriculum_lessons_guard_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.published_version IS NOT NULL THEN
    IF NEW.published_version IS NULL OR NEW.published_version < OLD.published_version THEN
      RAISE EXCEPTION 'curriculum lesson % cannot lose published version %', OLD.id, OLD.published_version;
    END IF;
    IF NEW.published_version = OLD.published_version
       AND NEW.published_snapshot IS DISTINCT FROM OLD.published_snapshot THEN
      RAISE EXCEPTION 'published version % of curriculum lesson % is immutable', OLD.published_version, OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS curriculum_lessons_guard_published ON public.curriculum_lessons;
CREATE TRIGGER curriculum_lessons_guard_published
  BEFORE UPDATE ON public.curriculum_lessons
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_lessons_guard_published();

CREATE TABLE IF NOT EXISTS public.curriculum_lesson_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, not CASCADE: editorial history outlives any attempt to delete a lesson.
  lesson_id text NOT NULL REFERENCES public.curriculum_lessons(id) ON DELETE RESTRICT,
  edit_version integer NOT NULL,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_lesson_revisions_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT curriculum_lesson_revisions_action_check
    CHECK (action IN ('create', 'update', 'status', 'restore')),
  CONSTRAINT curriculum_lesson_revisions_lesson_edit_version_uq UNIQUE (lesson_id, edit_version)
);

CREATE INDEX IF NOT EXISTS curriculum_lesson_revisions_lesson_created_idx
  ON public.curriculum_lesson_revisions (lesson_id, created_at DESC);

ALTER TABLE public.curriculum_lesson_revisions ENABLE ROW LEVEL SECURITY;

-- Revision history is append-only.
CREATE OR REPLACE FUNCTION public.curriculum_lesson_revisions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'curriculum_lesson_revisions is append-only';
END;
$$;

DROP TRIGGER IF EXISTS curriculum_lesson_revisions_append_only ON public.curriculum_lesson_revisions;
CREATE TRIGGER curriculum_lesson_revisions_append_only
  BEFORE UPDATE OR DELETE ON public.curriculum_lesson_revisions
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_lesson_revisions_append_only();
