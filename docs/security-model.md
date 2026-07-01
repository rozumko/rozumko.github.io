# Security Model - Rozumko

_Updated: 2026-07-01_

> **Implementation status legend.**
>
> - **[IMPLEMENTED]** — enforced by code and covered by tests today.
> - **[PLANNED]** — required rules for features not built yet. They are
>   binding *when* the feature is built: the listed regression tests must land
>   **before** the feature code. Nothing enforces them today because the
>   feature does not exist.
>
> As of _2026-07-01_ the enforced surface is the **official olympiad flow** and
> **teacher/admin auth**. **Home Mode, payments/entitlement and multi-client
> session rules are [PLANNED].**

## Core Rules

1. The browser is untrusted.
2. Official scoring happens only on the backend.
3. Official and demo answer keys never reach the browser.
4. Students have no accounts; official access is code-based.
5. JWT proves teacher identity, while the database decides role and status.
6. All database access goes through the backend API.
7. School Mode and Home Mode must not be linked by individual child identifiers
   or claim tokens.
8. Payment state may unlock access, but it must not decide scoring.

## Student Attempt Protection

- Student access codes are validated and consumed atomically by the backend.
- Student access codes carry a TTL: they default to expiring at the event's
  `ends_at` and a teacher-supplied expiry is clamped to `ends_at`, so a code
  cannot outlive its event and the brute-force window stays bounded.
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

## School And Home Data Boundaries **[PLANNED]**

_Home Mode and an anonymous School backend are not implemented. These boundaries
are binding once those surfaces are built._

School Mode is the low-risk classroom surface:

- no child personal data;
- no parent accounts or parent identifiers;
- no payments;
- no individual school-to-home claim tokens;
- aggregate/class-level results only.

Home Mode is the parent-led surface:

- parent consent is required before storing child progress;
- child profiles are created by the parent or responsible adult;
- individual reports and diplomas are based on Home Mode data, not imported
  from anonymous classroom sessions;
- paid access is checked by backend entitlement state.

Do not build a flow where a classroom code, avatar, printed QR, child memory or
other school-session token becomes the way to recover a child's individual
result in a parent account.

## Payment And Entitlement Boundaries **[PLANNED]**

_No payment or entitlement code exists yet. Binding once payments are built._

Payment card data must stay with the payment provider. Rozumko may store only
the minimum payment-provider references and entitlement state needed to grant or
revoke access.

Paid Home access is represented by backend entitlement state. Payment callbacks
or webhooks must be verified before they change entitlement state.

Entitlement state can unlock missions, reports, finals or diplomas. It must not
change answer keys, scoring rules or stored attempt answers.

## Multi-Client Security Boundaries **[PLANNED]**

_Only the web/PWA client exists today. Binding once native/app clients or a
non-browser session strategy are built._

The website, PWA and any tablet/phone apps are untrusted clients.

Security rules must not depend on the client type:

- answer keys for paid, official or diploma-generating missions stay off the
  client;
- scoring happens on the backend;
- entitlement checks happen on the backend;
- consent state is stored and verified by the backend;
- a native app must not call Supabase tables directly;
- mobile clients need an audited session/token strategy.

Offline or cached app state may include only non-secret UI state or recovery
metadata. It must not include answer keys, payment authority or server-trusted
scores.

## HTTP Protections

Backend:

- CORS is restricted to approved origins.
- API requests are rate-limited.
- Rate limiting currently uses `RATE_LIMIT_STORE=memory`. **This is correct only
  on a single backend instance**: the counter lives in one process's memory, so
  running two or more instances silently multiplies the effective limit and lets
  clients bypass it by hitting different instances. The deploy is pinned to one
  instance (`numInstances: 1` in `backend/render.yaml`) and the backend logs
  `in-memory store active — requires a single backend instance` at startup.
  Horizontal scaling requires a shared store (Redis/Valkey) first. Unsupported
  store values also fail fast at startup so a multi-instance deploy cannot run
  with a false shared-limiter assumption.
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
- unsupported shared rate-limit store modes fail closed;
- public question query validation rejects unsafe values;
- public questions are filtered to `isOlympiad=false`;
- demo responses strip answer keys;
- critical UUID parameters fail with `400` before database access;
- attempt finalization rejects late answers and locks the attempt row while
  scoring saved answers;
- Render backend auto-deploy waits for CI checks.

Home Mode security regression tests **[PLANNED]** should cover (these must land
before any Home Mode feature code):

- payment callback verification before entitlement changes;
- expired entitlement blocks paid content;
- revoked entitlement blocks paid content;
- Home Mode answer keys do not reach the browser for paid or diploma-generating
  missions;
- School Mode never exposes individual classroom results through a parent
  recovery path.

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
- [ ] Render: keep one backend instance while `RATE_LIMIT_STORE=memory`.
- [ ] GitHub: protect `main` and require the Project CI backend/frontend jobs
      before merge.
- [ ] After backend deployment, run the security section in `docs/smoke-test.md`.
- [ ] Periodically remove stale pending teacher accounts.
- [ ] Maintain a private operational checklist for secrets, backups and incident
      contacts outside the public repository.
