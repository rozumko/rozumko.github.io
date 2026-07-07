# Security Model - Rozumko

_Updated: 2026-07-07_

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
> demo attempts and reports), the **entitlement model** (backend access state,
> admin manual control, audit trail), gated **Club practice missions** and the
> provider-neutral **payment webhook verification boundary**.
> **Provider checkout, provider-specific webhook adapters, full subscription UI,
> AIG JSON-template generation and multi-client session rules are [PLANNED].**

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
- Sensitive student endpoints are rate-limited globally and repeated unknown
  valid-format code attempts receive a short code-level cooldown.
- Active attempts use server-verified tokens.
- Finishing an official attempt returns only the aggregate result, never
  per-question correctness.
- After the server deadline, late answers are rejected and saved answers are graded.
- Attempt time can be paused for connectivity loss (blackouts). A client
  heartbeat lets the **server** measure the gap between pulses and credit capped
  grace pause (`GRACE_CAP_SECONDS`, currently 10 min per attempt); the client
  cannot fabricate extra time because it does not report the pause itself. The
  hard event end (`ends_at`) is never extended by pause. Known bounded tradeoff:
  a student can withhold heartbeats to bank thinking time, capped by the grace
  limit and with no ability to answer while offline — acceptable for the 1–4
  grade low-stakes surface.

For crash recovery, the browser stores only non-secret attempt metadata. To
survive blackouts and reloads, the browser may also queue the student's own raw
answers (option index / text / order) in `localStorage` and re-send them when
connectivity returns. These queued values are the student's submissions, not
answer keys and not server-trusted scores, so they stay within the offline-state
boundary. The attempt token is never persisted: on resume the student re-enters
the physical code to obtain a fresh token before the queue can flush.

## Answer-Key Handling

| Mode | Key handling |
|---|---|
| Static practice bundle | May include keys intentionally for local feedback |
| Public question API | Strips top-level and nested keys |
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

Teacher sessions are tab-scoped on the frontend: access and refresh tokens are
stored in `sessionStorage` with an in-memory copy for the active page. A legacy
`localStorage.teacher_session` value is migrated once and removed immediately,
so long-lived browser storage is not the supported teacher-session boundary.

## Database And RLS

The backend is the only component that accesses application tables. Migration
`0028_enable_rls_all_application_tables` enables Row Level Security on every
application table as defense-in-depth; no permissive browser-facing policies are
created, so accidental Supabase Data API/grant exposure remains deny-by-default.
No frontend code may call Supabase Data API tables directly.

## Surface Data Boundaries — School **[IMPLEMENTED]**, Home Demo/Entitlement/Club Practice **[IMPLEMENTED]**, Payment Webhook Boundary **[IMPLEMENTED]**, Provider Checkout **[PLANNED]**, Olympiad **[IMPLEMENTED]/[PLANNED]**

_The School side is enforced by the shipped classroom-game backend
(`/api/school`, `school-flow.test.ts`). Home demo, parent lead/consent,
entitlement and Club practice are enforced by `/api/home`,
`home-flow.test.ts`, `home-entitlement.test.ts`, `home-club.test.ts` and
`home-payment-webhook.test.ts`. Provider checkout and provider-specific
adapters are binding once payments are built._

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
- repeated unknown valid-format classroom join codes receive a short
  code-level cooldown; lobby retries for a real session are not counted so a
  class is not locked out before the teacher starts the game;
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

- static practice bundles may expose local-feedback answer keys only when
  explicitly generated as practice assets;
- public API, Home Demo, paid, official, diploma-generating or
  parent-reporting variants must keep answer evaluation on the backend;
- generated task versions used for reports or diplomas must be versioned enough
  to explain what the child completed;
- client-side generation, random seeds or cached task state must not be treated
  as trusted scoring evidence.

## Payment And Entitlement Boundaries — Entitlement/Webhook Boundary **[IMPLEMENTED]**, Provider Checkout **[PLANNED]**

_The entitlement model is enforced by `home-entitlement.ts` and
`home-entitlement.test.ts` (migration 0018). The provider-neutral webhook
boundary is enforced by `home-payment-webhook.ts` and
`home-payment-webhook.test.ts` (migration 0020). Provider-specific checkout and
webhook adapters remain planned._

Payment card data must stay with the payment provider. Rozumko may store only
the minimum payment-provider references and entitlement state needed to grant or
revoke access.

Paid Home access is represented by backend entitlement state
(`active | past_due | canceled | expired | revoked`). `hasHomeAccess` is the
single decision point and fails closed: expired/revoked always block, a
missing period end blocks even `active`, `past_due` gets a bounded grace
window. Every status change writes an audit event with the actor (`admin` for
manual control, `provider` for verified payment events). Payment callbacks or
webhooks must be verified before they change entitlement state. The current
provider-neutral boundary requires `HOME_PAYMENT_WEBHOOK_SECRET`, validates an
HMAC signature, records a unique `(provider, provider_event_id)` event for
idempotency and changes entitlement in the same transaction through the same
`applyEntitlementChange` path. Without a configured secret, with an invalid
signature, with an unknown `leadId`, or with an invalid entitlement period,
the route fails closed and writes nothing.

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
  Home Demo uses `GET /api/questions` with safe answer stripping and a track
  allowlist (`informatics`, `computational-thinking`, `ai-basics`) so keys do
  not reach the browser. Club practice questions are issued only by
  `GET /api/home/leads/:id/club/questions`, which requires a valid lead token
  and active entitlement. Official olympiad questions are issued only by
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
- GitHub Pages cannot enforce HTTP `frame-ancestors`. The frontend therefore
  ships a client-side guard as defense-in-depth: framed app pages redirect the
  current frame to `framing-blocked.html` and stop module execution before the
  page app continues. This is not equivalent to an HTTP framing policy, so
  authenticated Pages surfaces keep a residual clickjacking risk until they
  move behind a host that can send `Content-Security-Policy: frame-ancestors`.

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
- every application table is covered by the RLS enablement migration;
- public question query validation rejects unsafe values;
- public questions are filtered to `isOlympiad=false`;
- public questions strip answer keys by default; demo responses strip answer
  keys explicitly;
- critical UUID parameters fail with `400` before database access;
- attempt finalization rejects late answers and locks the attempt row while
  scoring saved answers;
- Render backend auto-deploy waits for CI checks.
- npm supply-chain guardrails are present for root and backend dependencies:
  Dependabot, pull-request dependency review and scheduled/manual
  `npm audit --audit-level=high`.
- teacher refresh tokens are not persisted to `localStorage`; session writes go
  through the frontend session helper.

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

`backend/src/routes/home-club.test.ts` protects the paid Club practice flow
(written before the route code):

- missing, expired or revoked entitlement blocks paid mission question issuing
  and submissions (403) and writes nothing; `active` past its period end also
  blocks;
- the entitlement gate runs before any row is written, and scoring itself is
  identical regardless of entitlement state (shared practice-pool scorer);
- paid mission questions and responses expose no answer keys or explanations;
  progress listings require active entitlement and return reports and
  aggregates only, never raw events;
- Home routes never touch School tables and School routes never accept lead
  tokens (source check — no school-to-home identity path).

`backend/src/routes/home-payment-webhook.test.ts` protects the payment
verification boundary (written before the route code):

- missing `HOME_PAYMENT_WEBHOOK_SECRET`, invalid signatures and unknown
  `leadId` values do not write payment events or entitlement changes;
- entitlement states that require `currentPeriodEnd` roll back completely when
  the period is missing or invalid;
- valid verified events write an idempotency row and update entitlement through
  `actor = provider` audit events in one transaction;
- duplicate provider event IDs are idempotent and do not write a second audit
  event;
- the webhook module never touches scoring, question issuing or answer keys
  (source check).

Remaining Home Mode security regression tests **[PLANNED]** (must land before
the corresponding feature code):

- provider-specific checkout adapters map their signed callbacks into the
  provider-neutral webhook contract before entitlement changes;
- diploma-generating Home missions keep answer keys off the browser (same rule
  already enforced for demo and paid practice missions).

AIG/security regression tests **[PLANNED]** should cover before an AIG engine
is used for paid, official or diploma-generating flows:

- generated variants are tied to immutable item model/scoring versions;
- paid/official generated variants do not expose answer keys to the browser;
- server scoring recomputes or verifies the generated correct answer from
  trusted versioned data, not from client-submitted keys.

GitHub Pages also runs frontend typecheck, tests and build inside its deployment
workflow. Render Blueprint uses `autoDeployTrigger: checksPass`.

External operational controls are not marked as complete from code review alone.
Use `docs/security-ops-evidence.md` as the public-safe template, keep completed
evidence private and attach it to the release or pilot checklist.

## Operational Security Checklist

MVP/free-tier pilot blockers:

- [x] Keep teacher self-registration enabled for the pilot with email
      confirmation, administrator approval and Turnstile bot protection.
- [ ] Supabase Auth -> Bot and Abuse Protection: Turnstile is enabled and
      enforced for signup.
- [ ] Supabase Auth -> Rate Limits: review password login and signup limits
      using the controls available on the current Supabase plan.
- [ ] Supabase Database: apply migration `0028` and verify RLS is enabled on
      application tables with no browser-facing permissive policies.
- [ ] Render: backend service is synced from `backend/render.yaml`.
- [ ] Render: keep one backend instance while `RATE_LIMIT_STORE=memory`.
- [ ] Render: `/health` is configured and live checks for `/health`, `/ready`
      and `/ping` pass after deploy.
- [ ] GitHub: protect `main` from direct pushes, force pushes and deletions;
      require Project CI, Pages and Supply Chain checks before merge where the
      current GitHub plan exposes those controls.
- [ ] After backend deployment, run the security section in `docs/smoke-test.md`.
- [ ] Before a pilot/release, complete a private copy of
      `docs/security-ops-evidence.md`.

Deferred until higher traffic, paid campaigns or production-grade operations:

- [ ] Add a shared rate-limit store before increasing backend instances.
- [ ] Move authenticated frontend pages behind a host that can enforce HTTP
      `Content-Security-Policy: frame-ancestors`.
- [ ] Run and record a restore drill on a non-production database.
- [ ] Maintain a private operational checklist for secrets, backups and incident
      contacts outside the public repository.
- [ ] Periodically remove stale pending teacher accounts.
