# Deployment Portability - Rozumko

_Updated: 2026-07-16_

This project should stay deployable on Render, a VPS, DigitalOcean, AWS
Lightsail or another standard Linux host without rewriting application logic.

## Current Production Shape

- Frontend: static Vite build on GitHub Pages, served on the custom domain
  `https://rozumko.com` (the `rozumko.github.io` origin stays valid). Both, plus
  `https://www.rozumko.com`, are in `CORS_ALLOWED_ORIGINS`
  (`backend/src/lib/security-config.ts`), and Supabase Auth redirect URLs and
  the email templates in `docs/auth-email-templates.md` point at
  `https://rozumko.com`. A domain change touches all three places at once.
- Backend: Node.js/Fastify service on Render
  (`https://rozumko-github-io.onrender.com`).
- Database: PostgreSQL through `DATABASE_URL`.
- Auth: Supabase Auth for teachers, admins and parents; children have no accounts.

## Portability Rules

- Keep provider-specific values in environment variables, not source code.
- Keep all database schema changes in Drizzle migrations.
- Keep all application table access behind the backend API.
- Keep frontend API/Auth endpoints configurable with `VITE_*` variables.
- Derive build-time CSP `connect-src` origins from the same `VITE_API_URL` and
  `VITE_SUPABASE_URL` values; do not add provider hosts only to source literals.
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

Valkey is included as the reference component for shared rate limiting. The
backend uses in-process rate limiting in the current deployment shape, so keep a
single backend replica unless the shared limiter path has been explicitly
enabled and tested.

Keep `RATE_LIMIT_STORE=memory` for this deployment shape. Setting another value
makes the backend fail fast at startup.

Before using the compose file, create an uncommitted `.env` next to it with at
least:

```bash
POSTGRES_PASSWORD=<strong-password>
SUPABASE_URL=https://<project-id>.supabase.co
ATTEMPT_SECRET=<64-hex-chars>
```

For a frontend move, set these build variables on the target host:

```bash
VITE_API_URL=https://api.example.com
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
```

The Vite build validates the two endpoint URLs and injects their origins into
the CSP. An invalid or non-HTTP(S) endpoint fails the build instead of shipping
a CSP that silently blocks authentication or API requests.

The service worker bypasses every cross-origin request rather than maintaining
a provider hostname allowlist. API, Auth and CDN responses therefore cannot be
silently cached when the frontend moves to a different host or URL prefix.

## Migration Checklist

Use `docs/vps-migration-checklist.md` for the step-by-step migration process.
At minimum, every provider move must prove:

- PostgreSQL backup and restore work on the target provider.
- `npm run db:migrate:prod` succeeds against the target database.
- `/health`, `/ready`, `/ping` and the student attempt smoke flow pass.
- CORS and CSP match the new frontend/backend domains.
- Monitoring and rollback are ready before production cutover.
