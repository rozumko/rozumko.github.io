# Audited Content Publication

The admin **Publication** tab deploys all child-facing static content as one
version-checked set. It never grants the backend permission to commit or push.

## One-Time Setup

Configure these Render secrets:

- `CONTENT_PUBLISH_GITHUB_TOKEN`: a fine-grained token selected for this
  repository with **Actions: write** only;
- `CONTENT_PUBLISH_GITHUB_REPOSITORY`: `owner/repository`;
- `CONTENT_PUBLISH_CALLBACK_SECRET`: at least 32 random characters.

Configure these GitHub Actions secrets:

- `CONTENT_EXPORT_DATABASE_URL`: a dedicated PostgreSQL role with read-only
  access to `drizzle.__drizzle_migrations` and the content tables used by the
  export scripts;
- `CONTENT_PUBLISH_BACKEND_URL`: the public HTTPS backend origin, without a
  trailing API path;
- `CONTENT_PUBLISH_CALLBACK_SECRET`: exactly the same value as on Render.

These secrets are a hard pre-merge requirement for the workflow change. Every
Pages deployment exports current published content, including ordinary pushes;
without `CONTENT_EXPORT_DATABASE_URL`, the workflow fails early with an explicit
configuration error instead of deploying stale committed bundles.

Never use a classic broad-scope GitHub token. Never expose any of these values
as repository variables, frontend environment variables or workflow output.

## Publication Contract

1. An administrator starts a publication in the admin panel.
2. The backend records the exact published question, lesson, mission and path
   versions plus their SHA-256 manifest.
3. GitHub Actions exports fresh bundles from PostgreSQL. If content changed
   while the job was queued, the manifest comparison fails closed.
4. After tests and Pages deployment, the workflow posts an HMAC-signed result.
5. The admin journal shows the run, source commit, manifest and final status.

The workflow also exports current published content on ordinary frontend
deployments, so a code deployment cannot replace live content with an older
committed bundle.

Pages runs share a FIFO deployment queue (`queue: max`). Admin publications and
ordinary pushes therefore wait for each other instead of replacing an older
pending run before its audit callback can start.

## Recovery

- A failed dispatch is recorded as failed; correct the Render token/repository
  settings and start a new publication.
- A manifest mismatch means content was changed after approval. Review the new
  versions and start a new publication; do not bypass the hash check.
- If the workflow could not send its first callback, correct the Actions
  secrets and re-run that same workflow with the same inputs; the database job
  intentionally remains active and blocks a second publication.
- If Pages deployed but the final callback exhausted its retries, inspect the
  linked Actions run and database row. Do not edit the audit row manually;
  rerun a fresh publication after callback connectivity is restored.
- Rotate both copies of the callback secret together. During a mismatch,
  callbacks fail closed and no job can be marked successful.
