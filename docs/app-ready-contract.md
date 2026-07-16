# App-Ready Contract

Updated: 2026-07-16

Status: active architecture contract. Rozumko is a web/PWA product today. This
contract defines the boundaries that must remain true so a wrapped or native
client can be added without forking the product. It is not a commitment to a
specific framework or app-store release date.

## Readiness Levels

| Level | Meaning | Current state |
| --- | --- | --- |
| Web/PWA ready | Responsive touch UI, installable assets, offline-safe shell and shared backend authority | Implemented baseline |
| Wrapper ready | The web client can run in a WebView after explicit navigation, storage, deep-link and payment review | Partial; not release-approved |
| Native-client ready | A separate client can use a documented versioned API, secure native session storage and platform payment adapters | Planned |

The project must not claim native-client readiness until every required item in
this document has an implementation and dated evidence.

## Non-Negotiable Product Boundaries

- Web, PWA, wrapped and native clients are clients of one backend product.
- Official scoring, answer keys, consent, entitlement and paid-access decisions
  remain on the backend.
- School, Home and Olympiad identities and data flows remain separate.
- No mobile client receives direct access to PostgreSQL or Supabase tables.
- A native or wrapped client must not duplicate scoring, entitlement, consent
  or content-unlock rules.
- `GET /api/teacher/me` and `GET /api/parent/me` remain the authority for role,
  account status and ownership; JWT claims are not product authorization.

## Client Architecture

Reusable domain modules must not depend directly on `window`, `document`,
`localStorage`, `sessionStorage`, browser navigation or DOM element types.
Browser-specific behavior belongs in adapters or page controllers.

Current modules treated as reusable domain contracts:

- `features/missions/mission-pick.ts`
- `features/missions/mission-result.ts`
- `features/path/activity-result.ts`
- `features/olympiad/public-question-policy.ts`
- `features/games/round-utils.ts`
- `features/admin/event-utils.ts`

Adding a browser dependency to this list must fail the architecture tests. A
module may leave the list only through an ADR that identifies its replacement.

## API Contract

Before a native client is started, publish a machine-readable API contract for
missions, attempts, reports, profiles, path progress and entitlements. It must
define:

- request and response schemas;
- stable error codes and retryability;
- authentication requirements;
- idempotency behavior;
- pagination where lists can grow;
- timestamps and timezone rules;
- content, lesson, path and API compatibility versions;
- additive-change and deprecation policy;
- minimum supported client version and forced-upgrade behavior.

Until that contract exists, the TypeScript types in `features/api/client.ts`
are the web-client boundary, not a promise of native API stability.

## Authentication and Session Storage

The web client currently uses Supabase Auth and tab-scoped `sessionStorage`.
That is not a native storage strategy.

A native client must:

- store refresh credentials only in Keychain/Keystore-backed secure storage;
- keep access tokens in memory where practical;
- use one audited refresh-and-retry path;
- clear all credentials on logout, revocation or account disablement;
- verify role, status and ownership through backend `/me` endpoints;
- never log tokens, authorization headers, access codes or child identifiers;
- define device-loss, clock-skew and offline-expiry behavior.

Web storage must remain behind web adapters. Do not make reusable domain logic
read `sessionStorage` or `localStorage` directly.

## Offline and Synchronization

- Local progress is provisional until acknowledged by the backend.
- Official or paid results never become authoritative from local state alone.
- Queued writes require stable idempotency keys, bounded retention and explicit
  conflict behavior.
- Content and path replay must preserve the version used when the activity was
  completed.
- A client must distinguish offline, retrying, saved locally and server-saved
  states in user-facing language.
- Sensitive tokens and personal codes must not be placed in durable queues.

## Navigation and Platform Integration

A wrapper or native client needs explicit adapters for:

- internal navigation and external browser links;
- deep links and universal/app links;
- back-button and interrupted-flow behavior;
- safe-area insets, orientation and soft keyboards;
- file sharing, printing and certificate export;
- network status and app lifecycle resume;
- accessibility settings including text scaling and reduced motion.

Critical flows must not depend on hover, browser history quirks or a fixed URL
origin.

## Payments

- Entitlement remains the single backend access decision.
- Provider webhooks remain signed, idempotent and audited.
- Web checkout and app-store purchase adapters may differ, but both map into the
  same entitlement state machine.
- Store receipts must be verified server-side.
- Payment-provider or app-store rules must not fork mission, scoring or consent
  behavior.

## Security and Privacy

- Use platform secure storage; never store card data.
- Preserve data minimization and adult consent for child profiles.
- Use allowlisted external navigation and fail closed on unknown deep links.
- Define certificate pinning only after an operational rotation plan; do not
  hardcode certificates casually.
- Crash and analytics tooling must exclude child content, tokens, access codes,
  emails and free-text answers by default.
- A wrapper must receive the same CSP, framing, origin and Turnstile review as
  the web deployment.

## Release Evidence

Wrapper or native release approval requires a dated record of:

- API contract validation against staging;
- login, refresh, logout, revocation and offline-expiry tests;
- secure-storage inspection on a real iOS and Android device;
- School/Home/Olympiad data-boundary tests;
- payment sandbox purchase, renewal, cancel, expiry and restore tests;
- interruption, resume, deep-link and upgrade tests;
- WCAG-oriented keyboard/screen-reader where applicable, platform screen-reader,
  text scaling, reduced motion and touch testing;
- low-end device and degraded-network smoke;
- privacy review of logs, crash reports and analytics;
- rollback and minimum-client-version procedure.

## Change Gate

Create an ADR before choosing Capacitor, another WebView wrapper, React Native,
Flutter or a native implementation. The ADR must compare lifecycle maturity,
accessibility, secure storage, deep links, update strategy, payment constraints,
bundle size and the cost of keeping domain behavior shared.

