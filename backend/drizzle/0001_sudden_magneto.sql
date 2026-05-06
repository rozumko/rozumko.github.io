DROP TABLE "questions";--> statement-breakpoint
CREATE TABLE "questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firebase_id" text UNIQUE,
  "q" text NOT NULL,
  "code" text,
  "options" jsonb NOT NULL,
  "correct" integer NOT NULL,
  "explanation" text,
  "difficulty" text,
  "grade" integer,
  "subject" text,
  "is_olympiad" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);