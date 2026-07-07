# Security Operations Evidence

_Updated: 2026-07-07_

Use this checklist as the source-of-truth template for security evidence before
a pilot or production event. Do not commit screenshots, secrets, tokens,
personal data or private console URLs. Store completed evidence in the private
operations folder or ticket system and link only to non-sensitive public docs
from this repository.

## Evidence Header

| Field | Value |
|---|---|
| Review date |  |
| Reviewed by |  |
| Git commit / release |  |
| Environment | staging / production |
| Evidence location | private link or folder |

## Supabase Auth

| Control | Expected state | Evidence to capture | Status |
|---|---|---|---|
| Email confirmation | Enabled for teacher signup | Auth settings screenshot or export |  |
| Teacher approval | New teachers remain pending until admin approval | Signup test result showing `ACCOUNT_PENDING` |  |
| Turnstile | Bot and Abuse Protection enforces Turnstile for signup | Supabase Auth setting and failed signup without token |  |
| Signup rate limits | Reviewed and appropriate for pilot traffic | Auth rate-limit settings screenshot/export |  |
| Password login rate limits | Reviewed and appropriate for pilot traffic | Auth rate-limit settings screenshot/export |  |
| Stale users | Pending/blocked teacher accounts reviewed | Count and removal/retention decision |  |

## Supabase Database

| Control | Expected state | Evidence to capture | Status |
|---|---|---|---|
| Migrations | Latest migration applied, including RLS migration `0028` | Migration output or schema migration table |  |
| RLS | Application tables have RLS enabled with no browser-facing permissive policies | SQL verification result |  |
| Direct table access | Frontend does not use Supabase Data API tables | Code review / CI evidence |  |
| Backups | Recent backup exists after final event setup | Backup timestamp |  |
| Restore drill | Restore passed on non-production database | Restore drill result and timestamp |  |

Suggested RLS verification query:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

## GitHub

| Control | Expected state | Evidence to capture | Status |
|---|---|---|---|
| Branch protection | `main` requires pull request review before merge | Branch protection screenshot/export |  |
| Required checks | Project CI, Pages deploy checks and Supply Chain checks are required | Required status checks list |  |
| Force pushes | Disabled on `main` | Branch protection screenshot/export |  |
| Dependabot | npm updates enabled for root and backend | Dependabot config / open PR evidence |  |
| Dependency review | PRs run dependency review and fail on high severity | Workflow run result |  |
| npm audit | Scheduled/manual audit runs for root and backend | Workflow run result |  |

## Render Backend

| Control | Expected state | Evidence to capture | Status |
|---|---|---|---|
| Blueprint sync | Service is synced from `backend/render.yaml` | Render service settings screenshot/export |  |
| Deploy gate | Auto-deploy waits for checks to pass | Render deploy setting or last deploy evidence |  |
| Instance count | `numInstances = 1` while `RATE_LIMIT_STORE=memory` | Render scaling setting |  |
| Health check | `/health` is configured as health check path | Render setting and live response |  |
| Secrets | `DATABASE_URL`, `SUPABASE_URL`, `ATTEMPT_SECRET`, `HOME_PAYMENT_WEBHOOK_SECRET` are stored as secret env vars | Env var names only, no values |  |

Live checks:

```bash
curl.exe -i https://rozumko-github-io.onrender.com/health
curl.exe -i https://rozumko-github-io.onrender.com/ready
curl.exe -i https://rozumko-github-io.onrender.com/ping
```

## Post-Deploy Security Smoke

| Control | Expected state | Evidence to capture | Status |
|---|---|---|---|
| Security smoke | `docs/smoke-test.md` sections 7 and 8 passed | Filled checklist or script output |  |
| Rate limit | Repeated invalid-code attempts return `429` | Smoke output, run off-peak/staging |  |
| Answer keys | Public/demo/official responses expose no answer keys | Network capture or smoke output |  |
| Teacher session | Refresh works, but refresh token is not in `localStorage` | Browser storage screenshot after login |  |
| Incident contacts | Operator has current incident contacts | Private contact list location |  |

