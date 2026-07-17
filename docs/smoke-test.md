# Smoke Test - Rozumko

_Updated: 2026-07-17_

Run this checklist before a real pilot.

## 1. Deployment

- [ ] `GET https://rozumko-github-io.onrender.com/health` returns `{ "status": "ok", "service": "rozumko-backend" }`
- [ ] `GET https://rozumko-github-io.onrender.com/ready` returns `{ "status": "ok", "db": "ok" }`
- [ ] `GET https://rozumko-github-io.onrender.com/ping` returns `{ "status": "ok", "db": "ok" }`
- [ ] Latest GitHub Pages and Backend CI workflows passed for the intended commit
- [ ] `npm run db:migrate` and the read-only `npm run db:migrate:check` report
      success before backend deployment
- [ ] Render backend is synced from `backend/render.yaml` and waits for CI checks

## 1a. Local Smoke Setup

- [ ] Backend `.env` exists and contains local or staging credentials
- [ ] Frontend `.env.local` sets `VITE_API_URL=http://localhost:3000`
- [ ] `cd backend && npm run dev` starts without missing env errors
- [ ] `GET http://localhost:3000/health` returns `{ "status": "ok", "service": "rozumko-backend" }`
- [ ] `npm run dev` serves the frontend and uses the local backend

## 2. Teacher Signup Policy

- [ ] Decide whether pilot signup is public or invitation-only in Supabase Auth settings
- [ ] If public: register a teacher, confirm `ACCOUNT_PENDING`, activate via admin, then log in
- [ ] If invitation-only: verify an uninvited signup is rejected
- [ ] Confirm an expired teacher access token auto-refreshes in the same tab
      (the action succeeds without a manual re-login); `localStorage` contains
      no `teacher_session`. The refresh token remains in `sessionStorage` for
      the MVP and is still exposed to same-origin XSS.
- [ ] Complete teacher email confirmation, password recovery and Google login
      (if enabled); each callback uses `?code=`, ends on a clean URL and leaves
      no `rozumko_auth_pkce_teacher` value after exchange.
- [ ] Open a forged `teacher.html#access_token=...&type=signup` URL and confirm
      it is rejected without creating a session.
- [ ] After login/callback, confirm the authenticated document contains no
      `challenges.cloudflare.com/turnstile` script.

## 3. Admin Setup

- [ ] Create one question of every type: `choice`, `truefalse`, `sort`, `sequence`, `match`, `input`
- [ ] Preview each type
- [ ] Create a draft event with dates, duration and question count
- [ ] Assign olympiad questions for one grade
- [ ] Activate the event
- [ ] Confirm active timing, count and question selection can no longer be changed
- [ ] Confirm an active or already-issued question cannot be edited or deleted

## 4. Teacher Setup

- [ ] Create a class
- [ ] Add optional student labels
- [ ] Register the class for the active event
- [ ] Generate personal codes (`maxUses = 1`)
- [ ] Confirm generated codes appear under the registration

## 5. Student Happy Path

- [ ] Wrong code fails without consuming a use
- [ ] Correct code shows event title and rules
- [ ] Start remains disabled until agreement checkbox is selected
- [ ] Student is redirected to `student.html`
- [ ] All configured question types render and accept an answer
- [ ] Finish returns a score
- [ ] Teacher and admin results show the attempt

## 6. Recovery And Deadline

- [ ] Start with a personal code, answer at least one question, press F5
- [ ] Student is redirected to code entry and can resume with the same code
- [ ] `localStorage.rozumko_quiz_backup` contains no token and no personal code
- [ ] Let the timer expire after a partially completed attempt
- [ ] Saved answers are graded; the final score is not forced to zero
- [ ] Attempt appears in results
- [ ] Briefly disconnect network during answer save and confirm retry/error UX

## 6a. School Classroom Game (advanced School Mode)

- [ ] The teacher dashboard opens on "Класна гра" and does not load Olympiad
      data until the teacher opens the separate "Олімпіада" section.
- [ ] Teacher: choose grade, Informatics topic and difficulty -> "Гра з кодом";
      a 6-digit join code and direct student link appear with status "lobby".
- [ ] Student (incognito): open the shared link or `/school`, enter the code,
      choose a temporary nickname/avatar and appear in the teacher lobby before
      the teacher starts the game.
- [ ] Teacher presses "Почати гру"; the waiting student receives the sanitized
      question set and can answer.
- [ ] Student answers a question; the join response and network traffic contain
      no `correct`, `correctOrder`, `pairs` or `answer` keys
- [ ] Teacher leaderboard shows the participant (avatar + nickname + score)
      within ~5 seconds
- [ ] Teacher: choose the same filters -> "Запустити на екрані"; the projector
      surface opens, can enter browser fullscreen, renders sanitized questions
      and receives only `{ correct: boolean }` after a class answer.
- [ ] Teacher presses "Завершити"; further answers are rejected and the
      leaderboard freezes
- [ ] Admin cannot edit or delete a question while it belongs to the running
      game (409)

## 6b. Home Demo And Club Practice

- [ ] `/home` loads a demo mission without answer keys in network responses
- [ ] Parent can enter email + consent and receive a server-scored report
- [ ] `GET /api/home/leads/:id/club` returns `hasAccess: false` for a lead
      without entitlement and does not list paid tracks
- [ ] After an admin/manual entitlement grant, `GET /api/home/leads/:id/club`
      returns `hasAccess: true`
- [ ] `GET /api/home/leads/:id/club/questions` without active entitlement
      returns `403`
- [ ] `GET /api/home/leads/:id/club/questions` with active entitlement returns
      questions without `correct`, `explanation`, `correctOrder`, `pairs` or
      `answer` keys
- [ ] `POST /api/home/leads/:id/mission-report` stores a repeatable Club
      attempt and returns a parent-readable report

## 6c. Parent Accounts And Admin Directory

- [ ] Home and the public parent page expose a direct “Create account” action
      that opens `parent.html?mode=register` in registration mode
- [ ] The registration page removes `mode=register` from the address bar and
      completes email confirmation through the PKCE callback
- [ ] Admin “Parents” shows adult email, status, verification state, account
      date and profile count
- [ ] The admin parent response and UI contain no child display names, grades,
      progress, reports or Supabase auth user IDs
- [ ] A teacher token cannot access `GET /api/admin/parents`

## 7. Browser Security

> Most of §7 and §8 are automated by `scripts/smoke-security.ps1`:
> `pwsh ./scripts/smoke-security.ps1` (add `-IncludeRateLimit` for the §8
> rate-limit probe, which sends ~50 requests — run off-peak / against staging).

- [ ] Official `exchange-code` response contains no `correct`, `correctOrder`, `pairs` or `answer` keys
- [ ] Public `GET /api/questions?isOlympiad=false` response contains no answer keys
- [ ] Public `GET /api/questions?isOlympiad=false&hideAnswers=false` still contains no answer keys
- [ ] Public `GET /api/questions?isOlympiad=true` returns `400`
- [ ] Public `GET /api/questions?count=abc`, `count=-5`, `count=0`, `count=999` return `400`
- [ ] `/api/attempt/:id/finish` returns only `{ score, total }`
- [ ] Teacher/admin results contain no raw `answers`
- [ ] `/api/attempt/:id/answer` for a real in-progress attempt without
      `X-Attempt-Token` returns `403` (an unknown attempt id returns `404`, a
      malformed id returns `400` — the script asserts "never 200")
- [ ] Admin endpoint without authorization returns `401`
- [ ] Production HTML has CSP and no inline `onclick`
- [ ] Loading an app page inside an iframe shows `framing-blocked.html` instead
      of the real app UI; keep this as defense-in-depth until authenticated
      pages can use HTTP `frame-ancestors`

## 8. Backend Security

- [ ] Send repeated `GET /api/student/validate-code?code=<invalid>` requests with a fixed `X-Forwarded-For`; rate-limit returns `429`
- [ ] Repeat with rotating left-most `X-Forwarded-For`; rate-limit still returns `429`
- [ ] Invalid UUIDs on admin and teacher routes return `400`, not `500`
- [ ] Backend env has `RATE_LIMIT_STORE=memory` until shared rate limiting is implemented
- [ ] Supabase Auth -> Bot and Abuse Protection has enforced Turnstile for
      signup, password login and password recovery
- [ ] Supabase Auth -> Rate Limits has reviewed password login and signup limits
- [ ] Supabase Auth URL Configuration contains exact production teacher/parent
      callback URLs and no broad wildcard
- [ ] Parent recovery callback uses `?code=` PKCE, cleans the URL, removes its
      temporary verifier and loads no Turnstile script after exchange

## 9. Operational

- [ ] Create a completed private copy of `docs/security-ops-evidence.md` for
      this release; do not commit screenshots, secrets or private console URLs
- [ ] `docs/olympiad-day-runbook.md` is printed or open for the event operator
- [ ] `docs/load-test.md` was run against staging at the planned concurrency
- [ ] Before the first live event, a manual database export/import smoke test
      passed against local or non-production PostgreSQL
- [ ] `docs/backup-restore.md` full restore drill passed on a non-production
      database before higher-risk production operations
- [ ] PostgreSQL backup exists from after final event setup
- [ ] `docs/monitoring.md` alert test was received by the event operator
- [ ] `docs/render-operations.md` pre-event Render check passed
