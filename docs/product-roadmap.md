# Product Direction - Rozumko

_Updated: 2026-07-02_

> **This is product direction, not a status report.** Shipped today: the
> **Official events** flow (codes, timing, server-side scoring, teacher/admin
> panels, browser certificates), **School Mode** (self-serve missions plus the
> anonymous classroom game) and the first **Home/Rozumko Club** slices are
> shipped: `/home`, parent lead + consent, child profile, server-scored parent
> report, entitlement state and gated Club practice missions. **Payment
> provider checkout/webhooks, full subscription UI, richer parent account UX
> and AIG JSON-templates are [PLANNED]** — see the implementation-status legend
> in [architecture.md](./architecture.md).

## Positioning

Rozumko is an educational platform for grades 1-4 that develops computational
thinking, informatics foundations and age-appropriate AI literacy through short
missions. The product turns screen time into structured 10-15 minute practice
for attention, logic, algorithms, patterns, step-by-step thinking, safe AI
basics and confidence with tasks.

Rozumko should not present itself only as an informatics olympiad. Online events
remain one supported format, but the broader product is useful practice through
missions.

## Product Surfaces

Rozumko is organized as three autonomous surfaces:

| Surface | Audience | Purpose | Status |
|---|---|---|---|
| School Mode | Teachers and classes | Free classroom activity, trust and brand familiarity. No payment collection and no child personal data. | Implemented for self-serve missions and anonymous classroom game |
| Home Mode / Rozumko Club | Parents and children | Parent-led home practice, free demo, consented progress, parent-readable reports and subscription access. | First slices implemented: demo, consent, report, entitlement and gated Club practice; checkout/webhooks planned |
| Olympiad / Seasonal Events | Home subscribers and external participants | Seasonal deadlines, finals, diplomas and one-off event access. | Official event flow implemented; subscription integration planned |

The surfaces may share content themes and mechanics, but they must not share
individual child identity between School and Home. A classroom activity may
point families to the Home surface through a neutral message, but it must not
transfer individual classroom results into parent accounts.

## Business Model In Public Terms

Rozumko's paid value is the Home experience: regular short missions,
computational-thinking practice, simple AI literacy, clear progress, seasonal
motivation and recognition. Classroom use exists to be useful for teachers and
safe for schools, not to make teachers collect payments.

Home Mode starts with a limited free demo. Parents can unlock a report by
providing email and consent, then continue through a simple subscription offer.
Reports should describe behavior patterns in human language, not abstract
percentages.

Olympiad / Seasonal Events create time-bound motivation. Active Home
subscribers may receive event access as part of the paid product; outside users
may buy a seasonal event as a one-off transaction.

Payment features must keep card data with the payment provider. Rozumko stores
only the access state needed to provide the service.

## Product Principles

1. Keep child data minimal.
2. Keep School Mode free from payment collection and parent-account linking.
3. Keep Home Mode parent-led, consent-based and commercially clear.
4. Keep answer keys and official, paid or diploma-generating scoring on the backend.
5. Keep computational thinking and age-appropriate AI literacy as the content core.
6. Keep content reusable across School, Home and Olympiad contexts without reusing identity.
7. Keep the experience touch-friendly for web, PWA and app clients.
8. Keep all clients on one backend and one set of scoring/access rules.

## Content Direction

Current state (2026-07): the platform pivoted from an olympiad to an educational
platform across three directions — `informatics`, `computational-thinking`,
`ai-basics`. The question bank is 318 items, fully tagged by a two-axis taxonomy
(`topic` + `concept_key`, see `docs/content-taxonomy.md`), aligned to НУШ and
Cambridge Primary Computing 0059 / Digital Literacy 0072. Direction selection is
live in Home Demo and the School free-mission picker. Three sorting games
(classification, information, multi-attribute abstraction) run on a shared engine
and are registered in the `missions` table. Next content gaps: broaden ai-basics
and per-topic depth, curate mission question sets, then the AIG engine below.

Mission content should be repeatable, parameterized and versioned. A mission
mechanic can be reused in different contexts when the data and scoring
boundaries are respected:

- a School mission can produce aggregate class-level insight only;
- a Home mission can produce individual progress after parent consent;
- an Olympiad / Seasonal Event can produce a scored result and certificate or diploma.

The intended scaling model is Automatic Item Generation through JSON templates:

- 15-20 reusable cognitive item models for the first scalable content set;
- parameterized variables, constraints and visual/logical variants;
- answer computation and distractor-generation rules;
- immutable content versions for reports and diplomas;
- backend authority for paid, official and diploma-generating scoring.

Parent-facing copy should use simple language:

- computational thinking, immediately explained through concrete skills;
- attention;
- logic;
- algorithms;
- patterns;
- AI basics;
- ethics and safety;
- useful screen time;
- confidence with tasks;
- short practice.

Avoid making public copy sound like school audit, teacher ranking or fear-based
AI marketing.

AI basics should be framed as literacy, not hype: what algorithms and data are,
how prompts work, why AI can be wrong, what personal data should not be shared,
and why answers should be checked.

## Privacy Direction

School Mode should not store child personal data or connect classroom activity
to parent payment. School sessions may use temporary nicknames, avatars and
aggregate/class-level results only.

Home Mode may store parent-led child profiles, consent, answers, score,
progress and technical timestamps when needed for the service.

Olympiad / Seasonal Events may store the data needed for access, scoring,
certificates, diplomas, support and payment/accounting, according to the event
terms.

Certificate names remain browser-only unless a feature explicitly collects
consent to store names. Payment card data remains with the payment provider.
