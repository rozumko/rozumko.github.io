# ADR-0005: Public repo — secret hygiene

_Status: Accepted — 2026-07-06_

## Context

The repository is **public** — published deliberately for transparency (see
README and the public transparency page). This is a conscious choice: the
product's security does not rely on the code being secret. It relies on real
secrets staying out of the repo and on scoring/answer-keys/access decisions
living on the backend (see [ADR-0001](./0001-server-side-scoring.md),
[ADR-0003](./0003-backend-only-db-access.md),
[ADR-0004](./0004-entitlement-single-decision-point.md)).

For that stance to hold, everyone contributing must treat every committed file —
code, docs, examples — as world-readable forever, including by an attacker.

## Decision

**No real secret value ever enters the repository or any doc.**

- Real secrets — `DATABASE_URL`, `ATTEMPT_SECRET`, Supabase **service-role** key,
  `HOME_PAYMENT_WEBHOOK_SECRET`, any provider secret — live only in local `.env`
  files and the host's secret store (Render / Supabase). `.env` is gitignored.
- `.env.example` files carry **placeholders only**, plus the command to generate
  a secret where useful.
- Documentation names environment variables and explains where to obtain them —
  it never pastes their values.

Deliberately public values are fine and expected in the frontend: the Supabase
**anon/publishable** key and the **Turnstile site key** are meant to ship in the
browser bundle, so they may appear in `.env.example`. Know the difference:
publishable/anon and site keys are public by design; service-role, database and
signing secrets are not.

Operational secrets, backup locations and incident contacts are kept in a
**private** checklist outside this repo.

## Alternatives considered

- **Going private to hide architecture** — rejected: security by obscurity; also
  loses the transparency benefit. The design is safe to read.
- **Committing a "dev-only" `.env` for convenience** — rejected: dev secrets leak
  into history and are impossible to fully remove; onboarding uses per-developer
  local `.env` instead.

## Consequences

- Reviewers must reject any PR that introduces a real secret value, and any leak
  requires rotating the exposed secret immediately (git history is forever).
- New docs are safe to publish as long as they follow this rule — which is why
  [onboarding.md](../onboarding.md) describes secrets by name, not by value.
