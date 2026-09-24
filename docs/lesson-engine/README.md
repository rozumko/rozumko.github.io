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
| **A** | Specs + this decision record + ADR-0008 | Reviewed |
| **B** | Schema v1 types, fail-closed validator, subject-pack check, display-safe projection, fixtures (reference lesson + synthetic `test-subject`) | Backend build + tests green; subject-independence and key-leak tests |
| C | `curriculum_lessons` + `curriculum_lesson_revisions`, RLS in the same migration, admin editorial API (clone of the micro-lesson pattern), feature flag enforced by the backend | Draft/review/publish, immutable snapshot, RLS regression test, security tests |
| D | Teacher document view + presentation view from one definition (`features/lesson-engine/`) | No duplicated content; teacher-only never on the board; Playwright |
| E | Activity adapter: server-scored choice/truefalse/classify + existing `features/activities` games (client-unverified) behind one result envelope | Same mechanic in board and student mode; no key leak |
| F | `lesson_runs`, `lesson_run_students`, `lesson_run_events`, teacher console (Next/Back/Pause/Resume/Finish) | Server-side state machine; reload-safe; content edits do not touch active runs |
| G | Web join + roster mapping, scoped launch token, submit, polling live heatmap | 5 simulated students; idempotent submit; teacher reload restores state |
| H | Outcome registry, evidence, lesson report | Every summary traces to evidence → attempt → block → run → lesson version |
| I | `ClassroomControlProvider`: fake first, then Classroom Remote | Fake works in CI; real: 3–5 devices, correct URL on correct device |
| J | IndexedDB outbox → internal pilot → external pilot → go/no-go | Offline submit produces exactly one server attempt |

No mass content migration before the external pilot (both specs agree).

## Stage B — what exists

- `backend/src/lib/curriculum-lesson-schema.ts` — types, `validateLessonDefinition()`,
  `validateLessonAgainstPack()`, `validateSubjectPack()`, `toDisplaySafeLesson()`.
  Validation collects every issue with a JSON path (usable later as a
  migration report) and rejects unknown fields, dangling references and HTML.
  Text supports only `**bold**` and `` `code` `` markup; renderers escape the rest.
- `backend/src/lib/curriculum-fixtures/` — `informatics-ua-primary` subject
  pack, reference lesson `g2-m2-l8`, and a synthetic `test-subject` lesson/pack.
- A guard test fails if subject names leak into the core schema module.

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
- **Outcome IDs are placeholders.** `int-files-name-extension` and
  `int-files-organize` are internal IDs until the outcome registry (stage H)
  maps real NUSH / Cambridge codes. Do not use "ІФО = індекс формувального
  оцінювання" — `ІФО` is the informatics education area code.
- **Diagram asset not extracted yet.** The fixture references
  `/curriculum-lessons/assets/g2-m2-l8-file-flow.svg`; the SVG from the source
  is extracted with the renderers (stage D).
- **Classroom Remote contract** — repository `artkysliakov/classroom-remote`
  must be made readable to the agent before stage I. Nothing is invented
  before then; stages A–H do not depend on it.
- **Legacy `new_lessons`** is a reference for mechanics and UX only (stage E);
  it is not embedded or copied wholesale.
- **Render capacity** — confirm the backend plan has no cold starts during
  lessons before stage G polling goes to a real class.
