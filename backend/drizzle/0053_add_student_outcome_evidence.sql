-- Migration 0053: learning evidence (docs/lesson-engine, stage H).
-- One row links one attempt of an evidence activity to one learning outcome
-- it targets. Written in the same transaction as the attempt, append-only,
-- and traceable: evidence -> attempt -> dispatch/activity -> run -> lesson
-- version -> student. Additive only (ADR-0008).

CREATE TABLE IF NOT EXISTS public.student_outcome_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_run_id uuid NOT NULL REFERENCES public.lesson_runs(id) ON DELETE RESTRICT,
  lesson_run_student_id uuid NOT NULL REFERENCES public.lesson_run_students(id) ON DELETE RESTRICT,
  -- Persistent academic identity; a teacher deleting the student anonymises it.
  class_student_id uuid REFERENCES public.class_students(id) ON DELETE SET NULL,
  activity_attempt_id uuid NOT NULL REFERENCES public.activity_attempts(id) ON DELETE RESTRICT,
  subject_pack_id text NOT NULL,
  outcome_id text NOT NULL,
  evidence_role text NOT NULL,
  trust text NOT NULL,
  score numeric(5, 4) NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_outcome_evidence_attempt_outcome_uq UNIQUE (activity_attempt_id, outcome_id),
  CONSTRAINT student_outcome_evidence_role_check CHECK (evidence_role IN ('primary', 'supporting')),
  CONSTRAINT student_outcome_evidence_trust_check
    CHECK (trust IN ('server-verified', 'client-unverified', 'teacher-observed')),
  -- A client-reported result can never be primary evidence.
  CONSTRAINT student_outcome_evidence_primary_trust_check
    CHECK (evidence_role <> 'primary' OR trust <> 'client-unverified'),
  CONSTRAINT student_outcome_evidence_score_check CHECK (score >= 0 AND score <= 1)
);

CREATE INDEX IF NOT EXISTS student_outcome_evidence_run_idx
  ON public.student_outcome_evidence (lesson_run_id, lesson_run_student_id, outcome_id);
CREATE INDEX IF NOT EXISTS student_outcome_evidence_student_idx
  ON public.student_outcome_evidence (class_student_id, outcome_id, observed_at);

ALTER TABLE public.student_outcome_evidence ENABLE ROW LEVEL SECURITY;

-- Evidence may be anonymised (class_student_id → NULL) but never rewritten or removed.
CREATE OR REPLACE FUNCTION public.student_outcome_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'student_outcome_evidence is append-only';
  END IF;
  IF NEW.class_student_id IS NOT NULL AND NEW.class_student_id IS DISTINCT FROM OLD.class_student_id THEN
    RAISE EXCEPTION 'student_outcome_evidence is append-only';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.lesson_run_id IS DISTINCT FROM OLD.lesson_run_id
     OR NEW.lesson_run_student_id IS DISTINCT FROM OLD.lesson_run_student_id
     OR NEW.activity_attempt_id IS DISTINCT FROM OLD.activity_attempt_id
     OR NEW.subject_pack_id IS DISTINCT FROM OLD.subject_pack_id
     OR NEW.outcome_id IS DISTINCT FROM OLD.outcome_id
     OR NEW.evidence_role IS DISTINCT FROM OLD.evidence_role
     OR NEW.trust IS DISTINCT FROM OLD.trust
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at THEN
    RAISE EXCEPTION 'student_outcome_evidence is append-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_outcome_evidence_guard ON public.student_outcome_evidence;
CREATE TRIGGER student_outcome_evidence_guard
  BEFORE UPDATE OR DELETE ON public.student_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION public.student_outcome_evidence_guard();
