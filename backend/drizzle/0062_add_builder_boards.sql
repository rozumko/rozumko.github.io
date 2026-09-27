-- Lesson Builder boards (stage 2): a teacher's topic boards of collected
-- materials, laid out on a pannable canvas. Owner-scoped in every route;
-- items are validated canvas items (no scored activities, no answer keys).
CREATE TABLE public.builder_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX builder_boards_owner_idx ON public.builder_boards (owner_id, updated_at DESC);
--> statement-breakpoint
CREATE TABLE public.builder_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.builder_boards(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('text', 'image', 'video', 'learningapps', 'pdf', 'html', 'link')),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  -- Lower-cased title and visible text, so search never scans file payloads.
  search_text text NOT NULL DEFAULT '',
  x integer NOT NULL DEFAULT 0 CHECK (x BETWEEN -100000 AND 100000),
  y integer NOT NULL DEFAULT 0 CHECK (y BETWEEN -100000 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX builder_materials_board_idx ON public.builder_materials (board_id);
--> statement-breakpoint
CREATE INDEX builder_materials_owner_idx ON public.builder_materials (owner_id);
--> statement-breakpoint
ALTER TABLE public.builder_boards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.builder_materials ENABLE ROW LEVEL SECURITY;
