# MVP Smoke Test - Rozumko

_Updated: 2026-06-30_

Run this checklist before a real pilot.

## 1. Deployment

- [ ] `GET https://rozumko-github-io.onrender.com/health` returns `{ "status": "ok" }`
- [ ] `GET https://rozumko-github-io.onrender.com/ping` returns `{ "status": "ok", "db": "ok" }`
- [ ] Latest GitHub Pages and Backend CI workflows passed for the intended commit
- [ ] `npm run db:migrate` reports success before backend deployment
- [ ] Render backend is synced from `backend/render.yaml` and waits for CI checks

## 1a. Local Smoke Setup

- [ ] Backend `.env` exists and contains local or staging credentials
- [ ] Frontend `.env.local` sets `VITE_API_URL=http://localhost:3000`
- [ ] `cd backend && npm run dev` starts without missing env errors
- [ ] `GET http://localhost:3000/health` returns `{ "status": "ok" }`
- [ ] `npm run dev` serves the frontend and uses the local backend

## 2. Teacher Signup Policy

- [ ] Decide whether pilot signup is public or invitation-only in Supabase Auth settings
- [ ] If public: register a teacher, confirm `ACCOUNT_PENDING`, activate via admin, then log in
- [ ] If invitation-only: verify an uninvited signup is rejected
- [ ] Confirm an expired teacher JWT requires login again; automatic refresh is not implemented

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

## 7. Browser Security

- [ ] Official `exchange-code` response contains no `correct`, `correctOrder`, `pairs` or `answer` keys
- [ ] Demo `GET /api/questions?isOlympiad=false&hideAnswers=true` response contains no answer keys
- [ ] Practice `GET /api/questions?isOlympiad=false` intentionally includes keys
- [ ] Public `GET /api/questions?isOlympiad=true` returns `400`
- [ ] Public `GET /api/questions?count=abc`, `count=-5`, `count=0`, `count=999` return `400`
- [ ] `/api/attempt/:id/finish` returns only `{ score, total }`
- [ ] Teacher/admin results contain no raw `answers`
- [ ] `/api/attempt/:id/answer` without `X-Attempt-Token` returns `403`
- [ ] Admin endpoint without authorization returns `401`
- [ ] Production HTML has CSP and no inline `onclick`

## 8. Backend Security

- [ ] Send repeated `GET /api/student/validate-code?code=<invalid>` requests with a fixed `X-Forwarded-For`; rate-limit returns `429`
- [ ] Repeat with rotating left-most `X-Forwarded-For`; rate-limit still returns `429`
- [ ] Invalid UUIDs on admin and teacher routes return `400`, not `500`
- [ ] Backend env has `RATE_LIMIT_STORE=memory` until shared rate limiting is implemented
- [ ] Supabase Auth -> Bot and Abuse Protection has enforced Turnstile for signup
- [ ] Supabase Auth -> Rate Limits has reviewed password login and signup limits

## 9. Operational

- [ ] `docs/olympiad-day-runbook.md` is printed or open for the event operator
- [ ] `docs/load-test.md` was run against staging at the planned concurrency
- [ ] `docs/backup-restore.md` restore drill passed on a non-production database
- [ ] PostgreSQL backup exists from after final event setup
- [ ] `docs/monitoring.md` alert test was received by the event operator
- [ ] `docs/render-operations.md` pre-event Render check passed
