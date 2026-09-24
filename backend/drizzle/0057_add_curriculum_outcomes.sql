-- Migration 0057: Lesson Engine learning outcome directory
-- (docs/lesson-engine/README.md, "Outcome directory").
-- Outcomes used to be code-owned in backend/src/lib/subject-packs.ts. They now
-- live here so a methodologist can add national-standard (NUSH), program and
-- international (Cambridge) outcomes from the admin panel. Subject packs keep
-- tools and games in code; lessons still reference outcomes by id.
--
-- Evidence rows (student_outcome_evidence.outcome_id) point at these ids, so
-- an outcome is never deleted and its id and pack never change: it is archived
-- instead. Archived outcomes cannot be used by a new save or publish, but old
-- reports still resolve their title. Every change is journaled append-only.

CREATE TABLE IF NOT EXISTS public.curriculum_outcomes (
  id text PRIMARY KEY,
  subject_pack_id text NOT NULL,
  code text NOT NULL,
  title_uk text NOT NULL,
  title_en text,
  source text NOT NULL,
  source_ref text,
  grade_band text,
  mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  edit_version integer NOT NULL DEFAULT 1,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_outcomes_id_check CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(id) <= 64),
  CONSTRAINT curriculum_outcomes_pack_check CHECK (subject_pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT curriculum_outcomes_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  CONSTRAINT curriculum_outcomes_title_check CHECK (length(btrim(title_uk)) BETWEEN 1 AND 300),
  CONSTRAINT curriculum_outcomes_source_check
    CHECK (source IN ('national-standard', 'program', 'international', 'internal')),
  CONSTRAINT curriculum_outcomes_mappings_check CHECK (jsonb_typeof(mappings) = 'array'),
  CONSTRAINT curriculum_outcomes_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT curriculum_outcomes_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT curriculum_outcomes_pack_code_uq UNIQUE (subject_pack_id, code)
);

CREATE INDEX IF NOT EXISTS curriculum_outcomes_pack_status_idx
  ON public.curriculum_outcomes (subject_pack_id, status, code);

ALTER TABLE public.curriculum_outcomes ENABLE ROW LEVEL SECURITY;

-- Identity is immutable and rows are never deleted: evidence refers to them.
CREATE OR REPLACE FUNCTION public.curriculum_outcomes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'curriculum outcome % cannot be deleted; archive it instead', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.subject_pack_id IS DISTINCT FROM OLD.subject_pack_id THEN
    RAISE EXCEPTION 'curriculum outcome % cannot change its id or subject pack', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS curriculum_outcomes_guard ON public.curriculum_outcomes;
CREATE TRIGGER curriculum_outcomes_guard
  BEFORE UPDATE OR DELETE ON public.curriculum_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_outcomes_guard();

CREATE TABLE IF NOT EXISTS public.curriculum_outcome_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id text NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  edit_version integer NOT NULL,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_outcome_revisions_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT curriculum_outcome_revisions_action_check CHECK (action IN ('create', 'update', 'status')),
  CONSTRAINT curriculum_outcome_revisions_outcome_edit_version_uq UNIQUE (outcome_id, edit_version)
);

ALTER TABLE public.curriculum_outcome_revisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.curriculum_outcome_revisions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'curriculum_outcome_revisions is append-only';
END;
$$;

DROP TRIGGER IF EXISTS curriculum_outcome_revisions_append_only ON public.curriculum_outcome_revisions;
CREATE TRIGGER curriculum_outcome_revisions_append_only
  BEFORE UPDATE OR DELETE ON public.curriculum_outcome_revisions
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_outcome_revisions_append_only();

-- The two pilot outcomes that were code-owned until now (reference lesson
-- g2-m2-l8). Same ids, so existing lessons and evidence keep resolving.
INSERT INTO public.curriculum_outcomes (id, subject_pack_id, code, title_uk, source, grade_band, mappings)
VALUES
  ('int-files-name-extension', 'informatics-ua-primary', 'INF-2-FILES-1',
   'Розрізняє ім’я файла та розширення і пояснює, навіщо потрібне розширення', 'internal', '1-2', '[]'::jsonb),
  ('int-files-organize', 'informatics-ua-primary', 'INF-2-FILES-2',
   'Створює, перейменовує, переміщує та знаходить файли в тематичній папці', 'internal', '1-2', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.curriculum_outcome_revisions (outcome_id, edit_version, action, snapshot)
SELECT o.id, 1, 'create', jsonb_build_object(
  'id', o.id, 'subjectPackId', o.subject_pack_id, 'code', o.code, 'titleUk', o.title_uk,
  'titleEn', o.title_en, 'source', o.source, 'sourceRef', o.source_ref, 'gradeBand', o.grade_band,
  'mappings', o.mappings, 'status', o.status)
FROM public.curriculum_outcomes o
WHERE o.id IN ('int-files-name-extension', 'int-files-organize')
ON CONFLICT (outcome_id, edit_version) DO NOTHING;
