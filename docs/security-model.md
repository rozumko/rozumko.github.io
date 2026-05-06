# Security Model — MegaRozum

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
| Student guessing codes         | Ukrainian-word format, max_uses per code (rate limiting — TODO) |
| Student replaying attemptId    | attemptId tied to attempt row, server checks status |
| Student submitting after time  | Backend checks attempt status on finish             |
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
5. Backend verifies the signature using Supabase JWKS endpoint.
6. Backend loads `role` and `status` from `app_users` table.
7. If `status = 'blocked'` → 403, regardless of valid JWT.
8. Handler receives verified `{ userId, role }` — never raw JWT claims.

### Student

1. Teacher generates access codes for an olympiad session.
2. Student enters a code on `student.html` (format: `КІТ247` — Ukrainian word + 3 digits).
3. `POST /api/student/exchange-code` validates:
   - format matches `/^([А-ЯҐЄІЇ]{2,5}\d{3}|\d{3}[А-ЯҐЄІЇ]{2,5})$/u`
   - code exists and is not expired (`expires_at`)
   - `used_count < max_uses`
4. Backend increments `used_count`, creates an `attempt` row.
5. Backend returns `{ attemptId, grade, questions }` (no answer keys).
6. Student uses `attemptId` in URL path for subsequent requests.
7. Frontend keeps `attemptId` in memory + localStorage backup (crash recovery).

---

## Authorization

### Endpoint protection matrix

| Endpoint                          | Student | Teacher | Admin |
|-----------------------------------|---------|---------|-------|
| POST /api/student/exchange-code   | ✓       | —       | —     |
| POST /api/attempt/:id/answer      | ✓ (own) | —       | —     |
| POST /api/attempt/:id/finish      | ✓ (own) | —       | —     |
| GET  /api/me                      | —       | ✓       | ✓     |
| GET  /api/teacher/olympiads       | —       | ✓ (own) | ✓     |
| POST /api/teacher/codes/generate  | —       | ✓ (own) | ✓     |
| GET  /api/teacher/results/:id     | —       | ✓ (own) | ✓     |
| GET  /api/admin/users             | —       | —       | ✓     |
| POST /api/admin/olympiad          | —       | —       | ✓     |

"Own" means the backend checks that the resource belongs to the requesting user.
A teacher cannot read another teacher's olympiad or results.

---

## Row Level Security (RLS)

RLS is a **defense-in-depth** layer, not the primary authorization mechanism.

Rules of thumb:
- Enable RLS on every table (Supabase warns if not).
- The `anon` role must have **no** write access to any table.
- The `service_role` key (used only by backend) bypasses RLS — keep it secret,
  never expose in frontend code or public repos.
- RLS policies should reflect the same rules as backend handlers, but simpler.
  If a policy becomes complex, it's a sign that logic belongs in the backend.

```sql
-- Example: students can never read the answers table directly
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
-- No policy = no access for anon/authenticated roles via Data API
```

---

## Sensitive data handling

| Data              | Where stored         | Sent to frontend?      |
|-------------------|----------------------|------------------------|
| Answer key        | `questions.correct` (DB) | Never                |
| Final score       | `attempts.score`     | Only after finish      |
| Student name      | not stored           | —                      |
| Teacher password  | Supabase Auth        | Never (Supabase manages) |
| `service_role` key| Server env var only  | Never                  |
| `anon` key        | Frontend env var     | Yes (public, read-only scope) |

---

## Rate limiting and abuse prevention

- `POST /api/student/exchange-code`: limit by IP, max 10 attempts per minute.
- `POST /api/attempt/:id/answer`: limit per `attempt_id`, not per IP.
- Access codes: configurable `max_uses` per code, hard expiry via `expires_at`.
- Backend rejects any attempt to submit answers after `started_at + time_limit`.

---

## What must never happen

- Frontend comparing `role === 'admin'` from a value it controls.
- `supabase.from('answers').select('*')` anywhere in frontend code.
- `service_role` key in any frontend file or committed to the repo.
- Answer validation logic in frontend JavaScript.
- Score calculation in frontend JavaScript.
- `attemptId` used to identify attempts — but it's an opaque UUID, no sensitive data.
