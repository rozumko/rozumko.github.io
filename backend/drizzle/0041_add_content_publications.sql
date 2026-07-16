-- Migration 0041: audited static bundle publication jobs.

CREATE TABLE IF NOT EXISTS public.content_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued',
  expected_manifest jsonb NOT NULL,
  expected_manifest_sha256 text NOT NULL,
  published_manifest_sha256 text,
  requested_by text NOT NULL,
  workflow_run_id text,
  workflow_url text,
  source_sha text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT content_publications_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  CONSTRAINT content_publications_expected_hash_check
    CHECK (expected_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT content_publications_published_hash_check
    CHECK (published_manifest_sha256 IS NULL OR published_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT content_publications_source_sha_check
    CHECK (source_sha IS NULL OR source_sha ~ '^[0-9a-f]{40}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS content_publications_one_active_uq
  ON public.content_publications ((1))
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS content_publications_created_idx
  ON public.content_publications (created_at DESC);
ALTER TABLE public.content_publications ENABLE ROW LEVEL SECURITY;
