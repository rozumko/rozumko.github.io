# Security Model — Rozumko

## Core principles

1. **The client is not trusted.** Any value arriving from the browser is
   untrusted input: request body, headers, cookies, query params.
2. **The backend is the single source of truth** for all olympiad state.
3. **Students have no accounts.** Access is code-based, not identity-based.
4. **Answer keys never leave the server.**
5. **Final scores are calculated server-side only.**
6. **JWT proves identity; the database decides rights.**

---

## Threat model

### Who can interact with the system

| Actor     | Access method              | Trust level        |
|-----------|----------------------------|--------------------|
| Student   | Access code → attemptId    | Zero (anonymous)   |
| Teacher   | Supabase Auth JWT + /api/me | Low (verified ID) |
| Admin     | Supabase Auth JWT + /api/me | Medium (verified) |
| Anonymous | None                       | Zero               |

"Low" trust for teacher means: identity confirmed, but every request is still
validated against current role/status in the database.

### Attack surfaces

| Surface                        | Mitigation                                          |
|--------------------------------|-----------------------------------------------------|
| Student guessing codes         | Ukrainian-word format, max_uses per code, rate limit 10 req/min per IP |
| Student replaying attemptId    | `X-Attempt-Token` (HMAC) required — knowing UUID is not enough |
| Student submitting after time  | Backend enforces 90-min hard limit on `/finish`; auto-closes expired attempt |
| Teacher accessing another class| Backend checks `teacher_id` ownership on every request |
| JWT with stale role            | Role re-fetched from DB on every authenticated request |
| Direct Supabase table access   | RLS enabled on all tables; anon key has no write access |
| Answer key extraction          | Never included in any API response                  |
| Score manipulation             | Score written only by backend on finish             |
| CSRF                           | SameSite cookies or Authorization header (not cookies) |
| XSS → token theft              | attempt_token in memory only, not localStorage      |

---

## Authentication

### Teacher / Admin

1. User logs in via Supabase Auth (email + password or magic link).
2. Supabase returns a JWT signed with the project's secret.
3. Frontend stores the JWT (Supabase SDK handles refresh automatically).
4. Every API request sends `Authorization: Bearer <jwt>`.
5. Backend verifies the signature using Supabase JWKS endpoint (`jose` library,
   algorithm explicitly restricted to `ES256` — prevents `alg:none` and HMAC downgrade attacks).
6. Backend loads `role` and `status` from `app_users` table.
7. If `status = 'blocked'` → 403, regardless of valid JWT.
8. Handler receives verified `{ userId, role }` — never raw JWT claims.

### Student

Two-step entry flow to prevent code consumption before the student has read the rules:

1. Teacher creates a class and registers it for an active olympiad event.
2. Teacher generates access codes for that registration.
3. Student opens `olympiad-enter.html` and enters a code (format: `КІТ247` — Ukrainian word + 3 digits).
4. **Step 1 — validate:** `GET /api/student/validate-code?code=XXX` (rate-limit: 20/min):
   - format validates against `/^([А-ЯҐЄІЇ]{2,5}\d{3}|\d{3}[А-ЯҐЄІЇ]{2,5})$/u`
   - code exists and is not expired (`expires_at`)
   - `used_count < max_uses`
   - code has an active `event_id`
   - event status allows participation
   - returns `{ eventTitle, grade }` — does NOT increment `used_count`
5. Student reads the rules on the page and checks the agreement checkbox.
6. **Step 2 — exchange:** `POST /api/student/exchange-code` validates again (atomically) and:
   - increments `used_count` inside a transaction (`WHERE used_count < max_uses`)
   - creates an `attempt` row
   - records the immutable question list in `attempt_questions`
   - returns `{ attemptId, attemptToken, grade, questions }` (no answer keys)
   - `attemptToken = HMAC-SHA256(attemptId, ATTEMPT_SECRET)` — stateless, no DB column needed.
7. Frontend stores the result in `sessionStorage`, redirects to `student.html`.
8. `student.html` reads `sessionStorage`, starts the quiz, clears `sessionStorage`.
9. Student sends `X-Attempt-Token` header on every subsequent request (`/answer`, `/finish`).
   Without a valid token → 403, even if `attemptId` is known.
10. Frontend keeps `attemptId` + `attemptToken` in memory + localStorage backup (crash recovery).

---

## Authorization

### Endpoint protection matrix

| Endpoint                          | Student | Teacher | Admin |
|-----------------------------------|---------|---------|-------|
| GET  /api/student/validate-code   | ✓       | —       | —     |
| POST /api/student/exchange-code   | ✓       | —       | —     |
| POST /api/attempt/:id/answer      | ✓ (own) | —       | —     |
| POST /api/attempt/:id/finish      | ✓ (own) | —       | —     |
| GET  /api/me                      | —       | ✓       | ✓     |
| GET  /api/teacher/olympiads       | —       | ✓ (own) | ✓     |
| GET  /api/teacher/classes         | —       | ✓ (own) | ✓     |
| POST /api/teacher/classes         | —       | ✓ (own) | ✓     |
| GET  /api/teacher/registrations   | —       | ✓ (own) | ✓     |
| POST /api/teacher/registrations   | —       | ✓ (own) | ✓     |
| POST /api/teacher/codes/generate  | —       | ✓ (own registration) | ✓ |
| GET  /api/teacher/results/:id     | —       | ✓ (own) | ✓     |
| GET  /api/admin/users             | —       | —       | ✓     |
| POST /api/admin/olympiad          | —       | —       | ✓     |

"Own" means the backend checks that the resource belongs to the requesting user.
A teacher cannot read another teacher's olympiad or results.

---

## Row Level Security (RLS)

RLS is a **defense-in-depth** layer, not the primary authorization mechanism.

> ⚠️ **Пріоритет:** кожна нова таблиця в Supabase мусить мати `ENABLE ROW LEVEL SECURITY`
> одразу після міграції. Без цього `anon` ключ (публічний) дає прямий доступ до даних
> в обхід бекенду. Детальний чеклист — у `docs/migrations.md`.

Rules of thumb:
- Enable RLS on every table immediately after migration.
- No policies needed — zero policies means zero access for `anon`/`authenticated` via Data API.
- The `anon` role must have **no** read or write access to any table.
- The `service_role` key (used only by backend) bypasses RLS — keep it secret,
  never expose in frontend code or public repos.
- RLS policies should reflect the same rules as backend handlers, but simpler.
  If a policy becomes complex, it's a sign that logic belongs in the backend.

```sql
-- Вмикаємо RLS — без policy = anon не має доступу
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
-- service_role (бекенд) обходить RLS автоматично
```

**Поточний стан таблиць (2026-05-13):** RLS увімкнено на всіх 10 таблицях ✅.
(`class_students` — увімкнено при створенні через «Run and enable RLS» в Supabase SQL Editor)

---

## Sensitive data handling

| Data              | Where stored         | Sent to frontend?      |
|-------------------|----------------------|------------------------|
| Answer key        | `questions.correct` (DB) | Never                |
| Final score       | `attempts.score`     | Only after finish      |
| Student name      | not stored           | —                      |
| Certificate name  | browser memory only  | Not sent to backend    |
| Teacher password  | Supabase Auth        | Never (Supabase manages) |
| `service_role` key| Server env var only  | Never                  |
| `anon` key        | Frontend env var     | Yes (public, read-only scope) |

---

## Certificates and diplomas

Certificates and diplomas do not store student names on the server. **Реалізовано.**

Flow:

1. Teacher opens a result row → clicks «Сертифікат».
2. Modal prompts for student name (browser only, not sent anywhere).
3. Certificate renders in a new window → `window.print()` → PDF or paper.
4. The name is not sent to the backend and is not saved in the database.

This keeps official participation data useful while avoiding a stored list of
children's personal names. If a teacher needs to regenerate a certificate later,
they enter the name again.

---

## Backup and recovery

Local quiz backup in the browser protects against short-term crashes during an
active attempt, but it is not a database backup.

Production data requires a separate backup process:

- scheduled PostgreSQL export (`pg_dump` or provider equivalent);
- encrypted backup storage;
- retention policy;
- documented restore procedure;
- periodic restore test on a non-production database.

A backup is considered valid only after a successful restore test.

---

## HTTP security headers

Fastify `onSend` hook додає до кожної відповіді:

| Header                             | Value          | Призначення                        |
|------------------------------------|----------------|------------------------------------|
| `X-Content-Type-Options`           | `nosniff`      | Забороняє MIME-sniffing            |
| `X-Frame-Options`                  | `DENY`         | Захист від clickjacking            |
| `Referrer-Policy`                  | `no-referrer`  | Не передає Referer третім сторонам |
| `X-Permitted-Cross-Domain-Policies`| `none`         | Блокує Flash/PDF cross-domain      |

Production error handler: `500` відповіді повертають лише `{ error: 'Внутрішня помилка сервера' }` — stack traces та внутрішні повідомлення логуються, але не витікають у відповідь.

---

## Rate limiting and abuse prevention

- Глобально: 100 запитів / хвилину з однієї IP (`@fastify/rate-limit`).
- `GET /api/student/validate-code`: 20 запитів / хвилину з однієї IP.
- `POST /api/student/exchange-code`: 10 запитів / хвилину з однієї IP. При перевищенні — `429 Too Many Requests`.
- Access codes: configurable `max_uses` per code, hard expiry via `expires_at`.
- CORS: дозволено лише `https://rozumko.github.io`, `localhost:5173`, `localhost:4173`.

---

## What must never happen

- Frontend comparing `role === 'admin'` from a value it controls.
- `supabase.from('answers').select('*')` anywhere in frontend code.
- `service_role` key in any frontend file or committed to the repo.
- Answer validation logic in frontend JavaScript.
- Score calculation in frontend JavaScript.
- `attemptId` used to identify attempts — but it's an opaque UUID, no sensitive data.
- Student first names or last names stored for certificates/diplomas.
