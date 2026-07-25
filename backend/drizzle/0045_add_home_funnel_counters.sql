-- Migration 0045: anonymous Home funnel counters.
--
-- Privacy boundary (docs/security-model.md, docs/home-demo-contract.md):
-- nothing individual is stored before parental consent. This table therefore
-- holds AGGREGATES only — one row per (date, step, grade, track) with a
-- counter — and deliberately has no visitor, session, IP or user-agent column.
-- A single child's path cannot be reconstructed from it by construction.

CREATE TABLE IF NOT EXISTS public.home_funnel_counters (
  bucket_date date NOT NULL DEFAULT CURRENT_DATE,
  step text NOT NULL,
  grade smallint NOT NULL DEFAULT 0,
  track text NOT NULL DEFAULT 'none',
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_date, step, grade, track),
  CONSTRAINT home_funnel_counters_step_check
    CHECK (step IN (
      'home_open', 'path_start', 'practice_start',
      'practice_complete', 'parent_gate_view', 'parent_lead'
    )),
  CONSTRAINT home_funnel_counters_grade_check
    CHECK (grade BETWEEN 0 AND 4),
  CONSTRAINT home_funnel_counters_track_check
    CHECK (track IN ('none', 'informatics', 'computational-thinking', 'ai-basics')),
  CONSTRAINT home_funnel_counters_count_check
    CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS home_funnel_counters_date_idx
  ON public.home_funnel_counters (bucket_date DESC);

ALTER TABLE public.home_funnel_counters ENABLE ROW LEVEL SECURITY;
