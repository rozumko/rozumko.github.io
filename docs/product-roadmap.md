# Product Roadmap - Rozumko

_Updated: 2026-05-31_

## Current MVP Status

Implemented:

- practice, demo and official olympiad modes;
- event-based official olympiads with per-event duration and question count;
- server-side scoring for all six question types;
- answer-key stripping for official and demo modes;
- personal-code recovery after F5 or a closed tab;
- teacher classes, registrations, student labels and personal code generation;
- admin event setup, question bank, results and teacher activation;
- teacher-issued certificates and diplomas (award tier by score: participation
  certificate, or diploma for I/II/III place), generated in the browser without
  storing child names;
- GitHub Pages frontend deployment and Render backend CI.

## Before Free Pilot

1. Run `docs/smoke-test.md` end to end with all six question types.
2. Clean legacy test attempts and codes if they obscure results.
3. Populate and review the real olympiad question bank.
4. Decide Supabase Auth signup policy.
5. Configure PostgreSQL backups and perform one restore test.
6. Configure monitoring for `/ping`.

## Before Paid Launch

1. Add browser E2E coverage for admin setup, student completion, timer expiry and F5 recovery.
2. Add audit logging for admin actions.
3. Make answer saving robust against rare concurrent `/answer` and `/finish` races.
4. Add shared rate-limit storage before scaling Render beyond one instance.
5. Add a deliberate teacher-token refresh strategy or shorten the documented session expectation.
6. Prepare support instructions for code loss, interrupted attempts and manual result review.
7. Add payment provider integration without storing card data.

## Later

- Custom domain with updated CORS and CSP.
- Learning resources, games and courses.
- Optional progress tracking with minimal child data.
- Subscription features after the free pilot validates demand.

## Privacy Direction

Keep child data minimal. The server may store event, class, code, answers, score
and technical timestamps. Certificate names remain browser-only. Payment card
data must remain with the payment provider.
