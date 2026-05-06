CREATE TABLE "questions" (
	"id" text PRIMARY KEY DEFAULT 'gen_random_uuid()' NOT NULL,
	"firebase_id" text,
	"q" text NOT NULL,
	"code" text,
	"options" jsonb NOT NULL,
	"correct" integer NOT NULL,
	"explanation" text,
	"difficulty" text,
	"grade" integer,
	"subject" text,
	"is_olympiad" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "questions_firebase_id_unique" UNIQUE("firebase_id")
);
