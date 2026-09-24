-- Migration 0056: Classroom Remote connection per teacher (docs/lesson-engine).
-- A teacher pastes a Classroom Remote integration key once; the backend keeps
-- it encrypted (AES-256-GCM under INTEGRATION_ENCRYPTION_KEY, bound to the
-- teacher) and uses it only to open the class link on the room's laptops and
-- read their status. The key never returns to a browser: only its last four
-- characters are shown. Room and organization names are cached for display.

CREATE TABLE IF NOT EXISTS public.classroom_remote_connections (
  teacher_id uuid PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  key_ciphertext text NOT NULL,
  key_hint text NOT NULL,
  room_name text NOT NULL DEFAULT '',
  organization_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classroom_remote_connections_ciphertext_check CHECK (key_ciphertext ~ '^v1\.[A-Za-z0-9_-]+$'),
  CONSTRAINT classroom_remote_connections_hint_check CHECK (key_hint ~ '^[A-Za-z0-9_-]{4}$')
);

ALTER TABLE public.classroom_remote_connections ENABLE ROW LEVEL SECURITY;
