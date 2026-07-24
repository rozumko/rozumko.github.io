# ADR-0007: Question delivery is channel-scoped and fail-closed

_Status: Accepted — 2026-07-24 (recorded retroactively for migration `0044`)_

## Context

One question bank feeds several surfaces with very different stakes: the static
practice bundle (ships answer keys deliberately), the Home path and demo, the
School classroom game, and official olympiad rounds. Until now the only
separation was the `isOlympiad` boolean plus per-route filters.

That was one forgotten `where` clause away from a real leak. A question written
for an official round could be picked up by a public practice query; a question
authored for the classroom game could surface in a public API response. The
boolean also could not express "this question is fine for practice but not for
the class game", which is a normal editorial distinction, not a security
afterthought.

## Decision

**Every question carries an explicit list of delivery channels
(`questions.channels`), and each surface may query only its own channel.**

- `path` — Home Mode, the learning path and the Home demo;
- `class_game` — School Mode;
- `olympiad_training` — the static practice/olympiad-training export.

The rules are fail-closed:

- an **empty** channel list means the question is delivered nowhere — absence is
  never read as "allowed everywhere";
- a main-round question (`is_olympiad = true`) must carry **no** training
  channel, and official questions continue to be issued only through
  `POST /api/student/exchange-code`;
- the public `GET /api/questions` accepts only `path` and `olympiad_training`
  (defaulting to `path`) and rejects `class_game` and `isOlympiad=true` at the
  route schema, before any database access.

`isOlympiad` is **not** replaced by channels. It remains the main-round marker
and must not be renamed — it is protected by security regression tests.

## Alternatives considered

- **Keep filtering per route with `isOlympiad` only** — rejected: the boundary
  lived in whichever `where` clause each route happened to write, so it had to
  be re-proved by hand at every new route.
- **Derive the channel from `track`/`topic`** — rejected: taxonomy answers "what
  is this question about", which is a different question from "where may it be
  shown". Overloading it would couple editorial classification to a security
  boundary.
- **Treat an empty channel list as "any channel"** — rejected: it is the
  fail-open reading. Backfilled and half-authored rows would silently become
  publicly issuable.

## Consequences

- Content authoring must set channels explicitly; a new question is delivered
  nowhere until it does.
- Any new delivery surface adds its own channel and its own allowlisted query —
  it must never widen an existing one.
- Enforced by channel regression tests in
  `backend/src/security-regression.test.ts` (School, Home and static training
  each query only their allowlisted channel; main-round questions have none).
- Documented in [security-model.md](../security-model.md) and
  [migrations.md](../migrations.md); the smoke test asserts the public endpoint
  rejects `channel=class_game`.
