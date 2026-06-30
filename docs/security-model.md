# Security Model - Rozumko

_Updated: 2026-06-30_

## Core Rules

1. The browser is untrusted.
2. Official scoring happens only on the backend.
3. Official and demo answer keys never reach the browser.
4. Students have no accounts; official access is code-based.
5. JWT proves teacher identity, while the database decides role and status.
6. All database access goes through the backend API.

## Student Attempt Protection

- Student access codes are validated and consumed atomically by the backend.
- Sensitive student endpoints are rate-limited.
- Active attempts use server-verified tokens.
- Finishing an official attempt returns only the aggregate result, never
  per-question correctness.
- After the server deadline, late answers are rejected and saved answers are graded.

For crash recovery, the browser stores only non-secret attempt metadata.

## Answer-Key Handling

| Mode | Key handling |
|---|---|
| Practice | Returns keys intentionally for local feedback |
| Demo | Strips top-level and nested keys |
| Official attempt | Strips top-level and nested keys |
| Official result | Returns only the aggregate score |
| Teacher/admin results | Excludes raw `answers` |

Nested answer keys are stripped for structured question types.

## Teacher And Admin Authorization

1. Supabase Auth returns a JWT after signup or login.
2. The backend verifies the JWT before handling protected requests.
3. The database decides the user's role and status.
4. New teachers remain pending until an administrator approves them.
5. Pending and blocked users cannot access protected teacher features.
6. Admin routes additionally require the admin role.

The frontend limits third-party scripts around authenticated flows. Keep
avoiding unsafe HTML interpolation.

## Database And RLS

The backend is the only component that accesses application tables. Row Level
Security is enabled for application data. No frontend code may call Supabase
Data API tables directly.

## HTTP Protections

Backend:

- CORS is restricted to approved origins.
- API requests are rate-limited.
- Render adds one reverse-proxy hop. Fastify must use `trustProxy: 1`, never
  `trustProxy: true`, so clients cannot spoof `X-Forwarded-For` and bypass
  rate limits.
- `GET /api/questions` is practice-only. Official olympiad questions are issued
  only by `POST /api/student/exchange-code`.
- Public question query parameters are allowlisted. `count` must be an integer
  from `1` to `50`.
- UUID request parameters are validated before database access.
- Production errors do not expose stack traces.
- Security headers include HSTS, MIME sniffing protection, framing protection
  and a restrictive referrer policy.

Frontend production build:

- CSP is injected by `vite.config.ts`.
- Normal pages allow scripts only from the application origin.
- The teacher registration page loads the Turnstile widget lazily only for the
  unauthenticated registration flow.
- Inline handlers are not allowed on normal pages.
- The static offline page has a narrow documented exception for its offline script.

## Automated Change Gates

Every pull request and every push to `main` runs `.github/workflows/backend-ci.yml`.
It must pass before merge:

```bash
npm run typecheck
npm test
npm run build

cd backend
npm run build
npm test
```

`backend/src/security-regression.test.ts` protects the audited invariants:

- spoofed `X-Forwarded-For` does not create a fresh rate-limit bucket;
- public question query validation rejects unsafe values;
- public questions are filtered to `isOlympiad=false`;
- demo responses strip answer keys;
- critical UUID parameters fail with `400` before database access;
- attempt finalization rejects late answers and locks the attempt row while
  scoring saved answers;
- Render backend auto-deploy waits for CI checks.

GitHub Pages also runs frontend typecheck, tests and build inside its deployment
workflow. Render Blueprint uses `autoDeployTrigger: checksPass`.

## Operational Security Checklist

- [x] Keep teacher self-registration enabled for the pilot with email
      confirmation, administrator approval and Turnstile bot protection.
- [ ] Supabase Auth -> Bot and Abuse Protection: Turnstile is enabled and
      enforced for signup.
- [ ] Supabase Auth -> Rate Limits: review password login and signup limits.
- [ ] Render: backend service is synced from `backend/render.yaml` and deploys
      only after CI checks pass.
- [ ] Render: keep one backend instance while rate limiting is process-local.
- [ ] GitHub: protect `main` and require the Project CI backend/frontend jobs
      before merge.
- [ ] After backend deployment, run the security section in `docs/smoke-test.md`.
- [ ] Periodically remove stale pending teacher accounts.
- [ ] Maintain a private operational checklist for secrets, backups and incident
      contacts outside the public repository.
