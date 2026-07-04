-- Migration 0021: Question content taxonomy (docs/content-taxonomy.md).
-- topic — предметна тема в межах track; concept_key — CT-навичка (крос-напрямкова);
-- progression_band — рівень мисленнєвої дії; version — версія змісту питання;
-- meta — редакційні метадані (reviewStatus, isCore, джерело імпорту).
-- Nullable для існуючого вмісту; обов'язковість нових полів забезпечує API.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "topic" text;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "concept_key" text;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "progression_band" text;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS "meta" jsonb;

-- topic валідний лише в парі зі своїм track (списки — docs/content-taxonomy.md)
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS "questions_topic_check";

ALTER TABLE public.questions
  ADD CONSTRAINT "questions_topic_check"
  CHECK (
    "topic" IS NULL OR (
      ("track" = 'informatics' AND "topic" IN (
        'information', 'data', 'computer-systems', 'algorithms-programming',
        'networks-internet', 'digital-safety', 'digital-tools'
      )) OR
      ("track" = 'ai-basics' AND "topic" IN (
        'what-is-ai', 'how-ai-learns', 'ai-perception', 'human-vs-ai',
        'ai-ethics-safety', 'ai-tools'
      )) OR
      ("track" = 'computational-thinking' AND "topic" IN (
        'algorithms', 'decomposition', 'abstraction', 'patterns', 'repetition',
        'logic', 'efficiency', 'classification', 'debugging'
      ))
    )
  );

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS "questions_concept_key_check";

ALTER TABLE public.questions
  ADD CONSTRAINT "questions_concept_key_check"
  CHECK ("concept_key" IS NULL OR "concept_key" IN (
    'algorithms', 'decomposition', 'abstraction', 'patterns', 'repetition',
    'logic', 'efficiency', 'classification', 'debugging'
  ));

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS "questions_progression_band_check";

ALTER TABLE public.questions
  ADD CONSTRAINT "questions_progression_band_check"
  CHECK ("progression_band" IS NULL OR "progression_band" IN ('recognize', 'apply', 'reason'));

CREATE INDEX IF NOT EXISTS "questions_topic_idx" ON public.questions ("topic");
CREATE INDEX IF NOT EXISTS "questions_concept_key_idx" ON public.questions ("concept_key");
