-- Migration 0018: Home paid-access entitlement (Rozumko Club MVP, no provider).
-- One entitlement per lead; the backend decides access from status +
-- current_period_end. Card data stays with the future payment provider —
-- Rozumko stores only the access state and an optional provider reference.
-- Entitlement never affects answer keys, scoring rules or stored answers
-- (docs/security-model.md). The events table is the audit trail for every
-- status change (admin manual control today, provider webhooks later).

CREATE TABLE IF NOT EXISTS public.home_entitlements (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id"            uuid NOT NULL UNIQUE REFERENCES public.home_leads("id") ON DELETE CASCADE,
  "status"             text NOT NULL,
  "current_period_end" timestamptz,
  "provider_ref"       text,
  "created_at"         timestamptz DEFAULT now(),
  "updated_at"         timestamptz DEFAULT now(),
  CONSTRAINT "home_entitlements_status_check"
    CHECK ("status" IN ('active', 'past_due', 'canceled', 'expired', 'revoked'))
);

CREATE TABLE IF NOT EXISTS public.home_entitlement_events (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entitlement_id" uuid NOT NULL REFERENCES public.home_entitlements("id") ON DELETE CASCADE,
  "actor"          text NOT NULL,
  "from_status"    text,
  "to_status"      text NOT NULL,
  "reason"         text,
  "created_at"     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "home_entitlement_events_entitlement_id_idx"
  ON public.home_entitlement_events ("entitlement_id");

ALTER TABLE public.home_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_entitlement_events ENABLE ROW LEVEL SECURITY;
