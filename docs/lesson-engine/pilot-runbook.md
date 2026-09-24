# Lesson Engine — pilot runbook

How to run the pilot phases of stage J (master spec §126–128): the internal
classroom pilot, the external pilot, and the go/no-go review. The code is
done; this is the part people do. Decisions in [README.md](./README.md)
still apply.

## 1. One-time setup (production)

Do these in order. Nothing is visible to teachers until step 4.

1. **Apply migrations `0049`–`0054`** before the backend code that needs
   them is deployed (see [migrations.md](../migrations.md), "Production
   Workflow"). They are additive: new tables and columns only. Render's
   start command refuses to start a backend whose migrations are missing,
   and the old version keeps running.
2. **Merge the branch into `main`.** GitHub Actions deploys the frontend.
   Render deploys the backend after checks pass. With the flag off, every
   Lesson Engine route is a 404 and the teacher link stays hidden.
3. **Publish the reference lesson** (there is no admin UI for Lesson Engine
   lessons yet). Use the script:
   ```powershell
   cd backend
   $env:API_URL = "https://<backend>.onrender.com"
   $env:SUPABASE_URL = "https://<project>.supabase.co"
   $env:SUPABASE_ANON_KEY = "<anon key>"
   $env:SUPABASE_EMAIL = "<admin email>"; $env:SUPABASE_PASSWORD = "<admin password>"
   npm run curriculum:publish -- --dry-run     # local validation only
   npm run curriculum:publish -- --publish     # create + review + publish
   ```
   The script needs the flag on (step 4). Run it again after step 4 if it
   stopped with "is LESSON_ENGINE_ENABLED=true on the backend?".
4. **Turn the engine on.** On Render, set `LESSON_ENGINE_ENABLED` = `true`
   for the backend service and redeploy. To roll back, set it to `false`.
   Data stays; the surface disappears again.

## 2. Before each pilot lesson

- [ ] The teacher account is active, and the class has a roster with the
      children's labels (the teacher panel, as today).
- [ ] **Rehearse the day before** with the teacher and two devices of the
      real classroom, on the school network. Cover the steps in §3.
- [ ] Each child device opens `https://<site>/lesson-join.html` in an
      up-to-date browser (Chrome, Edge or Safari). A bookmark or desktop
      shortcut on the lab computers saves time.
- [ ] **Render cold start.** Ten minutes before the lesson, open
      `https://<backend>/health`. A free-plan backend sleeps and needs up to
      a minute to wake up. For real classes use a plan that does not sleep.
- [ ] The board computer shows `lesson-engine.html` (link «Керовані уроки»
      in the teacher panel) and the projector works.
- [ ] Print or open the observation sheet (§4).

## 3. Lesson flow (what the teacher does)

1. «Керовані уроки» → choose the lesson → pick the class → «Підготувати
   урок». The run is *prepared*. Content edits after this moment never touch this lesson.
2. **Children join.** Either:
   - **Code:** «Відкрити приєднання». Children type the 6-digit code and see
     a big number. The teacher matches each number to a name in
     «Приєднання учнів».
   - **Lab computers** (only with a classroom provider — not yet available
     in production, see §6): assign computers once, then «Відкрити урок на
     комп'ютерах».
3. «Почати урок». The board follows «Далі →» and «← Назад». «Пауза» hides
   tasks on the devices; «Продовжити» brings them back.
4. At an activity step: «Надіслати учням». The live grid shows who is
   working, has finished or needs attention, and any shared wrong answer.
   «Закрити завдання» stops new answers.
5. «Завершити урок» → «Звіт уроку». Check the outcome table and the evidence
   behind it. Copy the comment drafts only after reading them.

If a device loses its connection, the child's answer waits on the device
(«Відповідь чекає на зв'язок») and is sent automatically. The teacher does
not need to do anything. The child must not answer again.

## 4. Observation sheet (one per lesson)

Fill it in during and right after the lesson. The metrics are from master
spec §101–103.

| Measure | Value |
|---|---|
| Teacher preparation time before the lesson (min) — and the usual time for the old workflow | |
| From «Відкрити приєднання» to all devices matched (min) | |
| Children who could not join without adult help | |
| Manual interventions by the teacher or an assistant (count, what) | |
| Switches to other apps or tabs during the lesson | |
| Time to have results after the lesson (min) — old workflow for comparison | |
| Used: send to students / live grid / pause / device matching / report (yes/no each) | |
| Incidents: lost connection, wrong device matched, relaunch, error messages (what, when) | |

### After the lesson: questions for the teacher

Ask about behaviour, not satisfaction (§101):
- Would you run the next lesson this way without help?
- What did you do outside Rozumko that you expected Rozumko to do?
- Did the live grid change what you did during the lesson? When?
- Is the report something you would use (for a parent, or for your own
  notes)?

Track across weeks:
- Did the teacher run a second lesson?
- Did they return the following week?
- Did they ask for the next lesson or recommend it to a colleague?

## 5. Phases and exit criteria

| Phase | Scope | Move on when |
|---|---|---|
| Internal pilot (§126) | UGS: the reference lesson first, then 3–5 lessons | A teacher other than the product creator runs a lesson without help; no data-loss incident; setup time is acceptable to the teacher |
| External pilot (§127) | 3–5 external schools; do not migrate the whole course first | Several lessons per school, observation sheets collected |
| Go/no-go (§128) | A separate review of all sheets and interviews | Decide: scale / modify / narrow / pivot / stop |

Only one lesson is authored so far (`g2-m2-l8`). The internal pilot needs
2–4 more lessons in the same JSON format. Each is validated with
`npm run curriculum:publish -- <file> --dry-run`.

**Go signals** (most should hold, §108):
- teachers finish lessons on their own and come back voluntarily;
- preparation time goes down;
- children join with little friction;
- teachers use the orchestration and consult live results;
- schools ask for continued access;
- decision-makers state an intent to pay.

**No-go or pivot signals** (§109):
- teachers use only the document or presentation view;
- teachers ignore sending tasks and the live grid, or prefer to share links
  by hand;
- device control adds complexity;
- teachers do not return and schools refuse to pay;
- only the product creator can run it smoothly.

The strongest external signal (§150) is a school asking for the full course
or agreeing to pay — not a teacher liking it.

## 6. Known limits during the pilot

- **Lab-computer launch** works only with the development fake. The real
  Classroom Remote adapter needs access to its repository and protocol;
  until then, use code join.
- **Outcome codes are internal** (`INF-2-FILES-1/2`). Do not present them to
  schools as НУШ or Cambridge codes until a methodologist confirms the
  mapping.
- **Rate limiting is in memory on a single backend instance.** Do not scale
  the backend above one instance during the pilot
  (see [security-model.md](../security-model.md)).
- **Offline answers stay on the device only for the current browser session.**
  If a device loses its connection and the tab is then closed, its waiting
  answers are lost: the device token lives in `sessionStorage` by design.
