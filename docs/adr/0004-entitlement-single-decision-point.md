# ADR-0004: Entitlement is the single access decision point

_Status: Accepted — 2026-07-06_

## Context

Paid Home / Rozumko Club access needs to gate real content (Club practice
questions, mission reports, progress, future finals and diplomas). Payment logic
is where money, access and correctness can dangerously blur: a bug that lets
payment state alter a score, or that grants access on an unverified webhook, is a
serious failure. We also need the answer to "does this user have access right
now?" to be consistent everywhere and to fail safe.

## Decision

Paid access is represented by backend **entitlement state**
(`active | past_due | canceled | expired | revoked`), and **`hasHomeAccess` is
the single decision point**. It fails closed:

- `expired` / `revoked` always block;
- a missing `current_period_end` blocks even `active`;
- `past_due` gets a bounded grace window; `canceled` keeps access only until the
  period end.

Every status change writes an audit event with an actor (`admin` for manual
control, `provider` for verified payment events). Payment webhooks must be
verified (HMAC signature + configured secret + idempotent
`(provider, provider_event_id)`) **before** they touch entitlement, in one
transaction.

**Entitlement unlocks access. It never changes scoring, answer keys or stored
answers** — enforced by a source-level regression test on the entitlement and
webhook modules.

## Alternatives considered

- **Checking payment status inline at each call site** — rejected: inconsistent,
  easy to forget, easy to make fail-open.
- **Granting access directly from a payment callback** — rejected: unverified or
  replayed callbacks could grant access; verification and idempotency must gate
  every state change.
- **Storing card data** — rejected: card data stays with the provider; we store
  only the minimum references and entitlement state.

## Consequences

- One function to reason about, one audit trail, fail-closed by default.
- Provider-specific checkout/webhook adapters (planned) must map into this
  neutral boundary and land their regression tests **before** the feature code.
- Do not add an access check that bypasses `hasHomeAccess`, and do not let the
  entitlement modules import or touch scoring code.
