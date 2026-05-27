-- Migration 0011: add type column to questions, make correct nullable
-- Applied manually to Supabase on 2026-05-27; this file keeps Drizzle journal in sync.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'choice';

ALTER TABLE public.questions
  ALTER COLUMN correct DROP NOT NULL;

COMMENT ON COLUMN public.questions.type IS 'choice | truefalse | input | sort | sequence | match';
COMMENT ON COLUMN public.questions.correct IS 'Index of correct answer for choice/truefalse. NULL for input/sort/sequence/match.';
