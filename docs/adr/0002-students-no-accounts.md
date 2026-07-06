# ADR-0002: Students have no accounts — code-based access

_Status: Accepted — 2026-07-06_

## Context

The users are children in grades 1-4. Every account we create for a child is
personal data we must store, protect, justify under child-privacy expectations
and eventually delete. A child mid-lesson also cannot be expected to manage a
password or an email confirmation.

## Decision

**Students never get Supabase Auth accounts.** Access is code-based and
ephemeral:

- **Olympiad**: a teacher-issued access code, exchanged once via
  `POST /api/student/exchange-code`, which returns a stateless HMAC attempt
  token. Codes are consumed atomically and carry a TTL clamped to the event's
  `ends_at`, so the brute-force window is bounded.
- **School classroom game**: an anonymous session-scoped HMAC participant token
  plus an avatar from a fixed allowlist and a free nickname label. No real name
  required, control characters stripped, no per-child recovery path — closing the
  tab ends the participant.

Only **teachers and admins** authenticate (Supabase Auth + JWKS verification).

## Alternatives considered

- **Full student accounts** — rejected: maximal child-data liability for a group
  that cannot manage credentials; nothing in the product needs a durable child
  login.
- **Reusing a school session token to recover an individual result later** —
  explicitly forbidden: it would create a child-tracking identifier across
  surfaces. See [ADR and security-model rule 7](../security-model.md).

## Consequences

- Minimal child PII by construction. School Mode stores no child personal data
  at all; Home Mode stores child progress **only** after explicit parent consent.
- Crash recovery for olympiad stores only non-secret metadata in the browser —
  never the token or the personal code.
- Any future "let a child log in" idea must go through a new ADR and an explicit,
  parent-led, audited identity flow — it cannot be bolted onto session tokens.
