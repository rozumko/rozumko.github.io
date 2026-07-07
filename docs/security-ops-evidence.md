# Security Operations Evidence

_Updated: 2026-07-07_

Use this checklist as the source-of-truth template for security evidence before
a pilot or production event. Do not commit screenshots, secrets, tokens,
personal data or private console URLs. Store completed evidence in the private
operations folder or ticket system and link only to non-sensitive public docs
from this repository.

## MVP / Free-Tier Priority

For the current MVP, treat these controls as **blocking before a public pilot**:

- Supabase Auth Turnstile enforcement for teacher signup.
- Supabase Auth rate-limit review, documented with the limits available on the
  current plan.
- Database migrations applied through `0028`, with the backend database role
  verified before enabling RLS and RLS verified on application tables.
- `main` protected from direct/force pushes, with CI checks required before
  merge where the current GitHub plan allows it.
- Render backend synced from `backend/render.yaml`, running a single instance
  while `RATE_LIMIT_STORE=memory`, with `/health` configured.
- Post-deploy smoke for `/health`, `/ready`, `/ping`, answer-key stripping,
  rate-limit behavior, iframe blocking and teacher session storage.
- Before the first live event, one manual database export/import smoke test.

These controls are **not pilot blockers on free tiers**, but should stay on the
backlog before higher traffic, paid campaigns or production-grade operations:

- Full restore drill on a separate non-production database after the MVP smoke
  export/import test.
- Centralized SIEM/audit export beyond GitHub, Supabase and Render logs.
- Multi-instance backend scaling.
- Shared rate-limit store such as Redis or Valkey.
- Moving authenticated frontend pages behind a host that can send HTTP
  `Content-Security-Policy: frame-ancestors`.

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
| Migrations | Latest migrations applied through RLS migration `0028` | Migration output or schema migration table |  |
| RLS role preflight | Backend `DATABASE_URL` role owns application tables or has `BYPASSRLS` before `0028` is applied | SQL verification result |  |
| RLS | Application tables have RLS enabled with no browser-facing permissive policies | SQL verification result |  |
| Direct table access | Frontend does not use Supabase Data API tables | Code review / CI evidence |  |
| Backup/export | Recent backup or manual export exists after final event setup, according to the current Supabase plan | Backup/export timestamp |  |
| Export/import smoke | Before the first live event, export and import into a local or non-production PostgreSQL database once | Smoke result and timestamp |  |
| Full restore drill | Deferred for MVP free-tier pilot after export/import smoke; required before higher-risk production operations | Restore drill result and timestamp | deferred |

Suggested backend role preflight before applying RLS migration `0028`:

```sql
select current_user, rolbypassrls
from pg_roles
where rolname = current_user;

select tablename, tableowner
from pg_tables
where schemaname = 'public'
order by tablename;
```

Expected result: the backend `DATABASE_URL` role is the owner of application
tables, or `rolbypassrls = true`. If neither is true, applying `0028` without
policies can make backend reads return no rows.

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
| Teacher session | Refresh works, session is tab-scoped, `localStorage.teacher_session` is absent, and residual XSS exposure of `sessionStorage` is accepted for MVP | Browser storage screenshot after login |  |
| Incident contacts | Operator has current incident contacts | Private contact list location |  |
