-- Migration 0022: Missions registry.
-- Реєстр місій (question-set / майбутні ігри). Свідомо без FK від
-- home_demo_attempts/home_mission_attempts — missionId там лишається логічним
-- ідентифікатором за контрактом docs/home-demo-contract.md.

CREATE TABLE IF NOT EXISTS public.missions (
  "id"         text PRIMARY KEY,
  "title"      text NOT NULL,
  "kind"       text NOT NULL DEFAULT 'question-set',
  "track"      text NOT NULL,
  "grade"      integer NOT NULL,
  "version"    integer NOT NULL DEFAULT 1,
  "status"     text NOT NULL DEFAULT 'active',
  "config"     jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "missions_track_check"
    CHECK ("track" IN ('informatics', 'computational-thinking', 'ai-basics')),
  CONSTRAINT "missions_status_check"
    CHECK ("status" IN ('draft', 'active', 'archived')),
  CONSTRAINT "missions_grade_check"
    CHECK ("grade" BETWEEN 1 AND 4)
);

CREATE INDEX IF NOT EXISTS "missions_track_grade_idx" ON public.missions ("track", "grade");

-- Посів існуючих логічних місій Home (home-demo.ts генерує ці слаги):
--   demo-{track}-grade{N} та practice-{track}-grade{N}
INSERT INTO public.missions ("id", "title", "kind", "track", "grade")
SELECT
  m.prefix || '-' || t.slug || '-grade' || g::text,
  m.label || ': ' || t.label || ', ' || g::text || ' клас',
  'question-set',
  t.slug,
  g
FROM (VALUES
  ('demo', 'Демо-місія'),
  ('practice', 'Практика')
) AS m(prefix, label)
CROSS JOIN (VALUES
  ('informatics', 'Інформатика'),
  ('computational-thinking', 'Обчислювальне мислення'),
  ('ai-basics', 'Основи ШІ')
) AS t(slug, label)
CROSS JOIN generate_series(1, 4) AS g
ON CONFLICT ("id") DO NOTHING;
