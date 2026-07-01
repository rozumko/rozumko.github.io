# Architecture - Rozumko

_Updated: 2026-07-01_

> **Implementation status legend.** This document mixes shipped design with
> forward-looking direction. Sections are tagged:
>
> - **[IMPLEMENTED]** — code, schema and tests exist in this repo today.
> - **[PLANNED]** — design intent only. No tables, routes or tests yet. Do not
>   assume these exist; do not build on top of them without first adding the
>   schema, routes and the security regression tests listed in
>   `security-model.md`.
>
> As of _2026-07-01_ the shipped core is the **official olympiad flow**
> (events, access codes, attempts, server-side scoring, teacher/admin panels).
> **Home Mode, payments, entitlements, parent/child/consent data and a dedicated
> anonymous School-mode backend are [PLANNED] and not implemented.**

## Overview

Rozumko is an educational platform for grades 1-4 built around short missions
that develop computational thinking and age-appropriate AI literacy. The public
product surfaces are:

- **School Mode**: a free classroom mode for trust and awareness, with no parent
  accounts, payments or child personal data.
- **Home missions**: parent-led home practice with consented child progress and
  parent-readable results.

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
| Practice | No | `isOlympiad=false` | Local feedback; answer keys are intentionally returned |
| Demo | No | Practice pool, `difficulty=hard` | No score; answer keys stay hidden |
| Official olympiad | Yes | Fixed event selection | Server-side only |

## Content Goals

Mission content is organized around:

- computational thinking: algorithms, patterns, decomposition, sequencing,
  logic, debugging and careful reading of instructions;
- AI basics: simple concepts about algorithms, data, prompts, reliability,
  ethics and safety;
- parent-readable outcomes: attention, logic, following instructions,
  confidence with tasks and useful screen time.

## School/Home Architecture **[PLANNED]**

_The School/Home split below is design intent. The listed `features/missions/`,
`features/school/`, `features/home/` directories and Home/School backend routes
do not exist yet. A public School entry page exists, but there is no anonymous
classroom backend or mission mode._

School mode and Home missions stay decoupled. School mode may send users to a
Home URL as a neutral brand path, but it does not transfer individual classroom
results into parent accounts.

| Area | School Mode | Home Mode |
|---|---|---|
| Entry | `/school` or classroom entry | `/home` or seasonal mission landing |
| Identity | Anonymous or temporary classroom session | Parent-led account/profile |
| Child data | No child personal data | Stored only after parent consent |
| Results | Aggregate/class-level only | Individual progress and reports |
| Payments | None | Paid access handled in Home |
| Scoring | Server-side for official/diploma results | Server-side for paid/diploma results |

Frontend structure:

- `features/missions/` for reusable mission runner logic;
- `features/school/` for anonymous classroom UX;
- `features/home/` for parent-led Home Mode UX.

Backend direction:

- explicit Home Mode routes for parent profile, consent, attempts, reports and
  entitlement checks;
- explicit School Mode routes only if anonymous classroom aggregate support
  requires backend state;
- all frontend HTTP calls continue to go through `features/api/client.ts`.

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

## Paid Access Direction **[PLANNED]**

_Entitlement/payment state is design intent. No entitlement or payment-provider
tables or webhook handlers exist yet; `event_registrations.payment_status` is the
only payment-related field in the schema and has no provider integration. The
**Official olympiad flow** subsection below, by contrast, is **[IMPLEMENTED]**._

Home access is represented by backend entitlement state. The data model should
be able to represent active, expired and revoked access.

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

Home Mode concepts **[PLANNED]** would use tables or equivalent storage for:

- parent identity/profile;
- child profile created by a parent;
- consent records;
- mission and mission version;
- mission attempt;
- result report;
- paid access entitlement;
- payment provider event/audit record.

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
