# Security Model - Rozumko

_Updated: 2026-07-24_

> **Implementation status legend.**
>
> - **[IMPLEMENTED]** — enforced by code and covered by tests today.
> - **[PLANNED]** — required rules for features not built yet. They are
>   binding *when* the feature is built: the listed regression tests must land
>   **before** the feature code. Nothing enforces them today because the
>   feature does not exist.
>
> As of _2026-07-24_ the enforced surfaces are the **official olympiad flow**,
> **teacher/admin auth**, **School Mode** (self-serve missions and the
> anonymous classroom game), the **Home demo/lead slice** (consent-gated
> demo attempts and reports), the **entitlement model** (backend access state,
> admin manual control, audit trail), gated **Club practice missions** and the
> provider-neutral **payment webhook verification boundary**, the
> **parent account/profile API**, **client-unverified Home path progress**, the
> **audited editorial cycle plus static content publication** (see
> [ADR-0006](./adr/0006-database-owned-published-content.md)) and **channel-scoped
> question delivery** (see
> [ADR-0007](./adr/0007-question-delivery-channels.md)).
> **Provider checkout, provider-specific webhook adapters, full subscription UI,
> AIG JSON-template generation and multi-client session rules are [PLANNED].**

## Core Rules

1. The browser is untrusted.
2. Official scoring happens only on the backend.
3. Official answer keys never reach the browser. Demo endpoints never return
   answer keys, but the current public demo reuses the static practice pool,
   whose keys are intentionally available for local practice feedback.
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
| Demo API response | Strips top-level and nested keys. Legacy source items may also exist in the public static bundle; the authored demo package (`meta.purpose = 'olympiad-demo'`) is excluded from the export query and fails the export closed if it ever reaches the bundle sanitizer |
| Official attempt | Strips top-level and nested keys |
| Official result | Returns only the aggregate score |
| Teacher/admin results | Excludes raw `answers` |

Nested answer keys are stripped for structured question types.

## Question Editorial Workflow — **[IMPLEMENTED]**

Migration `0036` and the admin question routes implement an auditable content
workflow. New questions start as `draft`; only `published` rows may be issued
by public practice, Home, School, event selection, or the static practice
export. Publishing fails closed when required taxonomy, answer shape, or image
alternative text is missing.

Every create, edit, status transition, and restore writes an immutable snapshot
to `question_revisions` in the same transaction as the question mutation.
Admin writes use `edit_version` optimistic locking so concurrent editors cannot
silently overwrite each other. A published revision cannot be edited in place:
the admin UI creates a separate draft question for the replacement, while the
old revision remains stable for in-flight and historical scoring. Restoring
history is limited to never-published drafts and never deletes prior snapshots.
Published questions are archived rather than hard-deleted; hard deletion is
limited to unused drafts. Revision rows contain answer keys and are available
only through the authenticated admin API. RLS is enabled on the revision table
with no browser-facing policy.

Delivery is separated from authored content. `channels` decides which modes may
serve a question; it never changes the text, the answer key or the taxonomy, so
a published row can be moved between sections without breaking the immutability
of what was published. That change has one narrow route
(`POST /api/admin/questions/channels`, admin-only, one channel, add or remove),
and it stays fail closed: main-round questions accept no channel, a published
question can never be left without one, `edit_version` optimistic locking still
applies per row, and every change writes a `channels` revision snapshot. Static
surfaces do not shift silently — the practice manifest is built from the
`olympiad_training` set, so a channel change marks the site as having pending
changes and still requires an explicit, audited publication run.

## Lesson Editorial Workflow — **[IMPLEMENTED]**

Migration `0037` gives micro-lessons the same `draft → review → published →
archived` workflow, optimistic edit locking and immutable revision history.
Unlike questions, a logical lesson keeps its last published content in a
separate immutable snapshot while the administrator edits a newer draft. The
static export reads the published snapshot, so draft text and answer keys never
reach children accidentally. Publishing atomically updates that snapshot;
archiving is blocked while a published path references the lesson. Revision
history remains admin-only and RLS-protected.

## Mission Editorial Workflow — **[IMPLEMENTED]**

Migration `0038` adds the same audited state machine, optimistic edit locking
and immutable revision history to missions. The admin constructor edits
`question-set` missions and structured sorting, sequence, scenario,
fact-opinion and simulator presentation packs (the route allowlist is the
single `EDITABLE_MISSION_KINDS` constant, enforced by a regression test).
Generated puzzle rules remain read-only code. A published mission keeps an
immutable snapshot while newer work returns to `draft`.

Every apply/confirm set contains explicit UUID references to published
questions. Review and publication lock and verify those rows server-side: each
question must exist, remain published, match the mission grade and track, and
belong to only one set in that mission. Apply/confirm pairs must have equal
sizes. Revision snapshots and their question references are available only to
the authenticated admin API; `mission_revisions` has RLS enabled with no
browser-facing policy.

Game packs are validated on both export and load. Sorting items must reference
existing used bins; sequence steps must be non-empty and unique; scenarios must
have exactly one correct option and feedback for every choice; fact-opinion
statements need a category from the fixed allowlist, an explanation, at least
two categories with three statements each, and sources that are https-only and
always titled. Malformed
published JSON falls back to bundled last-known-good content. Bin assignments,
step order and scenario correctness are answer keys, but these are local
formative games, matching the documented static-practice key policy rather than
an official or paid scoring surface. The service worker treats
`/content-packs/` as network-first so a republished pack reaches online clients
without waiting for a cache-version deployment.

Simulator content is separated from mechanics by stable code-owned action
slots. Authored packs may replace icons, all rendered text variants, help text,
choice labels and only explicitly allowlisted navigation targets. They cannot
contain or replace state actions, initial state, fail-node flags, win nodes,
completion callbacks or star calculation. Server validation requires the exact
mechanics version, node set and slot set; the browser repeats structural checks
and ignores a transition target unless the runtime allowlist permits it.

## Teacher And Admin Authorization

1. Supabase Auth returns a JWT after signup or login.
2. The backend verifies the JWT (issuer, audience `authenticated`, ES256 only,
   anonymous sign-ins rejected) before handling protected requests.
3. The database decides the user's role and status.
4. A teacher row is created only by the explicit
   `POST /api/teacher/register-request`; authentication itself never writes to
   `app_users`, so a parent (or any Supabase user) visiting teacher endpoints
   gets `ACCOUNT_UNKNOWN` instead of a silently provisioned pending row.
5. A confirmed email activates the account. `register-request` reads
   `auth.users.email_confirmed_at` (via `lib/email-confirmation.ts`, never the
   user-writable `user_metadata.email_verified` claim) and files the row as
   `active`; an unconfirmed one stays `pending`. The same route promotes a row
   filed before its email was confirmed, because `requireAuth` refuses a pending
   row and nothing else could move it forward.
   Promotion is scoped to `role = 'teacher' AND status = 'pending'`: `blocked`
   stays blocked, and an admin row's status never changes from a user action —
   otherwise confirming an email would be a way to grant yourself admin.
   Manual admin control remains for blocking and role changes. It is no longer a
   gate on every signup: that made all organic teacher traffic a dead end, and
   tied activation to one person being present.
6. Pending and blocked users cannot access protected teacher features.
7. Admin routes additionally require the admin role.

The frontend limits third-party scripts around authenticated flows. Keep
avoiding unsafe HTML interpolation.

Teacher sessions are tab-scoped on the frontend: access and refresh tokens are
stored in `sessionStorage` with an in-memory copy for the active page. A legacy
`localStorage.teacher_session` value is migrated once and removed immediately,
so long-lived browser storage is not the supported teacher-session boundary.
This reduces persistence but does not remove XSS exposure: script execution in
the teacher origin can still read `sessionStorage`. HttpOnly backend sessions
or a stricter in-memory-only browser session remain a future hardening item.

Redirect-based teacher and parent auth uses S256 PKCE. Signup, password
recovery and Google OAuth callbacks accept only a `?code=` that is exchanged
with the locally generated verifier; raw access/refresh tokens in URL fragments
are rejected even if the fragment claims a trusted flow type. The temporary
verifier and flow marker may use origin-scoped `localStorage` so an email link
can open in another tab, but they contain no bearer credentials, expire after
15 minutes for OAuth or 24 hours for email flows, and are deleted after a
successful exchange. Password login and successful callback exchange force a
full document reload before private API calls or dashboard rendering. A
document holding a Supabase session never loads Turnstile; the third-party
script is limited to the unauthenticated credential-grant document.

## Database And RLS

The backend is the only component that accesses application tables. Migration
`0028_enable_rls_all_application_tables` enables Row Level Security on every
application table that existed at that revision; every later table migration
enables RLS in the same migration — `0029` and `0031` (parent accounts and path
progress), `0032`-`0034` (micro-lessons, path maps and their immutable
revisions), `0036`-`0038` (`question_revisions`, `micro_lesson_revisions`,
`mission_revisions`) and `0041` (`content_publications`). A regression test
fails if any application table is left uncovered.
No permissive browser-facing policies are created, so accidental Supabase Data
API/grant exposure remains deny-by-default.
No frontend code may call Supabase Data API tables directly.

### Database TLS

Supabase presents a chain signed by its own CA (`prod-ca-2021`), which is not in
the system trust store. Verifying against system CAs alone therefore fails with
`self-signed certificate in certificate chain`.

`src/db/pool-ssl.ts` states the intent explicitly rather than inheriting `pg`'s
`sslmode` mapping: always `rejectUnauthorized: true`, plus the bundled Supabase
CA (overridable by `SUPABASE_DB_CA_CERT`). This matters because pg 8.x treats
`require` as `verify-full`, while pg v9 will switch it to weaker libpq semantics — the
warning `SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases
for 'verify-full'` in the Render log is that deprecation notice.

**Root cause of the two failed `verify-full` attempts, measured 2026-07-25:**
not the certificate. The Supavisor pooler IS signed by `prod-ca-2021` — the
chain observed on the live connection is `*.pooler.supabase.com` <-
`Supabase Intermediate 2021 CA` <- `Supabase Root 2021 CA`. The real cause is
that **`pg` rebuilds `ssl` from the connection string whenever the string
carries any TLS parameter, and that rebuild overrides the explicit `ssl`
option** — so the pinned CA was silently discarded and verification fell back
to the system trust store, which does not contain the Supabase root. Measured
against production:

| `DATABASE_URL` | what `pg` actually used | result |
|---|---|---|
| no TLS params | our explicit `{ca, rejectUnauthorized}` | connected, verified |
| `?sslmode=require` | `{}` — CA dropped | refused: self-signed certificate in chain |
| `?ssl=true` | `true` — CA dropped | refused: same |

Consequently intent must never travel inside the connection string.
`resolvePoolConfig()` reads the intent, strips `sslmode`/`ssl`/`sslrootcert`
from the string, and hands `pg` a clean string plus an explicit `ssl` object.
Every `new Pool(...)` in the backend uses it; passing `process.env.DATABASE_URL`
straight through is the bug this replaced.

Two further changes close the loop:

- **The Supabase root CA ships with the code** (`backend/certs/
  supabase-prod-ca-2021.crt`, exempted in `.gitignore`). It is public — the
  server presents it in every handshake — so it is not a secret, and bundling
  it means a verified connection needs no environment configuration at all.
  Verified TLS being opt-in through an env var nobody had set is precisely how
  this stayed unfixed. `SUPABASE_DB_CA_CERT` still wins when present, so a CA
  rotation needs no release.
- **TLS is fail-closed by default.** A URL that simply omits `sslmode` used to
  mean plaintext; it now means verified. A local plaintext server must say
  `?sslmode=disable` (see `docker-compose.example.yml`).

`sslmode=no-verify` remains a deliberate opt-out — encrypted, unverified — and
is the fallback that restores service if a CA is ever wrong. Because a silent
opt-out outlives its reason, the server now logs `db-tls: …` at startup on
every weakened mode, and `verify` logs that it is pinned.

To finish enabling verification in production, **remove `sslmode=no-verify`
from the Render `DATABASE_URL`.** Nothing else is required: no env var, no
`sslmode=verify-full`, no ordering constraint.

Guarded by `src/db/pool-ssl.test.ts`, which asserts what `pg` ends up using
(computed in the `Client` constructor, no network) rather than only what our
own function returns. The previous suite passed while the connection was
unverified precisely because it tested intent alone.

The CI content exporter pins the same CA through `NODE_EXTRA_CA_CERTS`
(`deploy.yml`), which is why that path worked while the runtime did not.

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
- answer keys never reach the browser on child surfaces (same sanitizer as
  olympiad questions) and scoring happens only on the server;
- one scoped exception: the authenticated **owner** of a lobby or active
  session may preview that session's questions with the key, because the
  teacher chooses what the class plays and cannot judge a question without
  seeing what the class will see. The preview carries the same render data as
  the game (options, image, code) plus the key — as a readable answer string,
  and as the index of the correct option for the mechanics that keep it in the
  `correct` column. The nested key structures (`correctOrder`, `pairs`,
  `answer`) are still stripped, so sort/match/input keys leave only as text. It
  covers practice questions only (School sessions never draw `isOlympiad`
  questions), it is never reachable from a participant token, and a finished
  session returns 409;
- one answer per participant per question, only for active sessions, only for
  questions issued to that session;
- projector questions are available only to the authenticated owner of an
  active School session, use the same answer-key sanitizer, and accept class
  answers through server scoring that returns only `{ correct: boolean }`;
- repeated unknown valid-format classroom join codes receive a short
  code-level cooldown; lobby retries for a real session are not counted so a
  class is not locked out before the teacher starts the game;
- a teacher sees only their own sessions and an anonymous leaderboard.

### Class Activities — Client-Unverified Aggregates **[IMPLEMENTED]**

A School session delivers either server-graded questions (`kind = 'questions'`,
the default and the historical behaviour) or an **activity** (`kind =
'activity'`). Most activities are procedural, such as the keyboard puzzle,
magic squares, symbolic logic, message coding or sorting station. A
content-backed activity may use a dedicated participant endpoint: for
`fact-or-opinion` the pre-answer response contains only neutral statement ids
and text, while the category is evaluated on the backend. The final aggregate
is still client-reported because per-item activity answers are not persisted,
so it cannot be treated as server-trusted scoring.
This is a deliberate, contained exception for classroom aggregates, fenced as
follows:

- the outcome arrives from the browser and is stored with
  `trust = 'client-unverified'` (a DB CHECK pins the column to that value), so
  the provenance travels with the row rather than living only in code comments;
- these numbers feed **the teacher's dashboard only**. They must never feed
  entitlements, payments, diplomas or any claim of certification. Home Mode
  keeps its own evidence path (`home_mission_attempts`) and does not read
  School activity results;
- `backend/src/lib/school-activities.ts` is the single fail-closed registry of
  which activities and levels exist. Unknown activity or level → 400. Ceilings
  are **per level**, not per activity — a maze «Початківець» run cannot claim
  the ten levels of «Майстер»;
- the activity **and its level come from the session row**, never from the
  request body, so a child cannot claim an easier level than the teacher
  started. Extra body properties are stripped by the route schema;
- the server rejects implausible claims outright rather than clamping them
  silently: `correct <= total`, `total` within the activity's registry ceiling,
  a mistake budget, a minimum run duration (no instant "win") and a maximum
  bounded by the session join TTL. Stars are derived server-side from the
  activity's own rubric and clamped to 0–3;
- one result per participant (`UNIQUE(participant_id)`), only for an `active`
  session, only with a valid participant token, behind its own rate limit;
- content-backed activity endpoints verify the participant token, active
  session, exact activity key and grade pack before evaluating a choice; the
  statement list never carries its category or explanation before answering;
- the two surfaces are **mutually closed**: question routes (`/questions`,
  `/preview`, participant `/answer`, `/projector-answer`, per-participant
  breakdown) return 409 for an activity session, and `/activity-result`
  returns 409 for a question session. Fixed by `school-flow.test.ts`;
- a DB CHECK keeps the pairing honest: an activity session must name its
  activity and level, a question session must carry neither;
- only a **completed** run reports a result. The teacher's list therefore shows
  every participant and marks those without a result «не завершено», rather
  than silently dropping them — otherwise the slowest children, the ones the
  teacher most needs to see, disappear from the class picture. Showing *how
  far* an interrupted child got would need partial progress flushed while the
  session is still active, and must not widen the window for fabricating a
  result after the lesson ends; it is deliberately not built.

Home Mode is the parent-led commercial surface:

- parent consent is required before storing child progress;
- the only pre-consent write is `home_funnel_counters`, and it is aggregate by
  construction: one counter per `(date, step, grade, track)`, no visitor,
  session, IP or user-agent column, so it cannot describe an individual. The
  open write route accepts a closed allowlist of steps and dimensions
  (`additionalProperties: false`) and fails open on storage errors; the
  boundary is fixed by `routes/home-funnel.test.ts` and disclosed in
  `privacy.html` §9.5;
- child profiles are created by the parent or responsible adult;
- individual reports and diplomas are based on Home Mode data, not imported
  from anonymous classroom sessions;
- paid access is checked by backend entitlement state.

### Parent Accounts And Child Profiles — Account/Profile/Path APIs **[IMPLEMENTED]**, Deletion **[PLANNED]**

_Migrations 0029–0031 and `/api/parent` implement registration, database-owned
account status, lead claiming, multi-profile ownership, reports, aggregated
entitlement reads and client-unverified path progress. They are deployed in
production as of 2026-07-10.
Account/profile deletion stays fail-closed until a retention policy is approved._

- A parent authenticates with Supabase Auth. The JWT proves the Supabase user
  identity only; `GET /api/parent/me` reads account status and ownership from
  the application database. Parent authorization must not use JWT role claims
  or the teacher/admin `app_users` authorization path.
- A child never receives Supabase Auth credentials and never registers an
  account. The parent creates a minimal profile containing only a display name
  and grade after recording the applicable consent.
- Parent browser sessions are tab-scoped: access/refresh tokens and the active
  child-profile selector use `sessionStorage`, never `localStorage`. The active
  profile ID is routing context, not authorization; every API request still
  verifies ownership. As with teacher sessions, XSS can read `sessionStorage`,
  so an HttpOnly backend-session design remains a future hardening option.
- Parent signup, recovery and Google OAuth follow the shared S256 PKCE callback
  rules above. Email links must redirect to `parent.html`; they never deliver
  bearer tokens in the URL.
- Parent registration is directly discoverable through
  `parent.html?mode=register`; the mode is consumed and removed from the URL
  before the auth form continues.
- The admin parent directory requires `requireAdmin` and exposes only adult
  email, database status, email-verification state, account creation date and
  aggregate child-profile count. It excludes child display names, grades,
  progress, reports and Supabase auth identifiers.
- Every parent route that reads or mutates a child profile accepts an explicit
  UUID `childProfileId`, validates it before database access, and verifies that
  the profile belongs to `req.parent.id`. A valid UUID without ownership
  returns `404` so cross-account profile existence is not disclosed.
- Claiming an existing consented demo requires all three proofs: an
  authenticated parent session, the valid domain-separated lead token, and a
  normalized match between the verified parent email and `home_leads.parent_email`.
  A lead UUID, child display name, School token, or payment reference is never
  sufficient proof of ownership.
- Claiming is transactional and idempotent. A lead already owned by another
  parent fails closed and does not transfer its profiles, reports, entitlement
  or payment history.
- Existing lead-token routes remain a limited compatibility surface for the
  unclaimed demo. Once claimed, authenticated parent routes become the durable
  authority; the lead token must not grant parent-zone profile management.
- A parent account may own several child profiles. Entitlement remains at the
  parent/account level for the first single-plan product, while attempts,
  progress and reports are always scoped to one explicit child profile.
- Browser path results marked `client-unverified` may be stored only as
  practice progress after the server validates the profile ownership,
  map revision, point/activity identifier and activity version, and records a
  positive lesson content version for lesson activities. Immutable
  `path_map_revisions` keep already downloaded static
  bundles valid after an administrator publishes a newer map. They cannot
  produce an official score, diploma or trusted parent report. Server-issued
  missions continue to be scored from server-held question versions and saved
  events.
- Anonymous Home visitors may complete only the first path point. Its result
  stays in same-origin local storage until an authenticated parent explicitly
  chooses a child profile of the same grade and confirms import. The frontend
  submits only the catalogued first-point activity to the existing
  ownership-gated path-progress endpoint; the backend revalidates grade,
  point, activity version and `client-unverified` trust before persistence.
  The anonymous local record is removed only after the server accepts it.
- Profile selection may be child-friendly, but profile creation, deletion,
  consent changes, subscription actions and parent reports remain in the
  parent zone and require the authenticated parent session. A local PIN can be
  an additional UX lock, never the authorization boundary.
- Account/profile deletion must cascade or anonymize child practice data under
  a documented retention policy; it must not affect School Mode records because
  no School-to-Home identity link exists.

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
- Classroom and olympiad traffic is NAT-aware. Code validation, code exchange
  and anonymous School joins keep an IP ceiling sized for a 30-pupil class and
  retain the per-code failure throttle. After authentication, attempt and
  School participant routes use the HMAC-verified resource ID as the limiter
  key, so legitimate pupils behind one public IP do not consume one shared
  bucket. Missing or forged tokens always fall back to a shared IP bucket;
  unverified token text is never accepted as a key.
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
- The public olympiad demo is issued by `POST /api/questions/demo/start` from
  published `olympiad_training` questions. A versioned pool uses 12 exact
  grade-specific slots and the server selects one tagged variant per slot.
  Untagged legacy pools keep the former track/difficulty composition only until
  a tagged blueprint is published. Selection uses a bounded
  fail-closed search that cannot enumerate an unbounded composition tree.
  Candidate order is stabilized before random selection. The server strips
  top-level and nested answer keys and signs the issued question IDs in a
  short-lived HMAC token. Final answers go to
  `POST /api/questions/demo/finish`; the server verifies that token, scores
  only the issued IDs and returns only aggregate `{ score, total }`. It does
  not return per-item correctness, explanations or answer keys. A running
  demo may keep its sanitized questions, signed demo token, local answers and
  deadline in tab-scoped `sessionStorage` for reload recovery. This state
  uses the server-provided relative token TTL to derive a recovery deadline in
  the device clock domain; the absolute server expiry remains part of the API
  contract and the backend remains authoritative. The state contains no answer
  key and never becomes scoring authority. This protects
  result integrity and prevents per-item answer leakage from the demo API; it
  does **not** make the current demo questions secret because the same
  `olympiad_training` rows are exported with local-feedback keys in the public
  static practice bundle. A future secrecy requirement needs a separate
  non-exported demo pool. Home Demo and Club use only the
  `path` channel, while School Mode uses only `class_game`. Empty channels are
  fail-closed, and main-round (`is_olympiad=true`) questions cannot have any
  training channel. Home Demo uses `GET /api/questions?channel=path`; the
  allowlisted practice fallback may request `channel=olympiad_training`, while
  `class_game` is rejected by this public endpoint. Responses use safe answer stripping and a track
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
- Teacher and parent auth pages load Turnstile lazily only for unauthenticated
  signup, password-login and password-recovery grants. Authenticated callback
  and dashboard documents never load the widget.
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
# job `frontend`
npm run typecheck
npm run lint
npm test
npm run build
npm run test:layout   # Playwright Chromium, layout + axe

# job `backend`
cd backend
npx tsc --noEmit
npm test
```

A branch ruleset on `main` (no bypass, active since 2026-07-16) requires both
jobs, blocks force pushes and blocks branch deletion, so every change lands
through a pull request.

`backend/src/security-regression.test.ts` protects the audited invariants:

- spoofed `X-Forwarded-For` does not create a fresh rate-limit bucket;
- classroom start limits and verified attempt/participant resource buckets
  remain wired into the student routes;
- unsupported shared rate-limit store modes fail closed;
- every application table is covered by the RLS enablement migration;
- public question query validation rejects unsafe values;
- public questions are filtered to `isOlympiad=false`;
- question channels are fail-closed: School, Home and static olympiad training
  each query only their allowlisted channel, while main-round questions have none;
- public questions strip answer keys by default; olympiad demo start strips
  answer keys explicitly, and demo finish returns only an aggregate score;
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
- the teacher preview returns render data plus the key as text and as a marked
  option, never the raw `correct` column or a nested key (`correctOrder`), and
  only to the session owner (404 otherwise), never after the session is
  finished (409);
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

`backend/src/routes/parent-claim.test.ts`, `parent-flow.test.ts` and
`parent-path-progress.test.ts` protect the parent account and learning-path
boundaries:

- parent identity is resolved through `/api/parent/me`; status and ownership
  come from the database, never JWT role claims or teacher `app_users`;
- lead claiming requires parent auth + valid lead token + verified matching
  email and is transactional/idempotent;
- child-profile reads and writes enforce owner-scoped UUID access and return
  `404` for valid foreign profile IDs;
- path events accept only catalogued map/point/activity-version combinations,
  require a positive content version for lessons, enforce unlock prerequisites
  and store a unique server-derived
  event key; legacy clients without a map revision are matched fail-closed
  against immutable revisions;
- retries do not increment attempts, while new completions keep the best stars;
- every stored path event remains `client-unverified` and cannot create trusted
  reports, official scores or diplomas.
- frontend sync is enabled only when a parent session has an explicitly active
  child profile; local anonymous progress is never assigned automatically to a
  child account.

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
Before starting a new backend process, Render runs a read-only migration journal
check. A database behind the bundled Drizzle journal blocks startup; `/ready`
and `/ping` report `migration_required` with no migration details. Migration SQL
is still applied deliberately by an operator, never by build or startup.

Admin-triggered static content publication uses a separate least-privilege
trust chain:

- the authenticated admin API freezes the exact published-version manifest in
  `content_publications`; a partial unique index permits one active job;
- the backend token is a fine-grained repository token with only Actions write
  permission. It can dispatch the existing Pages workflow but cannot push code;
- GitHub Actions exports with a dedicated read-only PostgreSQL credential and
  refuses deployment when the current manifest differs from the approved hash;
- callbacks are HTTPS-only, HMAC-signed, timestamp-bounded and state-machine
  checked. Successful jobs must return the approved manifest hash and a valid
  source commit SHA;
- publication tokens and callback secrets exist only in Render/GitHub secret
  stores and never enter frontend bundles or logs.
- Pages runs use a bounded FIFO concurrency queue, so a later push cannot
  silently replace a pending audited publication before its callback starts.

Normal code-triggered Pages deployments run the same database export before
building, preventing a later frontend deploy from restoring stale committed
bundles. See `docs/content-publication.md` for setup and recovery steps.

External operational controls are not marked as complete from code review alone.
Use `docs/security-ops-evidence.md` as the public-safe template, keep completed
evidence private and attach it to the release or pilot checklist.

## Operational Security Checklist

MVP/free-tier pilot blockers:

- [x] Keep teacher self-registration enabled for the pilot with email
      confirmation, administrator approval and Turnstile bot protection.
- [x] Supabase Auth -> SMTP: configure a production SMTP provider and verify
      confirmation and recovery delivery to external teacher and parent
      addresses; do not rely on the default test-only SMTP service. Keep the
      production templates in `docs/auth-email-templates.md`.
- [x] Supabase Auth -> Bot and Abuse Protection: Turnstile is enabled and
      enforced for signup, password login and password recovery.
- [x] Supabase Auth -> Rate Limits: review password login and signup limits
      using the controls available on the current Supabase plan.
- [x] Supabase Auth -> URL Configuration: allow only the exact production
      `teacher.html` and `parent.html` callback URLs (plus explicit local/staging
      URLs while needed); do not add a broad wildcard redirect.
- [x] Supabase Auth -> Providers: Google is enabled only when its OAuth client
      and exact callback/redirect configuration have been reviewed.
- [x] Supabase Database: migration `0028` is applied in production (later
      migrations `0029`-`0031` were deployed on 2026-07-10 on top of it) and RLS
      is enabled on application tables with no browser-facing permissive
      policies. For a new environment, verify before applying `0028` that the
      backend `DATABASE_URL` role owns application tables or has `BYPASSRLS`,
      otherwise RLS without policies can break API reads.
- [x] Render: backend service is synced from `backend/render.yaml`.
- [x] Render: keep one backend instance while `RATE_LIMIT_STORE=memory`.
- [ ] Render: `/health` is configured; the read-only migration startup guard
      passes; live checks for `/health`, `/ready` and `/ping` pass after deploy.
- [x] GitHub: `main` is protected by a no-bypass branch ruleset (since
      2026-07-16) that rejects direct pushes, force pushes and branch deletion
      and requires the `frontend` and `backend` Project CI jobs before merge.
      Pages and Supply Chain checks are not required by the ruleset on the
      current plan; add them if the plan later exposes those controls.
- [ ] After backend deployment, run the security section in `docs/smoke-test.md`.
- [ ] Before a pilot/release, complete a private copy of
      `docs/security-ops-evidence.md`.
- [ ] Before the first live event, run one database export/import smoke test
      into a local or non-production PostgreSQL database.

Deferred until higher traffic, paid campaigns or production-grade operations:

- [ ] Add a shared rate-limit store before increasing backend instances.
- [ ] **Open question — verify the real proxy depth in production.** `trustProxy: 1`
      assumes exactly one reverse-proxy hop (Render). If any CDN or proxy sits in
      front of the backend, the client IP the limiter keys on is the proxy's, not
      the visitor's, which blurs per-IP limits into one shared bucket. Confirm
      with server-side diagnostics of the received `X-Forwarded-For` chain — not
      from client-side observation — and adjust the hop count together with the
      spoofing regression tests if it turns out to be more than one.
- [ ] Move authenticated frontend pages behind a host that can enforce HTTP
      `Content-Security-Policy: frame-ancestors`.
- [ ] Run and record a restore drill on a non-production database.
- [ ] Maintain a private operational checklist for secrets, backups and incident
      contacts outside the public repository.
- [ ] Periodically remove stale pending teacher accounts.
