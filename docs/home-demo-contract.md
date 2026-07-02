# Home Demo Contract - Rozumko

_Updated: 2026-07-02_

> **Status: [IMPLEMENTED]** — backend slice (tables in
> `backend/drizzle/0015_add_home_leads.sql`, routes in
> `backend/src/routes/home.ts`, validation/report generator in
> `home-validation.ts`, security regression tests in `home-flow.test.ts`
> written before the route code per `security-model.md`), typed client
> functions in `features/api/client.ts`, and the demo UI on `home.html`
> (`home-demo.ts`: track/grade intro, keyless mission via the shared
> `#mission-quiz` markup, emotional completion, consent-gated parent report).
> Demo events live in page memory only until consent; the child sees no
> numeric score — numbers appear only in the parent report.
>
> Known v1 limitation: `answerChangeCount` undercounts by design — the shared
> question renderer locks most answer types after the first commit, so only
> repeated `select` changes (match) are counted. Safe direction: the
> "attention" pattern cannot fire falsely. Track-specific demo selection now
> uses `questions.track`; Home Demo keeps a temporary difficulty fallback only
> for legacy rows that have not been tagged yet.

This document fixes the minimal data and API contract for the first Home Mode
slice: a free demo mission, a parent lead with consent, and a parent-readable
report. It exists so that the demo attempt schema captures, from day one, the
behavioral telemetry the report needs — a demo that stores only
correct/incorrect makes the behavioral report impossible later.

## Flow Overview

```text
/home (landing)
  -> child plays a demo mission (one short block per `questions.track`)
  -> emotional completion screen for the child (no correctness shown)
  -> report is LOCKED behind a parent action
  -> parent enters email + consent            POST /api/home/leads
  -> raw demo events are submitted            POST /api/home/leads/:id/demo-report
  -> backend re-scores server-side, persists attempt + report
  -> parent sees the behavioral report
```

Trust boundaries (binding, from `security-model.md`):

- **Nothing individual is persisted before consent.** The demo runs on the
  client; raw events live in page memory only.
- **The child-facing completion is emotional progress only.** Demo questions
  are loaded without answer keys; correctness and analytics are reserved for
  the parent-facing backend report.
- **The parent-facing report is parent-reporting scoring** and is therefore
  computed on the backend, from the backend's own answer keys and the submitted
  raw answers — never from client-computed correctness.
- No School session identifiers, join codes or participant tokens appear
  anywhere in this flow.

## Demo Tracks

One short demo block per direction, 5-7 items each:

| Track id | Public label (uk) |
|---|---|
| `informatics` | Інформатика |
| `computational-thinking` | Обчислювальне мислення |
| `ai-basics` | Основи ШІ |

`questions.track` is nullable for legacy content, but every new Home Demo item
must set one of these values. The UI may temporarily fall back to difficulty
while old rows are being tagged; the product contract is track-based selection.

## Mission Versioning

Reports and (later) diplomas must reference immutable content. From the first
demo mission:

- `missionId` — stable logical mission ("demo-ct-grade2");
- `missionVersion` — immutable content version (monotonic integer or content
  hash). Any change to items, order, wording or scoring produces a new version;
- a stored report references `(missionId, missionVersion)` so it can always
  explain what the child completed.

This is required now, before the AIG engine exists; AIG item-model versions
later plug into the same field.

## Types (frontend contract, `features/api/client.ts`)

```ts
type DemoTrack = 'informatics' | 'computational-thinking' | 'ai-basics'

/** One answered item with behavioral telemetry. Collected client-side,
 *  submitted raw; the backend recomputes correctness itself. */
interface DemoAttemptEvent {
  questionId: string
  /** Raw answer in the shape of the question type (index, order, pairs, text). */
  answer: unknown
  /** ms from item render to final answer commit. */
  timeToAnswerMs: number
  /** How many times the child changed the answer before committing. */
  answerChangeCount: number
  /** 0-based position of the item in the mission. */
  position: number
}

interface DemoAttemptPayload {
  missionId: string
  missionVersion: number
  track: DemoTrack
  grade: 1 | 2 | 3 | 4
  startedAt: string   // ISO, client clock, informational only
  finishedAt: string
  events: DemoAttemptEvent[]
}

interface ParentLeadPayload {
  parentEmail: string
  consent: {
    /** Version of the privacy policy text the parent accepted. */
    policyVersion: string
    acceptedAt: string
  }
  childProfile: {
    /** Display name is optional; never required for the demo. */
    displayName?: string
    grade: 1 | 2 | 3 | 4
  }
}

/** Parent-readable behavioral report. Human language, not percentages. */
interface DemoReport {
  missionId: string
  missionVersion: number
  track: DemoTrack
  /** What the child does well (skill-level statements). */
  strengths: string[]
  /** Where mistakes happen (skill-level statements). */
  struggles: string[]
  /** Detected behavioral patterns, each with a parent-readable label. */
  patterns: Array<{
    kind: 'haste' | 'double-condition' | 'attention' | 'pattern-recognition'
    evidence: string
  }>
  /** Which mission to suggest next and why. */
  nextMission: { missionId: string; reason: string }
}
```

Telemetry rules:

- `timeToAnswerMs` and `answerChangeCount` are captured for **every** item from
  the very first demo release — the pattern detectors (haste = fast + wrong,
  attention = slow drift across positions, double-condition = failures on
  two-constraint items) need them and cannot be backfilled;
- client timestamps are informational; the backend records its own trusted
  timestamps on submission.

## API (backend contract, `backend/src/routes/home.ts`)

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/home/leads` | none (rate-limited) | Create parent lead + consent record + child profile. Returns `leadToken` (HMAC with a `home-lead:` domain prefix, so it can never be confused with attempt/participant tokens for the same UUID). |
| `POST /api/home/leads/:id/demo-report` | `X-Lead-Token` | Accepts `DemoAttemptPayload`, re-scores server-side, persists attempt + report, returns `DemoReport`. Idempotent per lead+mission (repeat returns the stored report). |
| `GET /api/home/leads/:id/demo-report` | `X-Lead-Token` | Re-read a stored report. |

Notes:

- `X-Lead-Token` is a custom header: it lives in `CORS_OPTIONS.allowedHeaders`
  and in the CORS preflight regression test (see `lib/security-config.ts`) —
  any future custom header must follow the same rule in the same commit.
- all frontend calls go through `features/api/client.ts`;
- UUID params are validated before any DB access;
- consent is verified by the backend before any child data row is written —
  a `demo-report` submission without a stored lead/consent record is rejected;
- request bodies use `additionalProperties: false`; with Fastify's default AJV
  (`removeAdditional`) unknown fields — including any client-computed
  `correct`/score fields or School session identifiers — are stripped before
  the handler runs, so they can never reach scoring or storage.

## Storage (Drizzle, planned tables)

- `home_leads` — parent email, consent policy version, accepted_at,
  created_at;
- `home_child_profiles` — lead FK, optional display name, grade;
- `home_demo_attempts` — child profile FK, missionId, missionVersion, track,
  server timestamps, raw events (jsonb);
- `home_demo_reports` — attempt FK, generated report (jsonb), report version.

## Security Regression Tests

Implemented in `backend/src/routes/home-flow.test.ts` (written before the
route code) and `backend/src/security-regression.test.ts`:

1. demo-report submission without a valid consent/lead record is rejected and
   writes nothing;
2. demo-report responses never include answer keys or explanations;
3. report scoring is recomputed on the backend — client-submitted correctness
   fields are stripped by the schema and never reach scoring or stored events;
4. `X-Lead-Token` forgery is rejected, including an attempt-domain token for
   the same UUID (HMAC domain separation);
5. CORS preflight allows `X-Lead-Token` (part of the shared preflight
   regression test);
6. School session identifiers sent to `/api/home` routes are stripped and
   never stored;
7. lead creation is rate-limited, UUID params are schema-validated before DB
   access, and demo events are accepted only for practice-pool
   (`isOlympiad=false`) questions.
