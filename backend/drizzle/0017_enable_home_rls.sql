-- Migration 0017: safety re-apply of RLS on Home tables.
--
-- The four ENABLE ROW LEVEL SECURITY statements were added to the already
-- merged 0015_add_home_leads.sql after the fact. The Drizzle migrator applies
-- migrations by journal timestamp, so any environment that ran 0015 before
-- that edit silently skipped the RLS statements. ENABLE ROW LEVEL SECURITY is
-- idempotent, so re-running it here is safe everywhere: fresh environments get
-- it twice (no-op), already-migrated environments get it for the first time.

ALTER TABLE public.home_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_demo_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_demo_reports ENABLE ROW LEVEL SECURITY;
