-- Migration 0046: let a delivery change record its own revision action.
--
-- The editorial check constraint (0036) predates the bulk channels route, so
-- every add/remove violated it: the whole batch rolled back and the admin saw
-- a 500. A channel change is audited separately from a content edit — it may
-- touch published rows — so it keeps its own action name rather than being
-- folded into 'update'.

ALTER TABLE public.question_revisions
  DROP CONSTRAINT IF EXISTS question_revisions_action_check;

ALTER TABLE public.question_revisions
  ADD CONSTRAINT question_revisions_action_check
    CHECK (action IN ('create', 'update', 'status', 'restore', 'backfill', 'channels'));
