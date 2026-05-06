# Architecture — MegaRozum

## Overview

MegaRozum is an olympiad platform for grades 1–4. The architecture prioritizes
portability over convenience: Supabase is used as the starting managed platform,
but no critical logic depends on Supabase-specific APIs.

## Stack

| Layer       | Technology                        | Notes                                      |
|-------------|-----------------------------------|--------------------------------------------|
| Frontend    | Vite + TypeScript + CSS           | No framework, plain TS components          |
| Backend     | Node.js + Fastify                 | All business logic lives here              |
| Database    | PostgreSQL (via Supabase)         | Can be replaced with any PostgreSQL        |
| ORM         | Drizzle ORM                       | Schema as source of truth, plain SQL migrations |
| Auth        | Supabase Auth                     | Teacher and admin only                     |
| Deployment  | Railway (start) → Docker/VPS      | See deployment section                     |

## Data flow

### Student (no account)

```
student.html
  ↓  POST /api/student/exchange-code   { code: "ABC123" }
Fastify backend
  ↓  validates code, creates attempt row
Supabase PostgreSQL
  ↓  returns attempt_token (short-lived JWT or signed ID)
student.html
  ↓  all subsequent requests carry attempt_token
  ↓  POST /api/attempt/:id/answer
  ↓  POST /api/attempt/:id/finish
Fastify backend   ← scores, validates, writes result
```

Students never touch Supabase directly. They have no Supabase Auth session.
An access code maps to exactly one olympiad + class. The backend creates the
attempt row and returns an opaque attempt token the student carries for the
duration of the session.

### Teacher

```
teacher.html
  ↓  Supabase Auth login (email/password or magic link)
  ↓  receives Supabase JWT
  ↓  GET /api/me   (Authorization: Bearer <jwt>)
Fastify backend
  ↓  verifies JWT signature (JWKS from Supabase)
  ↓  SELECT role, status FROM app_users WHERE auth_user_id = ?
  ↓  returns { id, email, role: "teacher", name }
teacher.html  ← renders UI based on /api/me response only
  ↓  all data requests go through backend API
Supabase PostgreSQL
```

### Admin

Same flow as Teacher. The `role` field returned by `/api/me` is `"admin"`.
Admin-only endpoints check `role === "admin"` server-side.

## Why all DB access goes through the backend

- The frontend cannot be trusted (browser, DevTools, intercepted requests).
- Direct Supabase table access from frontend means business logic lives in RLS
  policies — hard to test, hard to port, easy to misconfigure.
- Backend API = single entry point for all writes → easier audit, easier migration.
- When Supabase is replaced by another PostgreSQL, only the connection string
  changes. Frontend stays untouched.

## Authentication and authorization

Supabase Auth is used **only to prove identity** (who you are).
Authorization decisions (what you may do) are made by the backend.

```
Supabase Auth JWT  →  backend verifies signature
                   →  SELECT role, status FROM app_users
                   →  if status = 'blocked' → 403 regardless of JWT
                   →  return role to handler
```

Roles stored in JWT claims are **not used** for authorization decisions because
JWT claims can be stale (role changed, user blocked) until the token expires.
The database is always the source of truth for current role and status.

Frontend rule: never call `supabase.auth.getUser()` to make access decisions.
Always call `GET /api/me` and use the response.

## Student access codes

- A teacher generates a batch of codes for a specific olympiad session.
- Codes are stored in the `access_codes` table with: `code`, `olympiad_id`,
  `class_id`, `max_uses`, `used_count`, `expires_at`.
- `POST /api/student/exchange-code` validates the code and creates an `attempt`
  row. The backend returns an `attempt_token`.
- The `attempt_token` is a signed value (HMAC or short-lived JWT) that
  identifies the attempt. It is not a Supabase Auth token.
- The student carries `attempt_token` in memory only (not localStorage) to
  avoid cross-session reuse.

## Answer key and scoring

- Answer keys are stored in the database, never sent to the frontend.
- Scoring runs server-side in `POST /api/attempt/:id/finish`.
- The frontend sends raw answers; the backend compares against the key and
  writes the final score.
- No partial answer key is ever included in API responses.

## Portability guarantee

The codebase must remain portable. This means:

- No `supabase.from('table').insert(...)` in frontend business logic.
- No Supabase-specific SQL extensions in migrations (use standard PostgreSQL).
- No Supabase Edge Functions for critical olympiad logic (use Fastify handlers).
- Drizzle migrations are plain `.sql` files, runnable on any PostgreSQL.
- Environment variables abstract all provider URLs and keys.

To migrate from Supabase PostgreSQL to another provider:
1. Export data (`pg_dump`).
2. Update `DATABASE_URL` in environment.
3. Run `drizzle-kit migrate` against the new database.
4. Update Supabase Auth → replace with another JWT provider or own auth.
5. Frontend: zero changes.
