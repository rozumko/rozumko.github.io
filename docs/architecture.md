# Architecture — MegaRozum

## Overview

MegaRozum is an olympiad platform for grades 1–4. The architecture prioritizes
portability over convenience: Supabase is used as the starting managed platform,
but no critical logic depends on Supabase-specific APIs.

## Stack

| Layer       | Technology                        | Notes                                      |
|-------------|-----------------------------------|--------------------------------------------|
| Frontend    | Vite 6 + TypeScript + CSS         | No framework; всі файли .ts (entry points мають @ts-nocheck — TODO) |
| Backend     | Node.js + Fastify v5 + TypeScript | All business logic lives here              |
| Database    | PostgreSQL (via Supabase)         | Can be replaced with any PostgreSQL        |
| ORM         | Drizzle ORM                       | Schema as source of truth, plain SQL migrations |
| Auth        | Supabase Auth                     | Teacher and admin only                     |
| Deployment  | GitHub Pages (frontend) + Render (backend) | GitHub Actions CI/CD             |

## Data flow

### Student (no account)

```
student.html
  ↓  POST /api/student/exchange-code   { code: "ABC123" }
Fastify backend
  ↓  validates code, creates attempt row
Supabase PostgreSQL
  ↓  returns attemptId (opaque UUID)
student.html
  ↓  all subsequent requests carry attemptId in URL path
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
- Codes are stored in the `access_codes` table with: `code`, `grade`,
  `max_uses`, `used_count`, `expires_at`.
- `POST /api/student/exchange-code` validates the code and creates an `attempt`
  row. The backend returns `{ attemptId, grade, questions }`.
- Questions are sent to the frontend (without `correct` field).
- The student carries `attemptId` in memory (+ localStorage backup for crash recovery).
- No Supabase Auth involved for students at all.

## Target olympiad event model

The current MVP has access codes and attempts, but the target product model is
event-based. An admin creates an olympiad event with start/end dates and a fixed
question set per grade.

Planned tables:

- `olympiad_events`: event metadata, dates, status, public/admin settings.
- `event_questions`: explicit question selection per event and grade.
- `attempt_questions`: immutable list of questions assigned to one attempt.
- `teacher_classes`: classes owned by a teacher.
- `event_registrations`: teacher/class/participant registration for an event,
  without storing student names.

Important rule: an official attempt must be reproducible after it starts. Even
if an admin edits the question bank later, the attempt keeps its original
question list through `attempt_questions`.

## Demo olympiad

Demo olympiad is a separate public scenario, not a sub-step after entering an
official access code.

- Practice: no code, class + difficulty, explanations allowed.
- Demo olympiad: no code, hard questions for the selected grade, no official result.
- Official olympiad: access code required, server-side scoring, official result.

If demo mode imitates olympiad behavior, the backend must not include answer
keys in the response. Use a dedicated demo endpoint or a demo attempt flow
instead of reusing public practice responses with answer keys.

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
