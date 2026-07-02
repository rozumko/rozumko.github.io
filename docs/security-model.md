# Security Model - Rozumko

_Updated: 2026-07-02_

> **Implementation status legend.**
>
> - **[IMPLEMENTED]** — enforced by code and covered by tests today.
> - **[PLANNED]** — required rules for features not built yet. They are
>   binding *when* the feature is built: the listed regression tests must land
>   **before** the feature code. Nothing enforces them today because the
>   feature does not exist.
>
> As of _2026-07-02_ the enforced surfaces are the **official olympiad flow**,
> **teacher/admin auth**, **School Mode** (self-serve missions and the
> anonymous classroom game), the **Home demo/lead slice** (consent-gated
> demo attempts and reports) and the **entitlement model** (backend access
> state, admin manual control, audit trail). **Payment provider integration
> (checkout, verified webhooks), AIG JSON-template generation and
> multi-client session rules are [PLANNED].**

## Core Rules

1. The browser is untrusted.
2. Official scoring happens only on the backend.
3. Official and demo answer keys never reach the browser.
4. Students have no accounts; official access is code-based.
5. JWT proves teacher identity, while the database decides role and status.
6. All database access goes through the backend API.
7. School Mode, Home Mode and Olympiad surfaces must not be linked by
   individual child identifiers or claim tokens unless the identity flow is
   explicit, parent-led and audited for that surface.
8. Payment state may unlock access, but it must not decide scoring.
9. AIG/client-generated variants must not become the authority for paid,
   official, diploma-generating or parent-reporting scores.

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

## Surface Data Boundaries — School **[IMPLEMENTED]**, Home **[PLANNED]**, Olympiad **[IMPLEMENTED]/[PLANNED]**

_The School side is enforced by the shipped classroom-game backend
(`/api/school`, `school-flow.test.ts`). The Home side is binding once Home
Mode is built._

School Mode is the low-risk classroom surface:

- no child personal data — a participant is an ephemeral session-scoped HMAC
  token, an avatar from a fixed allowlist and a free nickname label (control
  characters stripped, length capped, real names never required);
- no parent accounts or parent identifiers;
- no payments;
- no individual school-to-home claim tokens and no per-child recovery path
  (closing the tab ends the participant);
- answer keys never reach the browser (same sanitizer as olympiad questions)
  and scoring happens only on the server;
- one answer per participant per question, only for active sessions, only for
  questions issued to that session;
- a teacher sees only their own sessions and an anonymous leaderboard.

Home Mode is the parent-led commercial surface:

- parent consent is required before storing child progress;
- child profiles are created by the parent or responsible adult;
- individual reports and diplomas are based on Home Mode data, not imported
  from anonymous classroom sessions;
- paid access is checked by backend entitlement state.

Olympiad / Seasonal Events are event surfaces:

- official event attempts use code-based access today;
- future subscriber access must verify entitlement on the backend;
- one-off seasonal access must keep card data with the payment provider;
- event scoring remains server-side and separate from anonymous School
  session identity.

Do not build a flow where a classroom code, avatar, printed QR, child memory or
other school-session token becomes the way to recover a child's individual
result in a parent account.

## AIG Content Boundaries **[PLANNED]**

_No AIG JSON-template generation engine exists yet. Binding once it is built._

Automatic Item Generation may create many task variants from one item model,
but trust boundaries stay unchanged:

- public practice variants may expose local-feedback answer keys only when
  explicitly marked as practice;
- Home Demo, paid, official, diploma-generating or parent-reporting variants
  must keep answer evaluation on the backend;
- generated task versions used for reports or diplomas must be versioned enough
  to explain what the child completed;
- client-side generation, random seeds or cached task state must not be treated
  as trusted scoring evidence.

## Payment And Entitlement Boundaries — Entitlement **[IMPLEMENTED]**, Provider **[PLANNED]**

_The entitlement model is enforced by `home-entitlement.ts` and
`home-entitlement.test.ts` (migration 0018). Payment-provider rules are
binding once checkout/webhooks are built._

Payment card data must stay with the payment provider. Rozumko may store only
the minimum payment-provider references and entitlement state needed to grant or
revoke access.

Paid Home access is represented by backend entitlement state
(`active | past_due | canceled | expired | revoked`). `hasHomeAccess` is the
single decision point and fails closed: expired/revoked always block, a
missing period end blocks even `active`, `past_due` gets a bounded grace
window. Every status change writes an audit event with the actor
(`admin` today, `provider` for future webhooks). Payment callbacks or
webhooks must be verified before they change entitlement state and must go
through the same `applyEntitlementChange` path.

Entitlement state can unlock missions, reports, finals or diplomas. It must not
change answer keys, scoring rules or stored attempt answers — the entitlement
module is source-checked by a regression test to never touch scoring.

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
- No-code practice UIs load the static practice bundle from GitHub Pages.
  Home Demo uses `GET /api/questions` with `hideAnswers=true` and a track
  allowlist (`informatics`, `computational-thinking`, `ai-basics`) so keys do
  not reach the browser. Official olympiad questions are issued only by
  `POST /api/student/exchange-code`.
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

`backend/src/routes/school-flow.test.ts` protects the classroom-game
invariants:

- join responses strip answer keys (top-level and nested);
- scoring is server-side and one answer per question is enforced (409);
- answers without a valid participant token are rejected (403);
- questions not issued to the session are rejected (400);
- inactive sessions reject answers, and lobby sessions reject join without
  creating a participant (409);
- avatars outside the allowlist are rejected (400).

`backend/src/routes/home-flow.test.ts` protects the Home demo/lead slice
(see `docs/home-demo-contract.md`):

- demo-report without a stored lead/consent record is rejected and writes
  nothing (consent-gate);
- lead-token forgery is rejected, including attempt-domain tokens for the
  same UUID (HMAC domain separation);
- report scoring is recomputed server-side; client-submitted correctness
  fields are stripped before the handler and never stored;
- School session identifiers sent to `/api/home` are stripped, never stored;
- demo events are accepted only for practice-pool (`isOlympiad=false`)
  questions; responses expose no answer keys or explanations.

`backend/src/routes/home-entitlement.test.ts` protects the entitlement model
(written before the route code):

- expired and revoked entitlements block access even with a future period end;
- a missing period end fails closed for every status;
- `past_due` grace is bounded; `canceled` keeps access only until period end;
- entitlement reads require a valid lead token (403 otherwise);
- admin entitlement routes validate UUIDs before auth and require auth before
  any state change; every change writes an audit event;
- the entitlement module never touches scoring or answer keys (source check).

Remaining Home Mode security regression tests **[PLANNED]** (must land before
the corresponding feature code):

- payment callback/webhook verification before entitlement changes;
- Home Mode answer keys do not reach the browser for paid, demo report or
  diploma-generating missions;
- School Mode never exposes individual classroom results through a parent
  recovery path.

AIG/security regression tests **[PLANNED]** should cover before an AIG engine
is used for paid, official or diploma-generating flows:

- generated variants are tied to immutable item model/scoring versions;
- paid/official generated variants do not expose answer keys to the browser;
- server scoring recomputes or verifies the generated correct answer from
  trusted versioned data, not from client-submitted keys.

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
