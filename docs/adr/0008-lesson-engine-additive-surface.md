# ADR-0008: Lesson Engine is an additive surface, not a rewrite

_Status: Accepted — 2026-09-24_

## Context

Rozumko is moving toward a Lesson Engine: a subject-agnostic runtime that lets
a teacher conduct a structured lesson (teacher view, board presentation,
activities on student devices, live signals, learning evidence). The master
specification is in [docs/lesson-engine/](../lesson-engine/README.md).

The platform already ships School Mode (anonymous, join code, leaderboard),
Home (micro-lessons, learning path, missions, parent accounts) and Olympiad.
Each has its own identity model, privacy contract, security regression tests
and live users or pilots. "Rebuild Rozumko as a Lesson Engine" could be read as
migrating these into the new model, which would put all of them at risk for a
product hypothesis that has not been validated yet.

## Decision

The Lesson Engine is built **next to** the existing surfaces, not in place of
them.

- New tables only (`curriculum_*`, `lesson_run*`, evidence). Existing tables
  gain no columns for the engine; they are read, never reshaped.
- Reused as-is: `teacher_classes` (the class) and `class_students` (the
  persistent student identity — no student accounts).
- Reused through adapters: the editorial lifecycle and revision pattern
  (ADR-0006), server-side scoring (ADR-0001), the `features/activities` game
  registry, the question renderer, and the School Mode token/polling pattern.
- Not merged: School Mode's anonymous participants stay separate from roster
  students; `micro_lessons` is not extended into curriculum lessons.
- The surface stays behind a backend-enforced feature flag until the pilot
  passes; turning it off leaves every other mode unaffected.

## Alternatives considered

- **Evolve School Mode into guided lessons** — rejected: School Mode's privacy
  contract is anonymity; guided lessons need persistent per-student evidence.
  Mixing the two identity models would weaken the stronger guarantee.
- **Extend `micro_lessons`** — rejected: micro-lessons are a small Home format
  (video → cards → quiz). Growing them into block-based classroom lessons would
  pile incompatible optional fields onto a working contract.
- **Rewrite the platform around the engine first** — rejected: it moves all
  risk to the front, before any teacher has validated the engine.

## Consequences

- Some concepts exist twice for a while (School Mode activity results and
  engine attempts). That is accepted; convergence, if any, is a later decision.
- Every engine stage must leave School, Home and Olympiad tests green; the
  engine's own security tests are added, never traded against existing ones.
- Naming avoids existing modules: `features/lesson-engine/`, `curriculum_*`,
  and "Subject Pack" instead of "Content Pack" (see the decision record).
