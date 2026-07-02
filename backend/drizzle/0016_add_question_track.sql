-- Migration 0016: Content taxonomy for Home Demo and AIG-ready item models.
-- Nullable for existing content; new Home Demo content should set one of the
-- three product tracks so public demo missions can select by direction without
-- keyword heuristics.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "track" text;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS "questions_track_check";

ALTER TABLE public.questions
  ADD CONSTRAINT "questions_track_check"
  CHECK ("track" IS NULL OR "track" IN ('informatics', 'computational-thinking', 'ai-basics'));

CREATE INDEX IF NOT EXISTS "questions_track_idx" ON public.questions ("track");
