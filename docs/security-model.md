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
| Student   | Access code → attempt_token | Zero (anonymous)  |
| Teacher   | Supabase Auth JWT + /api/me | Low (verified ID) |
| Admin     | Supabase Auth JWT + /api/me | Medium (verified) |
| Anonymous | None                       | Zero               |

"Low" trust for teacher means: identity confirmed, but every request is still
validated against current role/status in the database.

### Attack surfaces

| Surface                        | Mitigation                                          |
|--------------------------------|-----------------------------------------------------|
| Student guessing codes         | Short window, rate limiting, max_uses per code      |
| Student replaying attempt_token| Token tied to attempt_id, server checks attempt state |
| Student submitting after time  | Backend checks `started_at + time_limit` on finish  |
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
2. Student enters a short alphanumeric code on `student.html`.
3. `POST /api/student/exchange-code` validates:
   - code exists and is not expired
   - `used_count < max_uses`
   - olympiad is currently active
4. Backend creates an `attempt` row with `status = 'in_progress'`.
5. Backend returns an `attempt_token` (HMAC-signed `attempt_id`).
6. Student uses `attempt_token` for all subsequent requests.
7. Backend verifies `attempt_token` on every request:
   - signature valid
   - attempt `status = 'in_progress'`
   - `started_at + time_limit > now()`

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
| Answer key        | `answers` table      | Never                  |
| Final score       | `attempts` table     | Only after finish      |
| Student name      | `attempts.metadata`  | Only to teacher/admin  |
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
- `attempt_token` stored in `localStorage` (use memory only).
