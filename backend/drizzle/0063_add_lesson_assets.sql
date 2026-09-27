-- Lesson files stored once, addressed by the SHA-256 of their bytes (stage 4).
-- Lessons and board materials reference them as { type: 'asset', sha256 }
-- instead of carrying base64 copies into every revision and run snapshot.
-- Rows are immutable: the same hash always means the same bytes.
CREATE TABLE public.lesson_assets (
  sha256 text PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  bytes bytea NOT NULL,
  size integer NOT NULL CHECK (size > 0 AND size <= 2097152 AND size = octet_length(bytes)),
  created_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION public.lesson_assets_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.mime IS DISTINCT FROM OLD.mime OR NEW.bytes IS DISTINCT FROM OLD.bytes THEN
    RAISE EXCEPTION 'lesson_assets content is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lesson_assets_immutable BEFORE UPDATE ON public.lesson_assets
  FOR EACH ROW EXECUTE FUNCTION public.lesson_assets_immutable();
--> statement-breakpoint
ALTER TABLE public.lesson_assets ENABLE ROW LEVEL SECURITY;
