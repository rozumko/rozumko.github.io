# School Pilot Runbook - Rozumko

_Updated: 2026-09-02_

Use this checklist for a live classroom pilot with a real teacher and a real
class. It covers **School Mode only**: during the pilot Home Mode and the
Olympiad surface are dormant and render a coming-soon stub
(`features/surfaces/availability.ts`).

For a public olympiad or a timed event, use
[olympiad-day-runbook.md](./olympiad-day-runbook.md) instead. For the functional
pass over the classroom game, use §6a of [smoke-test.md](./smoke-test.md).

## What The Pilot Actually Offers

| Works today | Not in this pilot |
|---|---|
| Classroom game with a 6-digit join code and QR entry | Home missions, parent accounts, the adventure map |
| Server-graded question sets by grade, topic and difficulty | Olympiad events, personal student codes, diplomas |
| Procedural activities (typing, maze, sorting, tangram, …) | Class rosters and student lists |
| Projector mode: the whole class works on one screen | Payment or subscription of any kind |
| Live class results, per-child breakdown, "what to revise" | Result export to a file |
| Session recovery after a reload, plus the last 20 sessions | Results older than the last 20 sessions |

Children stay anonymous: a temporary nickname and an avatar, no account, no
personal data. Answer keys never reach the child's browser; grading is
server-side. The authenticated teacher preview is the documented exception.

## Roles

| Role | Responsibility |
|---|---|
| Pilot owner | Picks classes and lessons, records feedback and incidents, makes the go/no-go call |
| Technical operator | Watches backend health, handles recovery, fixes what the lesson exposes |
| Teacher | Runs the lesson, shows the code, keeps the class calm, reports what confused them |

For a small pilot one person may cover pilot owner and technical operator.

## A Week Before

- [ ] Confirm the teacher has an account: self-registration on `teacher.html`,
      email confirmation, then the dashboard opens immediately — no admin
      approval step. Do this well before the lesson, not on the day.
- [ ] Walk the teacher through [for-teachers.html](../for-teachers.html) and
      agree which grade and topic the lesson uses.
- [ ] **Check content coverage for that grade.** In the dashboard, pick the
      grade and read the count on every topic card (served by
      `GET /api/school/question-availability`). A topic with fewer questions
      than the lesson needs must be swapped or refilled before the lesson —
      the card shows the honest number, so decide from it, not from memory.
- [ ] Confirm the classroom devices can reach the site: school Wi-Fi, no
      captive portal, a browser that is not a locked-down kiosk.
- [ ] Agree a support channel for the lesson (phone or messenger, not email).

## The Day Before

- [ ] Confirm Pages and Backend CI passed for the deployed commit.
- [ ] Confirm `GET /ready` returns `{ "status": "ok", "db": "ok" }`.
- [ ] Confirm monitoring is watching `/ready` or `/ping`
      ([monitoring.md](./monitoring.md)). The backend runs a single Render
      instance: without a keep-awake ping the first request of the lesson pays
      a cold start.
- [ ] Confirm a recent PostgreSQL backup exists ([backup-restore.md](./backup-restore.md)).
- [ ] Run one full game yourself, end to end, on the same grade and topic the
      class will use.
- [ ] Agree a paper fallback with the teacher: the lesson must survive the
      platform being unavailable.

## 15 Minutes Before

- [ ] Hit `/ready` to wake the backend and confirm `db: ok`.
- [ ] Teacher logs into the dashboard **before** the class arrives.
- [ ] Decide the delivery mode: "Гра з кодом" (children on their own devices)
      or "Запустити на екрані" (one screen for the whole class).
- [ ] Create the game only now — the join code expires two hours after creation
      (`SESSION_JOIN_TTL_MS`), so a code made the night before is already dead.
- [ ] Put the QR code or the direct link on the board. A class of first-graders
      joins faster by QR than by typing six digits, and every avoided typo is
      one less failed join.

## During The Lesson

- Children join, pick an avatar and a nickname, and appear in the lobby.
- The teacher presses "Почати гру" once the list looks complete. Latecomers can
  still join with the same code while the game is active.
- The teacher watches the class summary: joined, completed, progress, accuracy.
- The teacher presses "Завершити" at the end. Answers are refused after that,
  and the join code and share link disappear from the panel.
- Record every incident: time, class, what the child or teacher saw, what was
  done.

## Incident Playbooks

### The Teacher's Tab Reloaded Or The Laptop Restarted

The dashboard reopens the running game automatically when the teacher lands on
it again, because the session is fetched from `GET /api/school/sessions`, not
kept in the page. Children keep playing throughout — their progress lives on the
server and their own tabs resume by themselves.

1. Log back in if the session was lost.
2. The running game opens on its own; if it does not, find it under
   "Останні ігри" and press "Повернутися до гри".
3. Continue the lesson. Nothing needs recreating.

### A Child Cannot Join: "Забагато невдалих спроб"

The whole class shares one school address, so wrong codes are counted per
address: 60 failures in 10 minutes trigger a 5-minute cooldown
(`CLASSROOM_IP_LIMITS`).

1. Stop the class from retrying — every retry extends the problem.
2. Switch everyone to the QR code or the direct link, which carries the code.
3. Wait out the cooldown (5 minutes) with the paper fallback or an offline task.
4. Record how many children were typing manually; it tells us whether the
   ceiling needs raising again.

### A Child Cannot Join: "Сесію вже завершено"

Either the teacher finished the game, or the code is older than two hours.
Create a new game; there is no way to revive an expired code.

### A Child Cannot Join: "У цій грі вже максимум учасників"

A session accepts 60 participants (`MAX_SESSION_PARTICIPANTS`). For two merged
classes, run two games. If the roster is unexpectedly full, the code leaked —
finish the game and start a new one.

### A Child's Device Lost Connection Or The Page Reloaded

The child's identity survives a reload in `sessionStorage` (same tab).

1. Keep the same tab open and reload the page if needed.
2. Answers already sent are already scored; the run resumes at the next
   unanswered question.
3. A closed tab, a different device or a private window loses the tab-scoped
   identity. Rejoining then creates a new participant, while the old row stays
   on the leaderboard. Note it so the teacher is not confused by a duplicate
   nickname.

### The Backend Is Slow Or Down

1. Check `/ready` from a normal browser.
2. If it is waking up, wait up to two minutes and ask the teacher to pause.
3. If it does not recover, switch to the paper fallback and end the game later.
4. Never edit scoring data by hand during a lesson.

### A Question Looks Wrong Or Is Too Hard

1. Do not edit content while a game holds that question — the admin panel
   refuses it (409), by design.
2. Ask the teacher to move on; note the question and the class reaction.
3. Fix it through the editorial cycle after the lesson
   ([content-publication.md](./content-publication.md)).

## After The Lesson

- [ ] Walk the results with the teacher while the lesson is fresh: the class
      summary, per-child breakdown and "Що варто повторити".
- [ ] Collect feedback in the teacher's own words. What confused the children,
      what the teacher had to explain twice, what they would run again.
- [ ] Note anything the teacher wanted and could not get — that is the pilot's
      main output, more than the scores.
- [ ] Check monitoring for downtime or latency during the lesson window.
- [ ] Record incidents and decisions in a private note.
- [ ] File follow-up issues for code, content and copy.
- [ ] Remind the teacher that results stay available under "Останні ігри", and
      that the list keeps the last 20 sessions.

## Go / No-Go Rule

Do not start a live lesson if any of these are true:

- `/ready` is failing or unstable.
- The chosen grade and topic do not have enough published questions.
- The teacher has never opened the dashboard before today.
- There is no paper fallback for the lesson.
- Nobody is available to watch the backend during the lesson.
