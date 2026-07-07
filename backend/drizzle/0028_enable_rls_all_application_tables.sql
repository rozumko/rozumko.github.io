-- Migration 0028: enable RLS on every application table.
--
-- The backend remains the only supported application data path. RLS is enabled
-- here as defense-in-depth for accidental Supabase Data API/grant exposure.
-- No permissive policies are added in this migration, so direct anon/authenticated
-- table access stays deny-by-default. The backend DB role must continue to use
-- the trusted server-side DATABASE_URL, not a browser Supabase key.

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.olympiad_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_demo_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_demo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_entitlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_mission_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_payment_events ENABLE ROW LEVEL SECURITY;
