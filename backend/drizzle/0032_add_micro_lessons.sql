-- Migration 0032: micro-lessons authoring (теорія перед випробуванням).
-- Уроки авторяться в адмінці і роздаються дітям СТАТИЧНИМ бандлом
-- public/lessons/<id>.json (npm run export:lessons) — рантайм-читання з БД
-- дитячими сторінками не передбачене. Перевірочні питання формувальні,
-- ключі публічні свідомо (як practice-бандл питань).

CREATE TABLE public.micro_lessons (
  id text PRIMARY KEY,                       -- slug: info-senses-g2
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_url text,
  check_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT micro_lessons_status_ck CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT micro_lessons_version_ck CHECK (version >= 1),
  CONSTRAINT micro_lessons_id_ck CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE public.micro_lessons ENABLE ROW LEVEL SECURITY;
