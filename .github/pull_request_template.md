## What Changed

Describe the change and its impact briefly.

## Security Checklist

- [ ] Official scoring remains backend-only.
- [ ] Public and demo responses contain no olympiad answer keys.
- [ ] Teacher role and status come from the database through `/api/teacher/me`, not JWT claims.
- [ ] New IDs in params/body/query are validated as UUIDs before database access.
- [ ] Rate limits are not weakened; `trustProxy` is not changed to `true`.
- [ ] New frontend HTTP requests go through `features/api/client.ts`.
- [ ] No secrets, child private data or direct frontend access to Supabase tables were added.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] `cd backend && npm run build && npm test` pass when backend code changes.
- [ ] Render or Supabase changes completed the manual checklist in `docs/security-model.md`.

## Architecture and Product Conformance

- [ ] School / Home / Olympiad boundaries remain separate; School does not transfer individual child data into paid Home flows.
- [ ] Business rules, official scoring, consent and entitlement decisions were not moved into browser UI.
- [ ] Reusable domain logic does not gain a browser-only dependency.
- [ ] New external endpoints/origins are environment-configurable and covered by CSP and operational checklists.

## Accessibility, Mobile and Standards

- [ ] UI changes cover keyboard/focus, 320–375 px, 200% zoom, reduced motion and touch targets, or mark the item not applicable.
- [ ] Information is not conveyed by color alone; user-facing errors explain the next action.
- [ ] Educational/public claim changes were checked against `docs/content-taxonomy.md`, `docs/responsible-edtech-evidence.md` and official sources.
- [ ] `docs/architecture-conformance.md` is updated when evidence, risk or enforcement changes.
