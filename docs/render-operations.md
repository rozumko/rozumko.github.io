# Render Operations Runbook - Rozumko

_Updated: 2026-06-30_

The backend runs on Render from `backend/render.yaml`.

## Current Deployment Rules

- Render deploys the backend only after CI checks pass:
  `autoDeployTrigger: checksPass`.
- The start command runs the read-only `db:migrate:check:prod` guard before the
  server. It never applies migrations; an outdated database blocks the new
  process from starting.
- The backend liveness path is `/health`.
- Live monitoring should use `/ready` or `/ping`, because they verify database access.
- Required secrets are configured in Render environment variables, not in Git.

## Instance Count Rule

Keep the backend at one running instance while `RATE_LIMIT_STORE=memory`.

Reason:

- `RATE_LIMIT_STORE=memory` means `@fastify/rate-limit` uses in-process state.
- With multiple backend instances and no shared store, a client can receive a
  separate rate-limit bucket per instance.
- The current security model assumes one Render reverse-proxy hop and
  `trustProxy: 1`.
- Unsupported store values fail fast at startup. Shared-store mode must be
  configured and tested before multiple backend instances are used.

Do not scale to multiple instances until one of these is true:

- a shared rate-limit store, such as Redis, is configured and tested; or
- the rate-limit design is explicitly re-audited and documented.

## Pre-Event Render Check

- [ ] The deployed commit is the intended commit.
- [ ] The latest Backend CI workflow passed.
- [ ] Required migrations were applied deliberately and
      `npm run db:migrate:check` passes.
- [ ] Render service is synced from `backend/render.yaml`.
- [ ] Environment variables are present: `DATABASE_URL`, `SUPABASE_URL`,
      `ATTEMPT_SECRET`, `NODE_ENV=production`, `RATE_LIMIT_STORE=memory`.
- [ ] Instance count is one.
- [ ] `/health` returns `{ "status": "ok", "service": "rozumko-backend" }`.
- [ ] `/ready` returns `{ "status": "ok", "db": "ok" }`.
- [ ] `/ping` returns `{ "status": "ok", "db": "ok" }`.
- [ ] The service was warmed shortly before students start.

## If Backend Is Cold Or Slow

1. Hit `/ready` manually before the event window.
2. Wait for startup if Render is waking the service.
3. Confirm `/ready` returns `db: ok`.
4. Start the student flow only after the backend is warm.

For a larger pilot, prefer a paid instance over relying on cold-start timing.

If startup logs contain `Database migrations are behind`, apply the reviewed
migrations from a trusted operator environment. Do not bypass or remove the
startup check.

## If Scaling Is Needed

Before increasing instance count:

- [ ] Add a shared rate-limit store.
- [ ] Change `RATE_LIMIT_STORE` only after the shared store is implemented.
- [ ] Re-run rate-limit spoofing regression tests.
- [ ] Run load tests at the intended concurrency.
- [ ] Update `docs/security-model.md` and `docs/smoke-test.md`.
- [ ] Verify `X-Forwarded-For` behavior still matches the deployment topology.

## Incident Notes

Record these after any Render incident:

- deployed commit;
- event time window;
- start and end of outage or slowdown;
- `/health`, `/ready` and `/ping` behavior;
- Render logs around the incident;
- number of affected classes or attempts;
- follow-up action.
