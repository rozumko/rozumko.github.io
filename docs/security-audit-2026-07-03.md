# Security Audit Report - 2026-07-03

## Scope

Authorized defensive audit of the Rozumko public site and backend:

- frontend: `https://rozumko.github.io/`
- backend: `https://rozumko-github-io.onrender.com`
- local source: frontend entrypoints, API client, backend routes, auth, rate limit, CSP/build config, regression tests

No destructive testing, DDoS, brute force, credential attacks or high-volume scanning was performed.

## Attack Simulation Performed

Safe checks used during this audit:

- passive HTTP header checks for GitHub Pages and Render backend;
- public API probing with allowed and invalid query parameters;
- CORS preflight with an untrusted origin;
- answer-key leak checks for `GET /api/questions`;
- code audit of auth, teacher/admin routes, student attempts, School Mode, Home Mode, payment webhook and security regression coverage;
- local frontend/backend build and test gates.

## Executive Summary

The most sensitive backend invariants are in good shape:

- official, School and Home scoring remain server-side;
- public questions are practice-only and stripped of answer keys;
- attempt, participant and lead tokens are checked server-side;
- critical UUID parameters are validated before database access;
- backend security headers are present;
- CORS rejects untrusted origins;
- rate limiting is enabled and protected against spoofed leftmost `X-Forwarded-For`.

Two issues were fixed in this pass:

1. GitHub Pages frontend had no reliable anti-framing protection at the HTTP-header layer.
2. Admin question query validation allowed malformed values to be handled later than necessary.

## Fixed Findings

### F-01: Frontend clickjacking risk on GitHub Pages

Severity: Medium

Evidence:

- `curl -I https://rozumko.github.io/` returned GitHub Pages headers with HSTS but no `X-Frame-Options`.
- The Vite build injects a meta CSP, but `frame-ancestors` is not reliably enforceable through a meta tag. On GitHub Pages, custom HTTP security headers are not available.

Impact:

- A malicious site could attempt to embed teacher/admin/student/Home pages in an iframe and trick a signed-in user into clicking hidden or overlaid UI.
- Backend tokens still protect API calls, so this is not a direct auth bypass, but it is a real UI attack against authenticated flows.

Fix:

- Added `frontend-security.ts`.
- Imported it from `layout.ts`, `teacher.ts`, `admin.ts`, `student.ts`, `school.ts`, `home-demo.ts` and `olympiad-enter.ts`.
- If the page is framed, it attempts to break out to the top window; if blocked by browser policy, it replaces the framed UI with a safe message.

Residual risk:

- JavaScript frame busting is a compensating control, not as strong as HTTP `Content-Security-Policy: frame-ancestors 'none'`.

Recommendation:

- If Rozumko later moves behind Cloudflare Pages, Netlify, a worker, or another host that supports custom headers, add:
  - `Content-Security-Policy: frame-ancestors 'none'`
  - optionally `X-Frame-Options: DENY` for legacy clients.

### F-02: Admin question query validation was too loose

Severity: Low

Evidence:

- `GET /api/admin/questions` accepted query values before explicit route schema validation.
- `GET /api/admin/events/:id/questions?grade=...` validated grade in handler code instead of the route schema.

Impact:

- Auth was still required, so this was not public data exposure.
- Malformed authorized requests could reach more route code than necessary and increase the chance of inconsistent 400/500 behavior.

Fix:

- Added strict query schemas:
  - `grade` enum: `1..4`
  - `isOlympiad` enum: `true | false`
  - `difficulty` enum: `easy | medium | hard`
  - `track` enum: `informatics | computational-thinking | ai-basics`
- Added regression coverage in `backend/src/security-regression.test.ts` for malformed admin query values returning `400` before database access.

## Confirmed Protections

Live checks:

- `GET /api/questions?count=1` returned practice question data without `correct`, `explanation` or nested answer keys.
- `GET /api/questions?count=999` returned `400`.
- CORS preflight from `https://evil.example` to `/api/school/join` returned `403`.
- Backend responses included:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - rate-limit headers.

Local code/test checks:

- `trustProxy` remains `1`.
- `RATE_LIMIT_STORE` fails closed for unsupported shared-store modes.
- Public question API filters to `isOlympiad=false`.
- Official attempt finish returns aggregate score only.
- Teacher/admin authorization uses backend `GET /api/teacher/me` / DB role and status, not JWT role claims.
- School Mode and Home Mode token domains remain separated.
- Payment webhook boundary is HMAC verified and fail-closed.

## Remaining Recommendations

1. Configure real HTTP frontend security headers if the hosting layer changes. This is the only way to fully close frontend anti-framing on static pages.
2. Complete the operational checklist in `docs/security-model.md`: Supabase Auth abuse/rate-limit settings, GitHub branch protection, Render blueprint sync and post-deploy smoke checks.
3. Keep `RATE_LIMIT_STORE=memory` only while Render runs exactly one backend instance. Add Redis/Valkey before any horizontal scaling.
4. Periodically run the security section of `docs/smoke-test.md` after deployments, especially after auth, scoring, payment or DB changes.
5. Continue adding route schemas for any new params/body/query fields before touching database code.
6. For stronger future audits, prepare a staging environment with test accounts and non-production secrets so authenticated flows can be exercised end-to-end without touching real users.

## Validation

Commands run locally:

```bash
npm run typecheck
npm test
npm run build

cd backend
npm run build
npm test
```

All passed after the fixes.
