CREATE TABLE IF NOT EXISTS "class_students" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id"   uuid NOT NULL REFERENCES "teacher_classes"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "app_users"("id"),
  "label"      text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- RLS: увімкнути одразу після міграції в Supabase SQL Editor
-- ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
