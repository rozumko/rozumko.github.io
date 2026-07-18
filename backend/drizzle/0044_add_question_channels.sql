-- Migration 0044: add fail-closed distribution channels to the training question pool.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.questions
SET is_olympiad = false
WHERE is_olympiad IS NULL;

ALTER TABLE public.questions
  ALTER COLUMN is_olympiad SET NOT NULL;

UPDATE public.questions
SET channels = CASE
  WHEN is_olympiad IS TRUE THEN ARRAY[]::text[]
  ELSE ARRAY['class_game', 'path', 'olympiad_training']::text[]
END;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_channels_allowed_check,
  ADD CONSTRAINT questions_channels_allowed_check
    CHECK (channels <@ ARRAY['class_game', 'path', 'olympiad_training']::text[]),
  DROP CONSTRAINT IF EXISTS questions_main_round_channels_check,
  ADD CONSTRAINT questions_main_round_channels_check
    CHECK (is_olympiad IS NOT TRUE OR cardinality(channels) = 0),
  DROP CONSTRAINT IF EXISTS questions_published_training_channels_check,
  ADD CONSTRAINT questions_published_training_channels_check
    CHECK (is_olympiad IS TRUE OR editorial_status <> 'published' OR cardinality(channels) > 0);

CREATE INDEX IF NOT EXISTS questions_channels_gin_idx
  ON public.questions USING gin (channels);
