-- Migration 0029: parent account identity — schema only, no runtime auth.
--
-- Design: docs/architecture.md "Parent account target model",
-- docs/security-model.md "Parent Accounts And Child Profiles".
-- home_parent_accounts is a separate identity mapped 1:1 to a Supabase Auth
-- user; it is NOT app_users and must not join the teacher/admin provisioning
-- path. Ownership columns are nullable: an unclaimed demo lead keeps working
-- without an account, and claiming backfills them transactionally (next slice).
-- ON DELETE RESTRICT is deliberate fail-closed: account deletion with owned
-- data must wait for the documented retention/anonymization policy.

CREATE TABLE public.home_parent_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Deny-by-default, як у 0028: бекенд ходить через server-side DATABASE_URL.
ALTER TABLE public.home_parent_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.home_leads
  ADD COLUMN parent_account_id uuid REFERENCES public.home_parent_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN claimed_at timestamptz;

ALTER TABLE public.home_child_profiles
  ADD COLUMN parent_account_id uuid REFERENCES public.home_parent_accounts(id) ON DELETE RESTRICT;

CREATE INDEX home_leads_parent_account_idx
  ON public.home_leads (parent_account_id) WHERE parent_account_id IS NOT NULL;
CREATE INDEX home_child_profiles_parent_account_idx
  ON public.home_child_profiles (parent_account_id) WHERE parent_account_id IS NOT NULL;
