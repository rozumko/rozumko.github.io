CREATE TABLE "teacher_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grade" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"grade" integer NOT NULL,
	"participants_count" integer NOT NULL,
	"payment_status" text DEFAULT 'not_required' NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "teacher_classes" ADD CONSTRAINT "teacher_classes_teacher_id_app_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_olympiad_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."olympiad_events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_class_id_teacher_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."teacher_classes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_teacher_id_app_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;
