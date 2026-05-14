# Architecture — Rozumko

## Overview

Rozumko is an olympiad platform for grades 1–4. The architecture prioritizes
portability over convenience: Supabase is used as the starting managed platform,
but no critical logic depends on Supabase-specific APIs.

## Stack

| Layer       | Technology                        | Notes                                      |
|-------------|-----------------------------------|--------------------------------------------|
| Frontend    | Vite 6 + TypeScript + CSS         | No framework; всі файли .ts, нуль @ts-nocheck, нуль TS-помилок    |
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

- A teacher creates a class, registers it for an active olympiad event, and then
  generates participation codes for that specific registration.
- Codes are stored in the `access_codes` table with: `event_id`,
  `registration_id`, `code`, `grade`, `max_uses`, `used_count`, `expires_at`.
- `POST /api/student/exchange-code` validates the code and creates an `attempt`
  row. The backend returns `{ attemptId, attemptToken, grade, questions }`.
- `attemptToken` = `HMAC-SHA256(attemptId, ATTEMPT_SECRET)`. Усі наступні запити
  (`/answer`, `/finish`) вимагають заголовок `X-Attempt-Token`. Без токена — 403.
- Questions are sent to the frontend (without `correct` field).
- The student carries `attemptId` + `attemptToken` in memory (+ localStorage backup for crash recovery).
- No Supabase Auth involved for students at all.

## Validation modules (pure functions, no I/O)

Business rules are extracted into dedicated `*-validation.ts` files that can be
unit-tested without a database connection or network:

| File | Exports |
|------|---------|
| `routes/student-validation.ts` | `CODE_RE`, `normalizeCode`, `validateCodeFormat`, `generateAttemptToken`, `verifyAttemptToken`, `normalizeStudentLabel` |
| `routes/attempt-validation.ts` | `isQuestionInAttempt`, `scoreAttempt` |
| `routes/registration-validation.ts` | `assertRegistrationCanBeCancelled`, `normalizeRegistrationInput`, `assertEventCanAcceptRegistrations`, `assertEventCanIssueCodes` |
| `routes/event-validation.ts` | `normalizeEventInput`, `normalizeEventPatch`, `normalizeEventQuestionSelection`, `assertQuestionsBelongToGrade` |
| `routes/teacher-validation.ts` | `normalizeTeacherClassInput` |
| `lib/auth.ts` | `checkRole(userRole, required)` — pure role check, admin passes any requirement |

## Atomic operations

Two critical multi-step writes use `db.transaction()` to prevent race conditions:

### exchange-code
```
BEGIN
  UPDATE access_codes SET used_count = used_count + 1
  INSERT INTO attempts
  INSERT INTO attempt_questions (one row per question)
COMMIT
```

### cancel registration
```
BEGIN
  DELETE FROM access_codes WHERE registration_id = $id
  UPDATE event_registrations SET status = 'cancelled'
COMMIT
```

## Registration cancellation rules

`assertRegistrationCanBeCancelled` enforces:
- Event status must not be `active`, `finished`, or `archived`.
- Event `starts_at` must be in the future.
- No used codes exist for this registration (`used_count > 0` on any code).

Violation of any rule → `400 Bad Request` with a Ukrainian-language message.

## Startup environment check

On boot, the server validates that all required env vars are present:
```ts
const REQUIRED_ENV = ['DATABASE_URL', 'SUPABASE_JWT_ISSUER', 'ATTEMPT_SECRET']
```
Any missing variable → `process.exit(1)` with an explicit error message.

## Current olympiad event model

The olympiad flow is event-based. An admin creates an olympiad event with
start/end dates and a fixed question set per grade.

Core tables:

- `olympiad_events`: event metadata, dates, status, public/admin settings.
- `event_questions`: explicit question selection per event and grade.
- `attempt_questions`: immutable list of questions assigned to one attempt.
- `teacher_classes`: classes owned by a teacher.
- `class_students`: optional student labels per class (teacher-defined, max 60 chars,
  e.g. "Маша К." or "Учень 5"). Not full names — no PII obligation. Cascade-deleted
  with the class. CRUD via `/api/teacher/classes/:id/students` and `/api/teacher/students/:id`.
- `event_registrations`: teacher/class/participant registration for an event,
  without storing student names.
- `access_codes.registration_id`: links generated codes back to the registration
  that produced them.

Important rule: an official attempt must be reproducible after it starts. Even
if an admin edits the question bank later, the attempt keeps its original
question list through `attempt_questions`.

Teacher code generation is intentionally registration-based:

1. Admin creates and activates an event.
2. Admin selects event questions for each grade.
3. Teacher creates a class.
4. Teacher registers the class for the event with a participant count.
5. Codes are generated only for active, paid or payment-free registrations.
6. The UI shows how many codes already exist for each registration.

## Demo olympiad

Demo olympiad is a separate public scenario, not a sub-step after entering an
official access code. **Реалізовано.**

| Режим | Код | Питання | Результат |
|---|---|---|---|
| Тренування | ні | `isOlympiad=false`, будь-яка складність | не зберігається |
| Демо-олімпіада | ні | `isOlympiad=true`, `difficulty=hard` | не зберігається |
| Офіційна олімпіада | так (від вчителя) | фіксований набір події | зберігається на сервері |

Flow демо:
1. Учень натискає «Демо-олімпіада» на головному екрані (без коду).
2. Обирає клас (1–4).
3. Фронтенд викликає `GET /api/questions?grade=X&isOlympiad=true&difficulty=hard`.
4. Quiz запускається в режимі `demo` — таймер 10 хв, без пояснень, без збереження.
5. `correct` ніколи не повертається публічним endpoint — оцінювання лише в браузері (для неофіційного демо це прийнятно).

Після введення офіційного коду демо також доступне з `screen-actions` — там клас вже відомий з коду.

## Answer key and scoring

- Answer keys are stored in the database, never sent to the frontend.
- Public `GET /api/questions` never includes `correct` or `explanation` fields.
- Scoring runs server-side in `POST /api/attempt/:id/finish`.
- The frontend sends raw answers; the backend compares against the key and
  writes the final score.
- No partial answer key is ever included in API responses.
- Time limit: backend enforces 90-minute hard cap on `/finish` — expired attempts
  are auto-closed with score 0.

## Certificates and diplomas

Teacher-side feature. Generates a printable certificate in the browser without
storing student names on the server. **Реалізовано.**

Flow:
1. Teacher opens the Results tab → clicks «Сертифікат» on a result row.
2. A modal prompts for the student's name (not sent to backend).
3. A new browser window opens with a styled certificate.
4. `window.print()` triggers automatically — teacher saves as PDF or prints.

The student name exists only in the browser during the print session.

## Admin: teacher management

Admins can block and unblock teacher accounts. **Реалізовано.**

- `GET /api/admin/teachers` — list with `status` field (`active` | `blocked`).
- `PUT /api/admin/teachers/:id/status` — set status. Protected: cannot block own account.
- Blocked teachers receive 403 on every authenticated request (`requireAuth` checks `status`).
- UI: each teacher row has «Заблокувати» / «Розблокувати» button that updates on action.

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
