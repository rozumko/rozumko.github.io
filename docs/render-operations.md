# Render Operations Runbook - Rozumko

_Updated: 2026-06-30_

The backend runs on Render from `backend/render.yaml`.

## Current Deployment Rules

- Render deploys the backend only after CI checks pass:
  `autoDeployTrigger: checksPass`.
- The backend health check path is `/health`.
- Live monitoring should use `/ping`, because it verifies database access.
- Required secrets are configured in Render environment variables, not in Git.

## Instance Count Rule

Keep the backend at one running instance while `RATE_LIMIT_STORE=memory`.

Reason:

- `RATE_LIMIT_STORE=memory` means `@fastify/rate-limit` uses in-process state.
- With multiple backend instances and no shared store, a client can receive a
  separate rate-limit bucket per instance.
- The current security model assumes one Render reverse-proxy hop and
  `trustProxy: 1`.
- Unsupported store values fail fast at startup; Redis/Valkey mode is reserved
  but not implemented yet.

Do not scale to multiple instances until one of these is true:

- a shared rate-limit store, such as Redis, is configured and tested; or
- the rate-limit design is explicitly re-audited and documented.

## Pre-Event Render Check

- [ ] The deployed commit is the intended commit.
- [ ] The latest Backend CI workflow passed.
- [ ] Render service is synced from `backend/render.yaml`.
- [ ] Environment variables are present: `DATABASE_URL`, `SUPABASE_URL`,
      `ATTEMPT_SECRET`, `NODE_ENV=production`, `RATE_LIMIT_STORE=memory`.
- [ ] Instance count is one.
- [ ] `/health` returns `{ "status": "ok" }`.
- [ ] `/ping` returns `{ "status": "ok", "db": "ok" }`.
- [ ] The service was warmed shortly before students start.

## If Backend Is Cold Or Slow

1. Hit `/ping` manually before the event window.
2. Wait for startup if Render is waking the service.
3. Confirm `/ping` returns `db: ok`.
4. Start the student flow only after the backend is warm.

For a larger pilot, prefer a paid instance over relying on cold-start timing.

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
- `/health` and `/ping` behavior;
- Render logs around the incident;
- number of affected classes or attempts;
- follow-up action.
