# ADR-0001: Server-side scoring only

_Status: Accepted — 2026-07-06_

## Context

The product issues results that matter: parent-readable reports, paid Club
practice progress, official olympiad scores and diplomas. Anything the browser
computes or holds can be inspected and forged by a determined user (or a curious
child). If answer keys reach the browser, or if the browser tells the server
"I got 9/10", the result means nothing.

## Decision

The browser is untrusted. **Official, paid, demo, diploma-generating and
parent-reporting scoring happens only on the backend**, and answer keys never
reach the browser — they are stripped from every response, including keys nested
inside `options` (`sort`, `match`, `input` types). The client submits raw
answers; the server decides correctness.

The one deliberate exception: the **static practice bundle**
(`public/questions/`) may ship local-feedback keys, because practice has no
stakes — no report, no score, no diploma. This is an explicit, bounded carve-out,
not a loophole to reuse.

## Alternatives considered

- **Client-side scoring with a "trust me" submission** — rejected: trivially
  forged, and it would put answer keys in the bundle for stakes content.
- **Obfuscating keys in the client** — rejected: security by obscurity; the
  bundle is public and readable.

## Consequences

- Scoring logic and answer keys stay in `backend/src/`. Adding a new question
  type means adding a server-side scorer and a stripper for its nested keys.
- Enforced by `backend/src/security-regression.test.ts` and the school/home
  flow tests. If one of those goes red after your change, you have moved a key
  or a scoring decision toward the browser — stop and read
  [security-model.md](../security-model.md).
- Practice can work offline against the static bundle with no backend round-trip;
  everything with stakes cannot.
