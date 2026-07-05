# Architecture - Rozumko

_Updated: 2026-07-02_

> **Implementation status legend.** This document mixes shipped design with
> forward-looking direction. Sections are tagged:
>
> - **[IMPLEMENTED]** — code, schema and tests exist in this repo today.
> - **[PLANNED]** — design intent only. No tables, routes or tests yet. Do not
>   assume these exist; do not build on top of them without first adding the
>   schema, routes and the security regression tests listed in
>   `security-model.md`.
>
> As of _2026-07-02_ the shipped surfaces are the **official olympiad flow**
> (events, access codes, attempts, server-side scoring, teacher/admin panels)
> and **School Mode** (basic self-serve missions on `/school` plus the
> advanced anonymous classroom-game backend: sessions, join codes,
> participants, server-scored answers, teacher leaderboard).
> The **Home demo slice** (parent lead + consent, server-scored demo report,
> demo UI on `/home`), the **entitlement model** (backend access state with
> admin manual control and audit trail) and the first gated Club practice
> mission slice are also implemented, along with a provider-neutral verified
> payment webhook boundary. **Provider checkout/adapters, subscription UI and
> AIG JSON-template content generation remain [PLANNED].**

## Overview

Rozumko is an educational platform for grades 1-4 built around short missions
that develop informatics foundations, computational thinking and
age-appropriate AI literacy. The product turns screen time into useful
10-15 minute practice for attention, logic, algorithms, patterns,
step-by-step thinking, safe AI basics and confidence with tasks.

The product architecture is split into three autonomous surfaces:

- **School Mode**: a free classroom mode for trust and awareness, with no parent
  accounts, payments or child personal data.
- **Home Mode / Rozumko Club**: parent-led home practice with a limited demo,
  consented child progress, parent-readable results and paid access.
- **Olympiad / Seasonal Events**: time-bound events, finals, diplomas and
  one-off access moments that may be included for active Home subscribers.

The frontend is static, while all database access and official or
diploma-generating scoring go through the backend.

| Layer | Technology |
|---|---|
| Frontend | Vite 6, TypeScript, Vanilla JS, CSS |
| Backend | Node.js, Fastify v5, TypeScript |
| Database | PostgreSQL on Supabase, Drizzle ORM |
| Auth | Supabase Auth for teachers and admins only |
| Hosting | GitHub Pages frontend, Render backend |

## Current Student/Event Modes

The platform includes these student-facing event and practice modes:

| Mode | Code | Questions | Scoring |
|---|---|---|---|
| Practice | No | Static practice bundle generated from `isOlympiad=false` (`public/questions/grade-N.json`, carries `track`/`topic`) | Local feedback; answer keys are intentionally bundled |
| Home Demo | No | `GET /api/questions` with safe answer stripping and `track=<direction>` | No child score; parent report is server-scored after consent |
| Home Club Practice | Parent lead token + active entitlement | `GET /api/home/leads/:id/club/questions` | Server-side report after each paid practice mission |
| Official olympiad | Yes | Fixed event selection from the backend | Server-side only |

`student.html` and `/school` self-serve no-code practice missions load the
static bundle from GitHub Pages, so children do not wait for backend cold starts
and anonymous classes do not consume backend rate-limit budget. Home Demo uses
`GET /api/questions?isOlympiad=false&track=...` with safe answer stripping so
answer keys do not reach the browser before the parent-reporting flow. Club
practice questions are issued only by the lead-token route
`GET /api/home/leads/:id/club/questions`, which checks active entitlement first.
Official olympiad questions are still issued only through code exchange.

## Content Goals

Mission content is organized around:

- computational thinking: algorithms, patterns, decomposition, sequencing,
  logic, debugging and careful reading of instructions;
- AI basics: simple concepts about algorithms, data, prompts, reliability,
  ethics and safety;
- parent-readable outcomes: attention, logic, following instructions,
  confidence with tasks and useful screen time.

The planned content engine is Automatic Item Generation through JSON templates:
item models describe parameters, constraints, answer computation and
distractor generation so one mechanic can produce many variants. Static
practice bundles may still expose local-feedback keys when explicitly
generated as practice assets; public API, Home Demo, paid, official,
diploma-generating and parent-reporting variants must keep trusted scoring on
the backend.

Content taxonomy (migration 0021, see `docs/content-taxonomy.md`): every question
carries `track` (`informatics` / `computational-thinking` / `ai-basics`), `topic`
(subject theme within a track), and optional `concept_key` (a cross-track CT
skill). Extra columns: `progression_band`, `version` (bumped by the backend on
material edits), `meta jsonb`. Validation is fail-closed in
`backend/src/lib/taxonomy.ts` (`TOPICS_BY_TRACK`). The static practice bundle now
carries `track` and `topic`, so `pickMissionQuestions` filters by
track/topic/difficulty and direction selection is real (Home Demo by track; the
School free-mission flow adds a track picker plus optional per-topic chips).
Shared taxonomy UI copy lives in `features/missions/topics.ts` (public pages) and
is re-exported by `features/admin/taxonomy.ts`. AIG item models should emit the
same taxonomy fields when that engine lands.

A missions registry (`missions` table, migration 0022) records logical missions
by stable slug: `kind` (`question-set` today, `sorting-game` for the built-in
games), `track`, `grade`, `version`, `status`, `config jsonb`. It is deliberately
**not** FK-linked from `home_demo_attempts` / `home_mission_attempts` — `missionId`
there stays a logical identifier per the Home contract; the registry is a
management/visibility layer (read-only admin "Місії" tab, `GET /api/admin/missions`).

## Surface Architecture — School **[IMPLEMENTED]**, Home Demo/Entitlement/Club Practice **[IMPLEMENTED]**, Payment Webhook Boundary **[IMPLEMENTED]**, Provider Checkout **[PLANNED]**, Olympiad **[IMPLEMENTED]/[PLANNED]**

_School Mode is shipped: `/school` runs self-serve missions (grade, optional
track + per-topic, and difficulty; local feedback) from the static practice
bundle through the reusable `features/missions/` runner, and the advanced
classroom game is live — a teacher creates a session
in the dashboard ("Класна гра" tab, with the same optional track/topic
filtering), students join anonymously by a 6-digit
code with an avatar + nickname label, answers are scored server-side and the
teacher sees an anonymous leaderboard plus an aggregate per-topic correctness
breakdown ("що варто повторити") — aggregate only, no answer keys or child PII
beyond the leaderboard (`/api/school`, migration 0014). Home
Mode has implemented slices: `/home`, parent lead + consent, server-scored
demo reports, backend entitlement state and repeatable Club practice missions
gated by entitlement. The provider-neutral payment webhook boundary is
implemented under `/api/home/payment/webhook`; checkout/provider adapters and
richer parent account flows are still planned._

School, Home and Olympiad surfaces stay decoupled at the identity/data level.
School Mode may send users to a Home URL as a neutral brand path, but it does
not transfer individual classroom results into parent accounts. Olympiad events
may share themes and mechanics with School/Home content, but official event
attempt state is separate from anonymous School sessions.

| Area | School Mode | Home Mode | Olympiad / Seasonal Events |
|---|---|---|---|
| Entry | `/school` or classroom entry | `/home` or seasonal mission landing | `olympiad-enter.html` today; future seasonal routes planned |
| Identity | Anonymous or temporary classroom session | Parent-led account/profile | Access code today; subscription or one-off access planned |
| Child data | No child personal data | Stored only after parent consent | Event participation data only as required for scoring/support |
| Results | Aggregate/class-level only | Individual progress and reports | Official score and certificate/diploma |
| Payments | None | Paid access handled in Home | Included for subscribers or one-off transaction planned |
| Scoring | Server-side for live classroom game | Server-side for paid/diploma results | Server-side official scoring |

Frontend structure:

- `utils/question-renderer.ts` — shared question renderer for all mechanics
  (choice, truefalse, input, sort, sequence, match) + optional per-question
  image; used by trainings, School (`mission-runner`) and Olympiad. Uses
  semantic `.quiz-*` classes (no Tailwind). The one-screen mission layout
  (`body.mission-active #mission-quiz`) fits question + image + options in a
  fixed viewport; after answering, `body.mission-answered` gives the
  explanation room without an inner scroll;
- `features/missions/` — reusable mission runner (implemented; used by
  `/school` for both self-serve practice and live classroom games);
- `features/games/` — client-side game engines: sorting (`sorting-game.ts`:
  tap-based, stars + streak; `sorting-data.ts`) and logic puzzles
  (`puzzle-engine.ts` + `puzzle-data.ts`: 5 parametric CT puzzle types by grade,
  emoji/tap for grade 1, numbers for 2+). Served from `games.html`, linked from
  `home.html` and `school.html`; registered in the `missions` table;
- `features/admin/` — admin tabs incl. `missions-tab.ts` (registry) and
  `taxonomy.ts` (topic/concept UI copy);
- `features/home/` for parent-led Home Mode UX (planned).

Backend:

- School Mode routes are implemented under `/api/school`: teacher session
  lifecycle (create/start/finish/state+leaderboard, scoped to the owning
  teacher) and anonymous student join/answer with server-side scoring;
- Home Mode routes are implemented under `/api/home` for parent lead + consent,
  demo attempt/report, entitlement check and gated Club practice, specified in
  [home-demo-contract.md](./home-demo-contract.md); the provider-neutral
  webhook boundary is also under `/api/home`; further parent-profile and
  payment-provider checkout routes are planned;
- subscription-aware seasonal event access is planned and must not reuse
  anonymous School identity;
- all frontend HTTP calls continue to go through `features/api/client.ts`.

### School classroom game integrity **[IMPLEMENTED]**

- Students never receive answer keys: session questions are sanitized with the
  same stripper as olympiad questions, and correctness comes only from the
  server response.
- Participants are ephemeral: an HMAC participant token scoped to one session,
  an avatar from a fixed allowlist and a free nickname label. No child PII, no
  per-child recovery path.
- One answer per participant per question (DB UNIQUE), answers are accepted
  only for active sessions and only for questions issued to that session.
- Students can join only after the teacher starts the game, so a lobby session
  cannot be "burned" by answering into 409s.
- A question that belongs to a lobby/active school session is locked against
  admin edit/delete; questions referenced by finished-game history refuse
  deletion with 409 instead of an FK error.

## Multi-Platform Direction **[PLANNED]**

_Direction for future native/PWA clients. Only the web/PWA client exists today._

Rozumko is web-first today and app-ready by design.

Principles:

- web, PWA and native apps are clients of the same backend product;
- scoring, answer keys, consent, entitlement and paid-access rules stay on the
  backend;
- mission content and scoring profiles should be versioned and data-driven;
- client code should keep mission/domain logic separate from page-specific DOM
  glue where practical;
- APIs are designed so mobile clients can consume them without a separate
  backend.

Near-term client strategy:

1. Keep the website and PWA as the first client.
2. Make Home Mode touch-first and mobile-friendly.
3. Keep business logic outside individual clients.
4. Keep the option open for a wrapped app or native app using the same backend.

Do not fork business logic into a mobile app. A tablet or phone app may cache UI
state and non-secret progress metadata, but official/paid scoring and access
decisions must still come from the backend.

## Paid Access — Entitlement/Webhook Boundary **[IMPLEMENTED]**, Provider Checkout **[PLANNED]**

_The entitlement model is implemented (migration 0018): `home_entitlements`
(one per lead, statuses `active | past_due | canceled | expired | revoked`,
`current_period_end`) plus the `home_entitlement_events` audit trail. The
backend is the single access decision point (`hasHomeAccess`): active/canceled
grant access until the period end, past_due adds a 7-day grace window,
expired/revoked block immediately, and a missing period end fails closed.
Admins manage state manually via `PUT /api/admin/home-entitlements/:leadId`;
parents read their state via `GET /api/home/leads/:id/entitlement`
(lead-token). The entitlement already unlocks real paid content: Club practice
uses `GET /api/home/leads/:id/club` for state, `GET .../club/questions` to
issue paid mission questions, `POST .../mission-report` to score/store an
attempt and `GET .../mission-reports` for progress. Question issuing, mission
submission and progress reads are gated by `hasHomeAccess`; mission questions
and responses never include answer keys (migration 0019,
`home_mission_attempts`). The provider-neutral webhook boundary is implemented
as `POST /api/home/payment/webhook`: it requires `HOME_PAYMENT_WEBHOOK_SECRET`,
verifies an HMAC signature, records unique `(provider, provider_event_id)`
events in `home_payment_events` (migration 0020) and changes entitlement in
the same transaction with `actor: 'provider'`. Provider-specific checkout and
callback adapters are the next slice and must map into this boundary._

Payment state unlocks access. It must not decide scores or alter answer
evaluation.

### Official olympiad flow

```text
olympiad-enter.html
  -> GET /api/student/validate-code?code=...
  -> student reads rules and confirms
  -> POST /api/student/exchange-code
  -> sessionStorage.pendingOlympiad
  -> student.html
  -> POST /api/attempt/:id/answer
  -> POST /api/attempt/:id/finish
```

`exchange-code` consumes the code atomically, creates an attempt and records its
question IDs in `attempt_questions`. It returns a stateless HMAC attempt token.
Every subsequent answer or finish request requires `X-Attempt-Token`.

For a personal code (`max_uses = 1`), entering the code again resumes an
unfinished attempt after F5 or a closed tab. The browser stores only recovery
metadata in `localStorage`; it does not store the token or personal code there.
Shared codes intentionally cannot resume an old attempt because a code does not
identify a specific child.

The deadline is the earlier of:

```text
attempt.started_at + event.time_minutes
event.ends_at
```

After the deadline, late answers are rejected and already saved answers are
graded. The attempt becomes `finished`.

Finalization runs inside a database transaction and locks the attempt row while
saved answers are scored, so a concurrent late `/answer` cannot change the
result after `/finish` has started.

## Teacher And Admin Auth

The frontend calls Supabase Auth endpoints for signup, login and logout, then
sends `Authorization: Bearer <jwt>` to the backend. The backend verifies the
Supabase JWT with JWKS and loads the current `role` and `status` from `app_users`.

Frontend authorization decisions use `GET /api/teacher/me`. JWT claims are never
trusted for role or account status.

New Supabase users are provisioned in `app_users` as `teacher` with
`status = 'pending'`. An admin must activate the account.

## Question Model

Supported types:

| Type | Answer key |
|---|---|
| `choice` | `correct` index |
| `truefalse` | `correct` index: `0` yes, `1` no |
| `sequence` | `correct` choice index |
| `sort` | `options.correctOrder` |
| `match` | `options.pairs` |
| `input` | `options.answer` |

Official and demo responses strip every answer key, including keys nested inside
`options`. Official scoring is performed by the backend.

## Event Integrity

An official event has `starts_at`, `ends_at`, `time_minutes`,
`questions_count`, status and an explicit question selection per grade.

To keep conditions fair:

- event timing, count and question selection are locked while an event is active
  or has unfinished attempts;
- a question cannot be edited or deleted after it was issued to a student;
- a question selected for an active event cannot be edited or deleted;
- `attempt_questions` preserves the question list issued to an attempt.

## Key Tables

Current implemented tables **[IMPLEMENTED]**:

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
- `school_sessions`
- `school_session_questions`
- `school_participants`
- `school_answers`
- `home_leads` (parent email + consent record)
- `home_child_profiles`
- `home_demo_attempts` (raw events + telemetry, mission id/version)
- `home_demo_reports`
- `home_entitlements` (paid access state, one per lead)
- `home_entitlement_events` (entitlement audit trail)
- `home_mission_attempts` (repeatable Club practice attempts, gated by entitlement)
- `home_payment_events` (verified provider event idempotency/audit boundary)

Remaining Home Mode concepts **[PLANNED]** would use tables or equivalent
storage for:

- provider-specific checkout/session records if the chosen provider requires
  them.

AIG/content-generation concepts **[PLANNED]** would use tables or equivalent
versioned storage for:

- item model;
- item model version;
- parameter schema and constraints;
- generator profile / seed metadata;
- scoring profile;
- distractor-generation profile;
- rendered task version used in a mission, Home report or event.

App support **[PLANNED]** may use:

- device/session records;
- refresh/session token strategy suitable for non-browser clients;
- push notification preferences after retention is validated.

## Deployment

- Frontend: `.github/workflows/deploy.yml` builds `dist/` and deploys GitHub Pages.
- Project CI: `.github/workflows/backend-ci.yml` checks frontend and backend.
- Backend hosting: `backend/render.yaml`.
- Render waits for CI checks before backend auto-deploy.
- Required backend env: `DATABASE_URL`, `SUPABASE_URL`, `ATTEMPT_SECRET`.
- Health checks: `GET /health` (liveness) plus database-aware `GET /ready`
  (readiness) and `GET /ping` (keep-awake); `/ready` and `/ping` return `503`
  if the database is unreachable.

## Operational Notes

- Frontend JWT refresh is automatic: on a `401`, `authRequest` refreshes the
  Supabase session once (`grant_type=refresh_token`) and retries the request;
  concurrent calls share one in-flight refresh. Only a failed refresh (missing
  or expired refresh token) clears the session and requires login.
- Rate limiting is in process memory and is suitable only for one Render instance.
- Database backup and restore are handled operationally.
