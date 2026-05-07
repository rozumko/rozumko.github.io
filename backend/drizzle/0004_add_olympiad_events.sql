CREATE TABLE "olympiad_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "access_codes" ADD COLUMN "event_id" uuid;
--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_event_id_olympiad_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."olympiad_events"("id") ON DELETE no action ON UPDATE no action;
