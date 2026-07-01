-- Migration 0013: default app_users.status to 'pending' (safe-by-default approval flow).
-- Previously the column defaulted to 'active', so any insert that omitted status
-- would silently create an approved user. The approval flow relies on new teachers
-- being 'pending' until an admin activates them, so the DB default must be 'pending'.
-- Existing rows keep their current status; only the column default changes.
-- Seed/admin bootstrap must set status = 'active' explicitly.

ALTER TABLE public.app_users ALTER COLUMN status SET DEFAULT 'pending';
