# Deployment Portability - Rozumko

_Updated: 2026-06-30_

This project should stay deployable on Render, a VPS, DigitalOcean, AWS
Lightsail or another standard Linux host without rewriting application logic.

## Current Production Shape

- Frontend: static Vite build on GitHub Pages.
- Backend: Node.js/Fastify service on Render.
- Database: PostgreSQL through `DATABASE_URL`.
- Auth: Supabase Auth for teachers/admins only.

## Portability Rules

- Keep provider-specific values in environment variables, not source code.
- Keep all database schema changes in Drizzle migrations.
- Keep all application table access behind the backend API.
- Keep frontend API/Auth endpoints configurable with `VITE_*` variables.
- Keep backend startup compatible with `PORT` and `NODE_ENV=production`.

## Backend Container

`backend/Dockerfile` builds the backend into a production Node image.

Build context:

```bash
docker build -t rozumko-backend ./backend
```

Required runtime environment:

- `DATABASE_URL`
- `SUPABASE_URL`
- `ATTEMPT_SECRET`
- `PORT` (optional, defaults to `3000`)

Run migrations from a built image with:

```bash
npm run db:migrate:prod
```

## Compose Reference

`docker-compose.example.yml` is a VPS reference topology:

- `backend`
- `postgres`
- `valkey`

Valkey is included for future shared rate limiting. The current backend still
uses in-process rate limiting, so do not scale multiple backend replicas until a
shared limiter is implemented and tested.

Keep `RATE_LIMIT_STORE=memory` until Redis/Valkey-backed rate limiting is added
in code. Setting another value currently makes the backend fail fast at startup.

Before using the compose file, create an uncommitted `.env` next to it with at
least:

```bash
POSTGRES_PASSWORD=<strong-password>
SUPABASE_URL=https://<project-id>.supabase.co
ATTEMPT_SECRET=<64-hex-chars>
```

## Migration Checklist

Use `docs/vps-migration-checklist.md` for the step-by-step migration process.
At minimum, every provider move must prove:

- PostgreSQL backup and restore work on the target provider.
- `npm run db:migrate:prod` succeeds against the target database.
- `/health`, `/ping` and the student attempt smoke flow pass.
- CORS and CSP match the new frontend/backend domains.
- Monitoring and rollback are ready before production cutover.
