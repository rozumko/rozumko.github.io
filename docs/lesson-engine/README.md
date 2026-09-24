# Lesson Engine — decisions and roadmap

This folder holds the source-of-intent specifications for the Lesson Engine
initiative and the decisions that reconcile them with the current codebase.

| Document | Role |
|---|---|
| [master-spec.md](./master-spec.md) | **Primary source of intent** (v2.0). Subject-agnostic engine + subject packs, pilot and go/no-go strategy. |
| [orchestrator-spec.md](./orchestrator-spec.md) | Implementation detail: API shapes, tables, test lists, failure scenarios, Definition of Done. Where it is informatics-specific, the master spec wins. |
| This file | Binding decisions that resolve conflicts between the two specs and the repository. **This file wins over both specs.** |
| [ADR-0008](../adr/0008-lesson-engine-additive-surface.md) | Why the engine is an additive surface, not a rewrite. |

The specs are kept verbatim (Ukrainian) as they were agreed. Do not edit them
to record a change of mind — add a decision here instead.

## Core stance

Lesson Engine is a **new, additive product surface**. School Mode, Home
(micro-lessons, path, missions) and Olympiad keep their tables, routes,
identity models and API contracts unchanged. Nothing is migrated into the
engine; the engine reuses existing building blocks through adapters.

## Naming (resolves collisions with existing code)

| Concept | Name in code | Why |
|---|---|---|
| The engine | "Lesson Engine" | — |
| Frontend module | `features/lesson-engine/` | `features/lessons/` is taken by micro-lessons |
| Tables, routes, backend libs | `curriculum_*`, `curriculum-*` | `lesson-editorial.ts`, `lesson-validation.ts`, `micro_lessons` are taken |
| Subject content bundle (spec: "Content Pack") | **Subject Pack** (`subjectPackId`) | `public/content-packs/` already means published game packs |
| Static export path | `public/curriculum-lessons/` | as in both specs |

## Resolved conflicts between the specs

1. **Lesson schema** — the master spec's subject-agnostic shape wins:
   `subject`, `subjectPackId`, `grade: number`, optional `moduleId`/`unitId`/`lessonNumber`.
   The orchestrator's `grade: 1|2|3|4` and required `moduleId` are dropped.
2. **Editorial status is not part of the definition.** Both specs put
   `metadata.status` inside the lesson; ADR-0006 already makes status a
   property of the DB row. Keeping it in both places would let them drift, so
   the definition carries no status.
3. **Block types.** `checkpoint` is not a block type: practice / checkpoint /
   evidence is the `telemetry` role of an `activity` block (a checkpoint block
   without an activity would have nothing to measure). `practice` stays as a
   block type meaning *guided practical work outside the engine* (OS apps,
   paper) — it carries steps, not telemetry.
4. **Answer keys** live only in `activity.scoring.key`, including post-answer
   feedback (`explanation`) because it reveals the answer. Keys are server-only
   for every telemetry role, practice included — there is no "local practice
   with a client-side key" (ADR-0001). `toDisplaySafeLesson()` is the single
   exit point that strips them.
5. **External tools.** A lesson references a tool by `toolKey`; the URL lives in
   the subject pack's allowlist. Launch-only tools must have `scoring.mode = "none"`.
6. **Classroom control interface** — the master spec's
   `ClassroomControlProvider { listDevices, launchUrls }` is the shape; the
   orchestrator's `commandId` / ACK semantics are kept inside it.
7. **Run event log** — the orchestrator's `lesson_run_events` is kept (the
   master spec omits it but does not reject it).
8. **Docs file names** — everything lives under `docs/lesson-engine/`; the
   `guided-lessons-*.md` / `lesson-engine-*.md` lists in the specs map to files
   here as each stage lands.
9. **Frontend check command** — `npm run check:frontend` exists and is the gate
   (it includes typecheck, lint, tests, build and layout tests).

## Unified roadmap

Changes to the specs' phase order: **web join (QR/PIN + roster mapping) comes
before Classroom Remote.** It is fully under our control, reuses the proven
School Mode token/polling pattern, and lets a real class pilot happen without
waiting on the extension protocol.

| Stage | Scope | Gate |
|---|---|---|
| **A** ✅ | Specs + this decision record + ADR-0008 | Reviewed |
| **B** ✅ | Schema v1 types, fail-closed validator, subject-pack check, display-safe projection, fixtures (reference lesson + synthetic `test-subject`) | Backend build + tests green; subject-independence and key-leak tests |
| **C** ✅ | `curriculum_lessons` + `curriculum_lesson_revisions`, RLS in the same migration, admin editorial API (clone of the micro-lesson pattern), feature flag enforced by the backend | Draft/review/publish, immutable snapshot, RLS regression test, security tests |
| **D** ✅ | Teacher document view + presentation view from one definition (`features/lesson-engine/`) | No duplicated content; teacher-only never on the board; Playwright |
| **E** ✅ | Activity adapter: server-scored choice/truefalse/classify + existing `features/activities` games (client-unverified) behind one result envelope | Same mechanic in board and student mode; no key leak |
| **F** ✅ | `lesson_runs`, `lesson_run_students`, `lesson_run_events`, teacher console (Next/Back/Pause/Resume/Finish) | Server-side state machine; reload-safe; content edits do not touch active runs |
| **G1** ✅ / **G2** ✅ | Web join + roster mapping, scoped launch token, submit, polling live heatmap | 5 simulated students; idempotent submit; teacher reload restores state |
| **H** ✅ | Outcome registry, evidence, lesson report | Every summary traces to evidence → attempt → block → run → lesson version |
| I | `ClassroomControlProvider`: fake first, then Classroom Remote | Fake works in CI; real: 3–5 devices, correct URL on correct device |
| J | IndexedDB outbox → internal pilot → external pilot → go/no-go | Offline submit produces exactly one server attempt |

No mass content migration before the external pilot (both specs agree).

## Stage B — what exists

- `backend/src/lib/curriculum-lesson-schema.ts` — types, `validateLessonDefinition()`,
  `validateLessonAgainstPack()`, `validateSubjectPack()`, `toDisplaySafeLesson()`.
  Validation collects every issue with a JSON path (usable later as a
  migration report) and rejects unknown fields, dangling references and HTML.
  Text supports only `**bold**` and `` `code` `` markup; renderers escape the rest.
- `backend/src/lib/subject-packs.ts` — code-owned subject pack registry
  (`informatics-ua-primary`). A lesson with an unregistered pack cannot be saved.
- `backend/src/lib/curriculum-fixtures/` — reference lesson `g2-m2-l8` and a
  synthetic `test-subject` lesson/pack.
- A guard test fails if subject names leak into the core schema module.

## Stage C — what exists

- Migration `0049`: `curriculum_lessons` (draft definition + published
  snapshot, `edit_version` / `content_version` / `published_version`) and
  append-only `curriculum_lesson_revisions`. RLS is on for both. Triggers keep
  each published version immutable and history append-only.
- `backend/src/routes/curriculum-admin.ts` under `/api/admin/curriculum/lessons`:
  list, get, create, update (a content change bumps `content_version` and
  returns the lesson to draft; the published snapshot stays), status,
  revisions and restore. The pure rules live in `curriculum-editorial.ts`.
  `content_version` is stamped by the server; the editor never sets it.
- Workflow: `draft → review → published → archived`; `review → draft`;
  `archived → draft`. Publishing requires review and re-validates the draft
  against the current pack. A published lesson changes only by editing.
- Feature flag `LESSON_ENGINE_ENABLED` (backend env, exactly `"true"`; default
  off; declared as `"false"` in `render.yaml`). Off → every route is a 404
  before validation, auth or DB access.
- A new generic regression test fails if any `pgTable` lacks an RLS migration.

Verified beyond unit tests: all migrations `0000`–`0049` applied to a clean
PostgreSQL 16, then a scripted end-to-end run through the real routes (admin
JWT against a local JWKS). It covered teacher refusal, validation issues,
duplicate id, optimistic locking, skip-review refusal, publish, edit after
publish with an untouched snapshot, trigger rejections, append-only history
and restore.

## Stage D — what exists

- Teacher API `/api/teacher/curriculum/lessons` (list) and `/lessons/:id`
  (`backend/src/routes/curriculum-teacher.ts`). It uses the same flag-first
  404 and `requireAuth`, serves only published, non-archived lessons, and
  always goes through `toDisplaySafeLesson()`. `/api/teacher/me` now returns
  `features.lessonEngine`, so the cabinet shows the "Керовані уроки" link only
  when the backend serves the surface.
- `lesson-engine.html` + `lesson-engine.ts`: lesson list → teacher document →
  board. It uses the teacher session from `teacher.html` (same tab).
- `features/lesson-engine/`:
  - `types.ts` — display-safe types; a guard test compares its enums with the
    backend schema.
  - `rich-text.ts` — `**bold**` / `` `code` `` into DOM nodes, never innerHTML.
  - `projection.ts` — `presentationSlides()` is the only gate onto the board:
    student-visible blocks with an authored projection; a `teacher-note` never
    qualifies, even with forged flags.
  - `document-view.ts` — the full plan: timing, modality, activity role,
    teacher notes, speaker hints, and "show from here".
  - `presentation-view.ts` — full-screen dialog: ←/→, PageUp/PageDown, Space,
    Home/End, Escape; swipe; focus trap; speaker notes never rendered.
- Asset `public/curriculum-lessons/assets/g2-m2-l8-file-flow.svg`, extracted
  from the source lesson. A broken image falls back to its alt text.
- `tests/layout/lesson-engine.spec.ts`: sign-in and flag-off states; the
  teacher document with notes; every board slide by keyboard with no teacher
  note, speaker hint or answer text; axe WCAG 2.2 AA on both views; start from
  a block; the diagram loads; no horizontal scroll at 375 px.

## Stage E — what exists

Decisions:

- **Mechanic `game`** embeds a platform game from `features/activities`
  (`config: { gameKey, level }`). It is always `client-unverified`, carries no
  key, and can never be primary evidence. The subject pack lists which games a
  lesson may use (`SubjectPack.games`). The editorial layer also checks the
  game and level against `backend/src/lib/school-activities.ts`, so the core
  schema stays game-agnostic. `fact-or-opinion` is excluded because it needs a
  School participant token.
- **Board checks never cover evidence.** "Виконати разом" is offered for
  `practice` and `checkpoint` only. Evidence shows «учні виконують
  самостійно»: checking it on the board first would give the class the
  answers.
- **Feedback never returns the key.** The server says which submitted items
  were right, plus the authored explanation (which lives in the key because
  it reveals the answer). For a choice, only the chosen option is judged.

Code:

- `backend/src/lib/curriculum-activity-scoring.ts` scores choice, truefalse
  and classify into the common result envelope (`server-verified`), and
  rejects incomplete or malformed answers rather than guessing.
- `POST /api/teacher/curriculum/lessons/:id/activities/:instanceId/check`
  scores against the published snapshot. It returns 409 for evidence or
  unscored activities, stores nothing (attempts arrive with runs), and is
  rate-limited to 120/min.
- `features/lesson-engine/board-answers.ts` holds the pure logic: board mode,
  questions, answer building, and the game result envelope (always
  `client-unverified`, clamped). `activity-board.ts` renders the widgets:
  radio groups with "Перевірити"/"Спробувати ще раз", verdicts not conveyed
  by colour alone, and a game panel with start/stop. A running game owns the
  keyboard, so slide shortcuts pause until it stops.
- Playwright: doing an activity together (server-scored in the test
  process), radio arrows not changing slides, evidence never checkable on
  the board, and a platform game holding the keyboard until stopped.

## Stage F — what exists

- Migration `0050`: `lesson_runs` (frozen published snapshot and version,
  status, current step), `lesson_run_students` (roster snapshot keyed by
  `class_students.id`) and `lesson_run_events` (lifecycle audit). RLS is on
  for all three.
  - A partial unique index allows **one open run per class**; preparing
    again returns 409 with the open `runId`, so the UI resumes instead of
    forking.
  - Triggers keep identity and snapshot immutable, freeze finished and
    cancelled runs, forbid deleting runs, and keep events append-only.
  - Deleting a student sets their run rows' `class_student_id` to NULL:
    history is anonymised, not blocked.
- `backend/src/lib/lesson-run-state.ts` holds the pure state machine:
  `prepared → active ⇄ paused → finished`, and `cancel` from any open state.
  Steps are the `runtime.step` blocks. Navigation works while `active` or
  `paused` (pause, go back to the explanation, resume).
- `/api/teacher/lesson-runs` (`routes/lesson-runs.ts`): list, prepare,
  get, `/:id/start|pause|resume|finish|cancel` and `PUT /:id/step`. Every
  transition runs in a transaction with `FOR UPDATE` and writes an event.
  Every lookup is scoped to the requesting teacher (another teacher's run is
  a 404), the class must be the teacher's own, and the view serves the
  frozen lesson through `toDisplaySafeLesson()`.
- Console (`features/lesson-engine/run-console.ts`, `?run=<id>`):
  - status badge, sticky controls, a step list, and the current step with
    the teacher notes and support blocks that follow it;
  - every action goes through one ordered queue and re-renders from the
    server's answer, so a reload or a second tab shows the real state;
  - rapid board navigation coalesces into one request for the latest step;
  - finishing asks for confirmation;
  - the board follows the run: moving to a step slide moves the run.
- The lesson page has a class picker and "Підготувати урок", plus "Продовжити
  урок" when that lesson has an open run. The list page shows unfinished
  lessons; if loading runs fails, the list still renders.

Verified on a real PostgreSQL 16 (migrations `0000`–`0050` plus a scripted run
through the real routes): foreign class refused; second prepare returns 409
with the open run; another teacher gets 404 on view, action and list; no step
before start; step range enforced; reteach while paused; the step survives a
reload; republishing the lesson leaves the running snapshot unchanged;
deleting a student anonymises their row; finished runs refuse everything;
trigger rejections; events recorded in order.

## Stage G1 — what exists (web join)

Decisions:

- **The child types a code, never a name.** Joining creates an anonymous
  device with a pairing number shown big on the child's screen. The teacher
  maps "№ 4" to a roster student in the console. A device never sees the
  roster; after mapping it learns only its own label. Anyone who merely
  knows the code learns nothing about the class.
- **Device token** = HMAC(`ATTEMPT_SECRET`, `lesson-run-device:` + deviceId).
  It is domain-separated, so School, olympiad and Home tokens cannot be
  replayed as device tokens. It carries no PII, is checked in constant time,
  and is honoured only while the device row is live (not revoked, not
  expired after 4 h). Tokens travel in POST bodies, never in URLs; the join
  page also strips `?code=` from the address bar once used.
- **Join code:** 6 digits, 3 h lifetime, unique while set, and throttled per
  code and per IP with the School classroom limits. Rotating the code stops
  new joins but keeps joined devices. Finishing or cancelling a run clears
  the code in the same write (a DB check forbids a code on a closed run).

Code:

- Migration `0051`:
  - `lesson_runs.join_code`/`join_code_expires_at`;
  - `lesson_run_devices`, which is never deleted (revoked instead): one live
    device per student, pairing numbers never reused;
  - widened event types (`join_*`, `device_*`) and actor `device`.
- Teacher: `POST|DELETE /api/teacher/lesson-runs/:id/join-code`,
  `GET /:id/devices`, `PUT /:id/devices/:deviceId` (mapping a student who is
  on another device moves them), `DELETE /:id/devices/:deviceId` (revoke).
  All owner-scoped; changes are allowed only while the run is open.
- Student (`routes/lesson-student.ts`, no Supabase): `POST
  /api/student/lesson/join` and `POST /api/student/lesson/state` (status,
  pairing number, own label once mapped).
- Console join panel (`features/lesson-engine/join-panel.ts`): code grouped
  as "482 913", QR, link, full-screen code for the board, new code, close
  joining; a device list polled every 3 s with a roster picker per device,
  "(зараз на № N)" hints and revoke.
- `lesson-join.html` + `lesson-join.ts`: code entry for grades 1–4, big
  pairing number, a greeting once mapped, "урок завершено" at the end. The
  device survives a reload via sessionStorage.

Verified on a real PostgreSQL 16 (migrations `0000`–`0051` plus a scripted
flow through the real routes): join refused without a code; two anonymous
devices; one device's token rejected for another; an unmapped device sees no
roster; mapping gives the child their label; moving a student frees the old
device; revoke returns 401; numbers are not reused; rotating the code kills
the old one; closing and finishing clear the code; a finished run refuses
device changes; triggers fire; 429 after many wrong codes from one IP.

## Stage G2 — what exists (activities on devices, live state)

Decisions:

- **One open activity per run** (`lesson_run_dispatches`, partial unique
  index). Sending another activity closes the previous one. Sending is
  allowed only while the run is `active`. Pausing hides the task on devices,
  and devices refuse answers while paused. Finishing or cancelling closes
  any open dispatch.
- **Attempts are append-only and idempotent.** Each submission carries a
  device-generated `clientAttemptId`. Replaying it returns the stored
  attempt: same answer, same score. It never creates a second row (one row
  even under concurrent submits). Submissions are serialised per device
  with `FOR UPDATE`.
- **Trust follows the mechanic, enforced in the DB:** choice, truefalse and
  classify are `server-verified`, scored against the run's frozen key; games
  are `client-unverified`, bounded by the platform registry
  (`normalizeActivityResult`).
- **Attempt limits:** evidence gets one attempt by default, practice and
  checkpoints get 10; `activity.attempts.max` overrides both.
- **Evidence withholds the score on the device.** The child sees "✓ Відповідь
  збережено"; neighbours cannot read answers off a classmate's screen.
  Practice and checkpoints show per-item correctness and the explanation.
- **Live grid**, polled every 2 s: students × dispatched activities with
  states *готово / увага / працює / не почав / офлайн / пропущено*, always
  shown as icon + word. A choice shared by two or more wrong answers is
  surfaced as «N з M учнів обрали однакову неправильну відповідь: …» —
  evidence for the teacher, never a verdict. The MVP sends a full snapshot;
  it is small at class size, so delta queries wait until measurements say
  otherwise.

Code:

- Migration `0052`: `lesson_run_dispatches` (close-once trigger, never
  deleted) and `activity_attempts` (append-only trigger; unique
  `(device, client_attempt_id)`; trust and count checks); event
  `activity_closed`.
- `backend/src/lib/lesson-live.ts` holds the pure rules: attempt limits, the
  key-free `studentActivityView` (external URL from the pack allowlist),
  `scoreStudentAttempt`, `liveCellState`, `choiceWrongPattern` and
  `liveSnapshot`.
- Teacher: `POST /api/teacher/lesson-runs/:id/dispatch`, `…/dispatch/close`
  and `GET …/live`.
- Student: `/state` now carries the open `task`; `POST
  /api/student/lesson/attempt` records a submission.
- Console "Учні на пристроях" panel (`live-panel.ts`): send and close the
  activity, a summary line, the shared-wrong-answer callout and the grid.
- Device task (`student-task.ts`): a shared `renderAnswerForm` (also used by
  the board), game mount with result reporting, and a launch link for
  external tools. A lost send is retried with the same `clientAttemptId`.

Verified on a real PostgreSQL 16 (migrations `0000`–`0052` plus a scripted
flow through the real routes):
- dispatch refused before start, for non-activity steps and by another
  teacher;
- devices see no keys, and an unmapped device sees no task and cannot
  answer;
- practice feedback; replay with the same `clientAttemptId` returns the
  first answer; a concurrent duplicate submit makes one row;
- the live grid shows completed and offline cells;
- evidence: one attempt, no score for the child, and a shared-wrong pattern
  for the teacher;
- games are bounded and client-unverified;
- pause hides the task and refuses answers; closing marks unanswered cells
  skipped; finishing closes the open dispatch;
- append-only and trust-check triggers fire.

## Stage H — what exists (outcomes, evidence, report)

Decisions:

- **Outcome registry lives in the subject pack** (`SubjectPack.outcomes`),
  code-owned like games and tools. A lesson may target only outcomes of its
  own pack; save and publish refuse unknown IDs. The core knows only
  generic sources (`national-standard`, `program`, `international`,
  `internal`); named frameworks live in each outcome's `mappings`.
- **Evidence is written with the attempt, in the same transaction**, only
  for `evidence` activities: one row per outcome the activity links. A
  client-reported (game) result is always demoted to `supporting`, and the
  DB check `evidence_role <> 'primary' OR trust <> 'client-unverified'` backs
  this up.
- **The written rule** (printed on the report): only the latest *primary,
  verified* evidence decides the result:
  - ≥ 80% → «Продемонстровано»;
  - 50–79% → «Прогрес»;
  - < 50% → «Потрібна підтримка»;
  - no primary evidence → «Недостатньо даних».

  Supporting and unverified data are shown but decide nothing. There is no
  hidden mastery score and no AI.
- **Every summary is traceable**: evidence → attempt (number, correct/total,
  trust, time) → activity → run → lesson version.
- **Comment draft** is deterministic and factual. It is built only from the
  summaries and counts, and the teacher reviews it before use.

Code:

- Migration `0053`: `student_outcome_evidence`. It is append-only (the only
  permitted change is anonymising: deleting a student sets
  `class_student_id` to NULL); unique per `(attempt, outcome)`; RLS on.
- `backend/src/lib/lesson-evidence.ts` holds `evidenceRowsForAttempt`,
  `summarizeOutcome`, `teacherCommentDraft` and `lessonReport`, all pure.
- `GET /api/teacher/lesson-runs/:id/report` (owner-scoped).
- `features/lesson-engine/report-view.ts` (`?run=<id>&view=report`, linked
  from the console once the lesson has started):
  - the rule, a students × outcomes table (icon + word), activity
    statistics with shared-wrong-answer patterns;
  - per-student details with the evidence trace, missing activities and the
    comment draft with a copy button;
  - print-friendly: printing opens all details.

Verified on a real PostgreSQL 16:
- a lesson with an unknown outcome is refused;
- practice produces no evidence, while an evidence activity writes primary
  rows;
- the report gives «Продемонстровано», «Потрібна підтримка» and
  «Недостатньо даних» as expected, with a traceable activity title;
- another teacher gets 404;
- the append-only and primary-trust checks fire;
- deleting a student anonymises their evidence and removes them from the
  report.

The validator lives in the backend because the backend is the authority for
anything that is published or scored. Frontend types arrive with stage D and
will be kept in sync by a guard test (the pattern used for path data).

## Open items

- **Reference lesson differs from the specs.** Both specs name `g2-m1-l1`
  "Цифрова система" as the first slice; the source file provided (`2_1.html`)
  is *Grade 2 · Module 2 · Lesson 8 — Files and Folders*. The fixture follows
  the actual source (`g2-m2-l8`). It is a good slice: explanation, diagram,
  practice choice, off-platform practical task, external tool, evidence
  self-check, reflection, success criteria. `g2-m1-l1` can follow when its
  source is available.
- **Outcome codes are internal.** The registry (`SubjectPack.outcomes`) holds
  `INF-2-FILES-1/2` with `source: 'internal'` and empty `mappings`. NUSH and
  Cambridge references are added there once a methodologist confirms the
  exact codes — never guessed. Do not use "ІФО = індекс формувального
  оцінювання": `ІФО` is the informatics education area code.
- **Classroom Remote contract** — repository `artkysliakov/classroom-remote`
  must be made readable to the agent before stage I. Nothing is invented
  before then; stages A–H do not depend on it.
- **Legacy `new_lessons`** is a reference for mechanics and UX only (stage E);
  it is not embedded or copied wholesale.
- **Render capacity** — confirm the backend plan has no cold starts during
  lessons before stage G polling goes to a real class.
