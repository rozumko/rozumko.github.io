# VPS Migration Checklist - Rozumko

_Updated: 2026-06-30_

Use this checklist when moving the backend and PostgreSQL from the current
hosted setup to a VPS, DigitalOcean Droplet, AWS Lightsail instance or another
standard Linux server.

This is not a same-day live-event procedure. Do the first migration on staging,
then repeat the exact steps for production during a quiet window.

## Phase 0 - Decide The Target

- [ ] Choose the provider, region and server size.
- [ ] Confirm the server has enough CPU, RAM, NVMe/SSD and bandwidth for the
      planned peak.
- [ ] Decide whether PostgreSQL runs on the same server or on a managed service.
- [ ] Decide whether frontend stays on GitHub Pages/Cloudflare Pages.
- [ ] Confirm who can access the provider account, DNS and server SSH.

## Phase 1 - Prepare The Server

- [ ] Install OS security updates.
- [ ] Create a non-root deployment user.
- [ ] Disable password SSH login and require SSH keys.
- [ ] Enable a firewall with only SSH, HTTP and HTTPS open publicly.
- [ ] Install Docker and the compose plugin if using the compose reference.
- [ ] Configure time sync.
- [ ] Configure disk, CPU and memory monitoring.

## Phase 2 - Prepare Secrets

Create an uncommitted server-side `.env` file. Do not paste secrets into Git,
public issues, screenshots or chat.

Required backend values:

- [ ] `DATABASE_URL`
- [ ] `SUPABASE_URL`
- [ ] `ATTEMPT_SECRET`
- [ ] `NODE_ENV=production`
- [ ] `RATE_LIMIT_STORE=memory`

If using `docker-compose.example.yml`:

- [ ] `POSTGRES_PASSWORD`
- [ ] `SUPABASE_URL`
- [ ] `ATTEMPT_SECRET`

Keep `RATE_LIMIT_STORE=memory` until Redis/Valkey-backed rate limiting is
implemented and tested.

## Phase 3 - Restore Data To Staging

- [ ] Take or identify a fresh source PostgreSQL backup.
- [ ] Restore it into a non-production target database.
- [ ] Run migrations against the target database.
- [ ] Verify `/ping` returns `db: ok`.
- [ ] Verify admin can see events.
- [ ] Verify teacher/admin results routes return without `500`.
- [ ] Verify a known event has expected question assignments.

Use `docs/backup-restore.md` for dump/restore details.

## Phase 4 - Deploy The Backend

- [ ] Build the backend image from `./backend`.
- [ ] Start the backend with production env values.
- [ ] Run `npm run db:migrate:prod` from the built backend environment.
- [ ] Confirm `/health` returns `{ "status": "ok" }`.
- [ ] Confirm `/ping` returns `{ "status": "ok", "db": "ok" }`.
- [ ] Confirm logs do not print secrets.
- [ ] Confirm restart policy is enabled.

## Phase 5 - Point Frontend And Domains

- [ ] Choose the backend API URL.
- [ ] Update frontend `VITE_API_URL` for the target deployment.
- [ ] Re-check backend CORS allowed origins.
- [ ] Re-check production CSP `connect-src` in `vite.config.ts`.
- [ ] Update DNS only after staging smoke passes.
- [ ] Keep the previous backend available until rollback is no longer needed.

## Phase 6 - Smoke Test

- [ ] Run the deployment section of `docs/smoke-test.md`.
- [ ] Validate one wrong student code.
- [ ] Validate one correct personal code.
- [ ] Save at least one answer.
- [ ] Finish the attempt and verify score response.
- [ ] Verify teacher/admin results show the attempt.
- [ ] Verify `/api/attempt/:id/answer` without `X-Attempt-Token` returns `403`.
- [ ] Verify monitoring alerts reach the operator.

## Phase 7 - Production Cutover

- [ ] Announce a quiet migration window.
- [ ] Take a final pre-cutover backup.
- [ ] Restore or sync production data to the target database.
- [ ] Run migrations.
- [ ] Deploy backend.
- [ ] Switch frontend/API DNS or env.
- [ ] Run the smoke test again.
- [ ] Watch logs, `/ping`, CPU, memory and disk for at least 30 minutes.

## Rollback Rule

Keep rollback simple:

- [ ] Previous backend URL is still known.
- [ ] Previous database is not deleted.
- [ ] Frontend can be pointed back to the previous API URL.
- [ ] A backup from immediately before cutover exists.

Rollback first, investigate second, if students or teachers are actively
blocked during a live window.
