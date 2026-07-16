# Architecture Conformance and Drift Guardrails

Updated: 2026-07-16

Status: active engineering baseline. This document records what is enforced,
what is only partially evidenced, and which manual checks are still required.
It is not a WCAG certification, a security certification, or proof that every
supported device and hosting provider has been tested.

## Source-of-Truth Order

When requirements conflict, use this order:

1. `.agents-product-strategy.md` for private product direction and the
   School/Home/Olympiad boundaries.
2. `docs/security-model.md` for trust, identity, scoring, consent and data
   boundaries.
3. `docs/architecture.md` and ADRs for technical ownership and client/server
   responsibilities.
4. `docs/content-taxonomy.md`, `docs/responsible-edtech-evidence.md` and
   `standards.html` for educational and public evidence claims.
5. This matrix for the current verification and enforcement status.

Documentation is not enforcement by itself. Every critical invariant should
have a test, CI gate, deployment check, or an explicitly owned manual control.

## Conformance Matrix

| Area | Current state | Evidence and automated guard | Residual risk / required manual proof |
| --- | --- | --- | --- |
| Product direction | Enforced baseline | Private strategy; architecture and roadmap docs; backend tests keep Home and School routes/data separate | Copy and new journeys still require human product review; automation cannot detect manipulative or strategically wrong UX reliably |
| Server authority | Strong | Backend scoring, entitlement, consent and validation tests; security regression suite; official answer keys remain server-side | New route families need explicit threat review and negative tests |
| Frontend HTTP boundary | Enforced | `features/api/client.ts`; `features/architecture/architecture-conformance.test.mjs` rejects literal backend/auth endpoint calls elsewhere | Static content loaders intentionally remain separate; a deliberately obscured dynamic URL still needs code review |
| WCAG 2.2 AA target | Partial, improving | Static HTML guards plus Playwright/axe on core pages, dashboards and rendered question types; keyboard behavior tests for choice/sort mechanics | Axe is not certification; manual keyboard, screen reader, 200% zoom, contrast, reduced-motion and child-usability evidence remains required |
| Mobile/touch | Good automated baseline | 320/375 px header and overflow checks; phone portrait/landscape, tablet and desktop quiz-fit matrix; 44 px shared target checks | Real iOS Safari, Android Chrome, soft keyboard, orientation change and low-end device testing are not covered |
| App readiness | Partial with enforced contract | `docs/app-ready-contract.md`; backend owns business rules; API calls are centralized; selected reusable domain modules reject browser globals; content and path data are versioned | Web auth/session code remains coupled to Supabase and `sessionStorage`; the machine-readable native API contract, secure native token adapter and app-store payment adapter are not implemented |
| Hosting portability | Good backend baseline, partial full-stack proof | Dockerfile, Compose reference, PostgreSQL/Drizzle migrations, `PORT`, readiness endpoints, configurable API/Auth URLs, CSP origins derived from build environment | Restore/cutover has not been proven on a second provider in this baseline; rate limiting is single-instance memory mode; Supabase Auth migration is separate from PostgreSQL migration |
| Educational standards/evidence | Partial | Content taxonomy, public standards page, responsible EdTech evidence portfolio and canonical content validation | Framework mappings are evidence models, not certifications; new public claims and curriculum mappings need dated official-source review and educator judgment |
| Security | Strong code baseline, operational proof required | Backend regression suite, fail-closed readiness/migration behavior, supply-chain workflows, secret scan, CSP/framing guards | Branch protection, Supabase controls, Render settings, backup evidence and authenticated staging smoke are external/manual controls |
| Cross-browser support | Limited evidence | Chromium is exercised in Playwright CI | Firefox, WebKit/Safari and assistive-technology combinations are not CI-gated |
| Database/deploy integrity | Strong static/test baseline | Migration journal checks, schema/RLS regression tests, Render `checksPass`, `/ready` fails on drift | This local audit had no Docker or `psql`; a disposable/staging database migration and restore rehearsal remains required |
| Frontend code quality | Incremental enforcement | ESLint blocks unsafe control-flow and JavaScript hazards; TypeScript enforces strict function variance, unknown catch variables, explicit returns, switch fallthrough and overrides | Full `strictNullChecks`, `noImplicitAny` and checked legacy JavaScript remain migration work; new debt should not increase |

## Required Change Gates

Every pull request must pass:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:layout
cd backend
npm run build
npm test
```

`Project CI` now runs the browser-backed layout/accessibility suite on pull
requests. The repository owner must configure branch protection so the backend
and frontend jobs are required before merge. A workflow that runs but is not a
required check is not a complete merge guard.

Changes in these areas require additional evidence:

| Change | Additional gate |
| --- | --- |
| Auth, API, scoring, consent, entitlement, DB or deploy | Read `docs/security-model.md`; add negative/fail-closed tests; run backend build/tests |
| Markup, focus, CSS, dialogs or mission controls | Run full `npm run test:layout`; manually check keyboard and 200% zoom for the changed flow |
| New external API/Auth/analytics host | Configure through environment; update CSP, service-worker bypass rules if needed, CORS and portability runbook |
| New reusable mission/path logic | Keep DOM, `window`, URL and storage access in adapters; unit-test the domain logic without a browser |
| Standards, curriculum or public compliance claim | Link a dated primary/official source; state strong/partial/limited evidence; do not describe an audit as certification |
| School/Home/Olympiad journey | Verify identity, data and commercial boundaries against the private strategy and add a regression test where the rule is machine-checkable |

## Decision Guardrails

Create or update an ADR before a change that does any of the following:

- introduces a new identity or authorization model;
- moves a business rule between client and server;
- adds a provider-specific dependency to domain logic;
- changes the School/Home/Olympiad data boundary;
- creates a separate mobile backend or duplicates scoring;
- changes the content/versioning contract;
- weakens a fail-closed security or migration behavior.

The ADR must state the invariant, alternatives, migration/rollback path and the
test or operational control that will prevent silent reversal.

## Manual Evidence Still Required

Before an institutional pilot or accessibility claim, record:

- keyboard-only completion of the P0 child, parent and teacher flows;
- NVDA or another relevant screen-reader smoke on Home and School flows;
- 200% zoom and reduced-motion behavior;
- iOS Safari and Android Chrome checks on real devices;
- a supervised child/adult usability session without real personal data;
- staging backup/restore, migration, readiness and rollback rehearsal;
- current external control evidence from `docs/security-ops-evidence.md`.

Store accessibility evidence using the privacy rules in
`docs/accessibility-inclusion-baseline.md`. Do not commit secrets, access codes,
real child names or parent contact data.

## Next Guardrail Priorities

1. Add automated reduced-motion and 200% reflow smoke for Home and School.
2. Add a small WebKit/Firefox compatibility job once its runtime cost and
   stability are acceptable.
3. Publish the machine-readable API contract and implement secure native token
   storage/refresh before starting a native client.
4. Run the VPS/second-provider rehearsal and turn every discovered manual step
   into a script or checklist assertion.
5. Add a dated review cadence for public standards and evidence claims.
