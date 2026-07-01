# Product Direction - Rozumko

_Updated: 2026-07-01_

## Positioning

Rozumko is an educational platform for short logic missions for children in
grades 1-4. The product turns screen time into structured practice for
attention, logic, step-by-step thinking and confidence with tasks.

Rozumko should not present itself only as an informatics olympiad. Online events
remain one supported format, but the broader product is logic practice through
missions.

## Product Surfaces

| Surface | Audience | Purpose |
|---|---|---|
| Home missions | Parents and children | Useful home practice, progress and motivation. |
| School mode | Teachers and classes | Free classroom activity, trust and brand familiarity. |
| Official events | Teachers, students and admins | Structured online event flow with codes, timing, scoring and certificates. |

School mode and Home missions are intentionally separate. A classroom activity
may point families to the Home surface, but it must not transfer individual
classroom results into parent accounts.

## Business Model In Public Terms

Rozumko's paid value is the home learning experience: regular short missions,
clear progress, seasonal motivation and recognition. Classroom use exists to be
useful for teachers and safe for schools, not to make teachers collect payments.

Payment features must keep card data with the payment provider. Rozumko stores
only the access state needed to provide the service.

## Product Principles

1. Keep child data minimal.
2. Keep classroom use free from payment collection and parent-account linking.
3. Keep answer keys and official scoring on the backend.
4. Keep the content reusable across home missions, school activities and events.
5. Keep the experience touch-friendly for web, PWA and app clients.
6. Keep all clients on one backend and one set of scoring/access rules.

## Content Direction

Mission content should be repeatable and versioned. A mission can be reused in
different contexts when the data boundaries are respected:

- a home mission can produce individual progress after parent consent;
- a school mission can produce aggregate class-level insight;
- an official event can produce a scored result and certificate/diploma.

Parent-facing copy should use simple language:

- attention;
- logic;
- useful screen time;
- confidence with tasks;
- short practice.

Avoid making public copy sound like school audit, teacher ranking or fear-based
AI marketing.

## Privacy Direction

School mode should not store child personal data or connect classroom activity
to parent payment. Home missions may store parent-led child profile, consent,
answers, score, progress and technical timestamps when needed for the service.

Certificate names remain browser-only unless a feature explicitly collects
consent to store names. Payment card data remains with the payment provider.
