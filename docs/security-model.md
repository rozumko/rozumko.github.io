# Security Model - Rozumko

_Updated: 2026-06-02_

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

## Operational Security Checklist

- [x] Keep teacher self-registration enabled for the pilot with email
      confirmation, administrator approval and Turnstile bot protection.
- [ ] Maintain a private operational security checklist outside the public
      repository.
