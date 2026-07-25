# Architecture Decision Records (ADR)

Short, dated records of **why** a non-obvious decision was made — not how the
code works today (that lives in [architecture.md](../architecture.md) and
[security-model.md](../security-model.md)), but the reasoning, the alternatives
we rejected and what we accepted in return.

Read these when you are about to change something and think "why is this done
the hard way?" — the answer is usually here.

## Rules

- **One decision per file**, numbered: `NNNN-short-slug.md`.
- **Never rewrite history.** An ADR is immutable once accepted. If a decision
  changes, add a **new** ADR that supersedes the old one and link both ways.
- Keep it short: Context → Decision → Consequences. A page is plenty.
- Status: `Accepted`, `Superseded by ADR-XXXX`, or `Deprecated`.

## Template

```markdown
# ADR-NNNN: <title>

_Status: Accepted — <date>_

## Context
What forced a decision. Constraints, the problem, what was at stake.

## Decision
What we chose, stated plainly.

## Alternatives considered
What else we looked at and why we rejected it.

## Consequences
What this buys us and what it costs. Follow-ups it creates.
```

## Index

- [ADR-0001: Server-side scoring only](./0001-server-side-scoring.md)
- [ADR-0002: Students have no accounts — code-based access](./0002-students-no-accounts.md)
- [ADR-0003: All DB access through the backend](./0003-backend-only-db-access.md)
- [ADR-0004: Entitlement is the single access decision point](./0004-entitlement-single-decision-point.md)
- [ADR-0005: Public repo — secret hygiene](./0005-public-repo-secret-hygiene.md)
- [ADR-0006: Content is database-owned and ships only as a published snapshot](./0006-database-owned-published-content.md)
- [ADR-0007: Question delivery is channel-scoped and fail-closed](./0007-question-delivery-channels.md)
