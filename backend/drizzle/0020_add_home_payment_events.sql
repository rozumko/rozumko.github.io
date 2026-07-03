-- Migration 0020: Provider-neutral Home payment webhook events.
-- The real provider (WayForPay/LiqPay/etc.) is still a later decision. This
-- table gives the backend an idempotent, auditable boundary for verified
-- webhook events before they mutate Home entitlements.

CREATE TABLE IF NOT EXISTS public.home_payment_events (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider"          text NOT NULL,
  "provider_event_id" text NOT NULL,
  "lead_id"           uuid NOT NULL REFERENCES public.home_leads("id") ON DELETE CASCADE,
  "event_type"        text NOT NULL,
  "provider_ref"      text,
  "payload"           jsonb NOT NULL,
  "created_at"        timestamptz DEFAULT now(),
  CONSTRAINT "home_payment_events_provider_event_uq"
    UNIQUE ("provider", "provider_event_id")
);

CREATE INDEX IF NOT EXISTS "home_payment_events_lead_id_idx"
  ON public.home_payment_events ("lead_id");

ALTER TABLE public.home_payment_events ENABLE ROW LEVEL SECURITY;
