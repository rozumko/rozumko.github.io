# ADR-0003: All database access through the backend

_Status: Accepted — 2026-07-06_

## Context

Supabase exposes a Data API that lets a frontend query tables directly with Row
Level Security policies. It is convenient, but it moves the trust boundary into
RLS policy correctness and scatters authorization logic across the client and
the database. For a product where scoring, answer keys, consent and paid access
must be trustworthy, that surface is too wide and too easy to get subtly wrong.

## Decision

**No frontend code calls Supabase Data API tables directly.** All application
data flows through the Fastify backend, and **`features/api/client.ts` is the
single point for every HTTP request** from the frontend. RLS stays enabled as
defense in depth, but it is not the authorization mechanism — the backend is.

Authorization decisions read from the database (`GET /api/teacher/me` for
`role`/`status`), never from JWT claims: the JWT proves identity, the database
decides what that identity may do.

## Alternatives considered

- **Direct Supabase queries + RLS as the auth layer** — rejected: authorization
  logic spreads into policies, harder to test and audit than centralized route
  handlers; couples the frontend to the database schema.
- **Trusting `role`/`status` from JWT claims** — rejected: claims can be stale
  after an admin blocks or downgrades an account; the DB is the source of truth.

## Consequences

- One typed choke point (`client.ts`) makes it possible to reason about, test and
  rate-limit the whole API surface, and to swap the backend host without touching
  every call site.
- A future native/PWA client is a client of the same backend — it must not call
  Supabase tables directly either (see multi-client rules in
  [security-model.md](../security-model.md)).
- Adding a feature means adding a backend route + a `client.ts` method, not a
  direct table query. Slightly more code; far less trust spread.
