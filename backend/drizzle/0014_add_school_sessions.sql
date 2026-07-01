-- Migration 0014: advanced School Mode (Kahoot-style classroom sessions).
-- Ephemeral, anonymous: no child PII. Teacher owns a session; students join by
-- a short code with an avatar + nickname (a label, not a real name). Server-side
-- scoring. Idempotent (CREATE TABLE IF NOT EXISTS) to match the hand-written
-- migration history.

CREATE TABLE IF NOT EXISTS public.school_sessions (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teacher_id"      uuid NOT NULL REFERENCES public.app_users("id"),
  "grade"           integer NOT NULL,
  "difficulty"      text,
  "questions_count" integer NOT NULL DEFAULT 10,
  "join_code"       text NOT NULL UNIQUE,
  "status"          text NOT NULL DEFAULT 'lobby',
  "created_at"      timestamptz DEFAULT now(),
  "started_at"      timestamptz,
  "finished_at"     timestamptz
);

CREATE TABLE IF NOT EXISTS public.school_session_questions (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id"  uuid NOT NULL REFERENCES public.school_sessions("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES public.questions("id"),
  "position"    integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.school_participants (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES public.school_sessions("id") ON DELETE CASCADE,
  "avatar"     text NOT NULL,
  "nickname"   text NOT NULL,
  "score"      integer NOT NULL DEFAULT 0,
  "joined_at"  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_answers (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "participant_id" uuid NOT NULL REFERENCES public.school_participants("id") ON DELETE CASCADE,
  "question_id"    uuid NOT NULL REFERENCES public.questions("id"),
  "answer"         jsonb,
  "is_correct"     boolean NOT NULL,
  "answered_at"    timestamptz DEFAULT now(),
  CONSTRAINT "school_answers_participant_question_uq" UNIQUE ("participant_id", "question_id")
);

CREATE INDEX IF NOT EXISTS "school_sessions_teacher_id_idx" ON public.school_sessions ("teacher_id");
CREATE INDEX IF NOT EXISTS "school_participants_session_id_idx" ON public.school_participants ("session_id");
CREATE INDEX IF NOT EXISTS "school_answers_participant_id_idx" ON public.school_answers ("participant_id");
