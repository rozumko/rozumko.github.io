# Security Model - Rozumko

_Updated: 2026-05-31_

## Core Rules

1. The browser is untrusted.
2. Official scoring happens only on the backend.
3. Official and demo answer keys never reach the browser.
4. Students have no accounts; official access is code-based.
5. JWT proves teacher identity, while the database decides role and status.
6. All database access goes through the backend API.

## Student Attempt Protection

- Code format: Ukrainian word plus three or four digits, in either order
  (new codes use four digits; three-digit codes remain valid for backward
  compatibility). Cyrillic letters and digits only.
- `GET /api/student/validate-code`: read-only pre-check, rate-limited to 20/min/IP.
- `POST /api/student/exchange-code`: consumes the code atomically, rate-limited to 10/min/IP.
- `attemptToken = HMAC-SHA256(attemptId, ATTEMPT_SECRET)`.
- `/api/attempt/:id/answer` and `/api/attempt/:id/finish` require
  `X-Attempt-Token`.
- `/finish` returns only `{ score, total }`, never per-question correctness.
- After the server deadline, late answers are rejected and saved answers are graded.

For crash recovery, `localStorage` contains only non-secret attempt metadata.
The token and personal code are not stored there. A student resumes a personal
attempt by entering the physical code again.

## Answer-Key Handling

| Endpoint or mode | Key handling |
|---|---|
| Practice `GET /api/questions?isOlympiad=false` | Returns keys intentionally for local feedback |
| Demo `GET /api/questions?isOlympiad=true` | Strips top-level and nested keys |
| Official `exchange-code` | Strips top-level and nested keys |
| Official `/finish` | Returns only `{ score, total }` |
| Teacher/admin results | Excludes raw `answers` |

Nested keys are stripped for `sort.correctOrder`, `match.pairs` and
`input.answer`.

## Teacher And Admin Authorization

1. Supabase Auth returns a JWT after signup or login.
2. Backend verifies it against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
   with `ES256` only.
3. Backend loads `role` and `status` from `app_users`.
4. Missing users are provisioned as `teacher`, `status = 'pending'`.
5. `pending` and `blocked` users receive `403`.
6. Admin routes additionally require `role = 'admin'`.

The frontend stores teacher session tokens in `localStorage`. This is an MVP
tradeoff: CSP and restricted external scripts reduce XSS risk, but an XSS flaw
could still expose the teacher token. Keep avoiding unsafe HTML interpolation.

## Database And RLS

The backend connects using `DATABASE_URL`. The public Supabase anon key appears
in frontend code only for Supabase Auth requests.

RLS is enabled on all current public application tables. This was verified
against Supabase on 2026-05-31:

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

Keep RLS enabled on every new table. No frontend code may call Supabase Data API
tables directly.

## HTTP Protections

Backend:

- CORS allows only `https://rozumko.github.io` and local Vite origins.
- Global rate limit: 100 requests/min/IP.
- `trustProxy: true` is enabled for Render.
- Production errors do not expose stack traces.
- Security headers include `nosniff`, `DENY` framing and `no-referrer`.

Frontend production build:

- CSP is injected by `vite.config.ts`.
- `script-src 'self'`.
- Inline handlers are not allowed on normal pages.
- `offline.html` has a narrower documented exception for its offline script.

## Operational Security Checklist

- [ ] Decide whether public Supabase signup stays enabled for the pilot.
- [ ] Configure PostgreSQL backups, retention and a restore test.
- [ ] Monitor `GET /ping`.
- [ ] Keep Render at one instance until rate limiting uses shared storage.
- [ ] Add audit logging for admin mutations before a paid launch.
- [ ] Update CORS and CSP before adding a custom domain.
- [ ] Treat `ATTEMPT_SECRET` rotation as an incident operation: rotation invalidates active attempts.
