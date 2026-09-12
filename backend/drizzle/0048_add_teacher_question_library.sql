-- Migration 0048: private teacher-authored topics and immutable School decks.

CREATE TABLE IF NOT EXISTS public.teacher_question_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL REFERENCES public.app_users(id),
  title       text NOT NULL,
  description text,
  grade       integer NOT NULL,
  archived_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT teacher_question_topics_grade_check CHECK (grade BETWEEN 1 AND 4),
  CONSTRAINT teacher_question_topics_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 80)
);

ALTER TABLE public.teacher_question_topics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS teacher_question_topics_owner_idx
  ON public.teacher_question_topics (teacher_id, archived_at, grade);

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS teacher_topic_id uuid
    REFERENCES public.teacher_question_topics(id);

CREATE INDEX IF NOT EXISTS questions_teacher_topic_idx
  ON public.questions (teacher_topic_id, editorial_status, difficulty);

-- The snapshot includes the answer key and therefore remains backend-only.
-- Existing sessions fall back to the referenced immutable published question.
ALTER TABLE public.school_session_questions
  ADD COLUMN IF NOT EXISTS snapshot jsonb;
