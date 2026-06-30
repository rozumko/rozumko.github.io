# Architecture - Rozumko

_Updated: 2026-06-30_

## Overview

Rozumko is an online informatics olympiad and training platform for grades 1-4.
The frontend is static, while all database access and official scoring go through
the backend.

| Layer | Technology |
|---|---|
| Frontend | Vite 6, TypeScript, Vanilla JS, CSS |
| Backend | Node.js, Fastify v5, TypeScript |
| Database | PostgreSQL on Supabase, Drizzle ORM |
| Auth | Supabase Auth for teachers and admins only |
| Hosting | GitHub Pages frontend, Render backend |

## Student Modes

| Mode | Code | Questions | Scoring |
|---|---|---|---|
| Practice | No | `isOlympiad=false` | Local feedback; answer keys are intentionally returned |
| Demo | No | Practice pool, `difficulty=hard` | No score; answer keys stay hidden |
| Official olympiad | Yes | Fixed event selection | Server-side only |

### Official olympiad flow

```text
olympiad-enter.html
  -> GET /api/student/validate-code?code=...
  -> student reads rules and confirms
  -> POST /api/student/exchange-code
  -> sessionStorage.pendingOlympiad
  -> student.html
  -> POST /api/attempt/:id/answer
  -> POST /api/attempt/:id/finish
```

`exchange-code` consumes the code atomically, creates an attempt and records its
question IDs in `attempt_questions`. It returns a stateless HMAC attempt token.
Every subsequent answer or finish request requires `X-Attempt-Token`.

For a personal code (`max_uses = 1`), entering the code again resumes an
unfinished attempt after F5 or a closed tab. The browser stores only recovery
metadata in `localStorage`; it does not store the token or personal code there.
Shared codes intentionally cannot resume an old attempt because a code does not
identify a specific child.

The deadline is the earlier of:

```text
attempt.started_at + event.time_minutes
event.ends_at
```

After the deadline, late answers are rejected and already saved answers are
graded. The attempt becomes `finished`.

Finalization runs inside a database transaction and locks the attempt row while
saved answers are scored, so a concurrent late `/answer` cannot change the
result after `/finish` has started.

## Teacher And Admin Auth

The frontend calls Supabase Auth endpoints for signup, login and logout, then
sends `Authorization: Bearer <jwt>` to the backend. The backend verifies the
Supabase JWT with JWKS and loads the current `role` and `status` from `app_users`.

Frontend authorization decisions use `GET /api/teacher/me`. JWT claims are never
trusted for role or account status.

New Supabase users are provisioned in `app_users` as `teacher` with
`status = 'pending'`. An admin must activate the account.

## Question Model

Supported types:

| Type | Answer key |
|---|---|
| `choice` | `correct` index |
| `truefalse` | `correct` index: `0` yes, `1` no |
| `sequence` | `correct` choice index |
| `sort` | `options.correctOrder` |
| `match` | `options.pairs` |
| `input` | `options.answer` |

Official and demo responses strip every answer key, including keys nested inside
`options`. Official scoring is performed by the backend.

## Event Integrity

An official event has `starts_at`, `ends_at`, `time_minutes`,
`questions_count`, status and an explicit question selection per grade.

To keep conditions fair:

- event timing, count and question selection are locked while an event is active
  or has unfinished attempts;
- a question cannot be edited or deleted after it was issued to a student;
- a question selected for an active event cannot be edited or deleted;
- `attempt_questions` preserves the question list issued to an attempt.

## Key Tables

- `questions`
- `olympiad_events`
- `event_questions`
- `access_codes`
- `attempts`
- `attempt_questions`
- `app_users`
- `teacher_classes`
- `class_students`
- `event_registrations`

## Deployment

- Frontend: `.github/workflows/deploy.yml` builds `dist/` and deploys GitHub Pages.
- Project CI: `.github/workflows/backend-ci.yml` checks frontend and backend.
- Backend hosting: `backend/render.yaml`.
- Render waits for CI checks before backend auto-deploy.
- Required backend env: `DATABASE_URL`, `SUPABASE_URL`, `ATTEMPT_SECRET`.
- Health checks: `GET /health` and database-aware `GET /ping`.

## Known MVP Limitations

- Frontend JWT refresh is not automatic; an expired teacher session requires login.
- Rate limiting is in process memory and is suitable only for one Render instance.
- Database backup and restore must be configured operationally.
- Browser E2E coverage is still missing.
