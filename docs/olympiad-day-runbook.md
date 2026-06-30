# Olympiad Day Runbook - Rozumko

_Updated: 2026-06-30_

Use this checklist for a live school pilot or public olympiad. Keep a printed
copy available during the event.

## Roles

| Role | Responsibility |
|---|---|
| Event owner | Makes go/no-go decisions, coordinates teachers, records incidents |
| Technical operator | Checks backend/frontend health, watches monitoring, handles recovery |
| Teacher | Gives codes to students, keeps the class calm, reports classroom issues |

For a small pilot, one person may cover event owner and technical operator.

## 24 Hours Before

- [ ] Run the full `docs/smoke-test.md` checklist against the intended deployment.
- [ ] Confirm the GitHub Pages and Backend CI workflows passed for the deployed commit.
- [ ] Confirm `GET /ping` returns `db: ok`.
- [ ] Confirm monitoring is watching `/ping`.
- [ ] Confirm a recent PostgreSQL backup exists.
- [ ] Confirm the event has the expected title, start/end time, duration and question count.
- [ ] Confirm question assignments are locked and no active question needs editing.
- [ ] Generate codes for registered classes.
- [ ] Send teachers the event link, start time, backup instructions and support contact.
- [ ] Prepare a paper fallback: the teacher can continue the lesson if the online event is delayed.

## 30 Minutes Before

- [ ] Open the teacher panel and verify the active event is visible.
- [ ] Open the student entry page in a clean browser session.
- [ ] Test one spare/pilot code end-to-end if available.
- [ ] Confirm `/ping` is green.
- [ ] Confirm Render is awake by hitting `/ping` shortly before students start.
- [ ] Keep the admin panel open for results and incident checks.
- [ ] Tell teachers not to publish codes in a shared chat visible outside the class.

## During The Event

- Watch `/ping` and teacher reports.
- Record incident time, class, code type, visible error and action taken.
- Avoid changing event timing or questions during active attempts.
- If a student sees an error, ask the teacher to keep the tab open until the
  operator gives the next instruction.

## Incident Playbooks

### Backend Is Down Or Slow

Symptoms:

- `/ping` fails or is slow.
- Many students cannot start or save answers.
- Teachers report repeated network/server errors.

Actions:

1. Check `/ping` from a normal browser and from the monitoring dashboard.
2. Check the backend deployment status.
3. If the backend is waking up, wait up to 2 minutes and ask teachers to pause.
4. If it does not recover quickly, announce a delay and keep students off the start button.
5. After recovery, confirm `/ping` returns `db: ok`.
6. Let teachers resume only after one test request succeeds.
7. Record the outage window and affected classes.

Do not change scoring data manually during the event.

### Student Lost Or Closed The Page

Actions:

1. Ask the student to return to the code entry page.
2. For a personal code, enter the same code again to resume the active attempt.
3. For a shared code, do not promise resume; shared-code resume is intentionally restricted.
4. If resume fails, record the code label and visible error for later review.

### Student Used The Wrong Code

Actions:

1. Give the correct personal code again.
2. If the wrong code started a real attempt, record both codes and do not delete data mid-event.
3. Resolve result cleanup after the event.

### Timer Expired

Expected behavior:

- Saved answers are graded.
- Late answers are rejected.
- The result should still appear for teacher/admin review.

Actions:

1. Ask the student not to refresh repeatedly.
2. Check teacher/admin results after a short delay.
3. If the attempt is missing, record the code and time.

### Classroom Internet Fails

Actions:

1. Teacher pauses the class.
2. If the outage is short, students keep tabs open and continue when internet returns.
3. If the outage is long, the teacher switches to the paper fallback.
4. Event owner decides after the lesson whether to re-run the class.

### Teacher Cannot Log In

Actions:

1. Confirm the teacher is using the expected email.
2. Check teacher account status in the admin panel.
3. If the account is pending or blocked, resolve status before the event starts.
4. During the event, do not create emergency accounts unless the event owner approves.

### Suspicious Behavior Or Code Sharing

Actions:

1. Do not confront students during the event unless the teacher decides it is necessary.
2. Record the class, approximate time and affected codes.
3. Review results and attempt timing after the event.
4. Decide whether the affected results remain official.

## After The Event

- [ ] Confirm results are visible to the teacher and admin.
- [ ] Export or record the result summary needed for certificates/diplomas.
- [ ] Record incidents and decisions in a private note.
- [ ] Check monitoring for downtime or latency spikes.
- [ ] Confirm a post-event backup exists.
- [ ] Collect teacher feedback while the event is fresh.
- [ ] Create follow-up issues for code, content or operational improvements.

## Go / No-Go Rule

Do not start a live class if any of these are true:

- `/ping` is failing or unstable.
- The intended event/questions are not configured.
- Codes were not generated or cannot be accessed by the teacher.
- There is no fallback instruction for the teacher.
- The operator cannot monitor the event.
