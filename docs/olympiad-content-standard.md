# Olympiad Content and Set Standard

_Status: Approved product direction_

_Updated: 2026-07-30_

This document defines the Olympiad-only content model for Rozumko. It covers
the public demo olympiad and the official main round. It does not define Home
lessons, missions, paths or classroom activities.

## Terms

- **Task**: one scored screen and one complete response.
- **Mechanic**: the interaction used to answer, such as choice, ordering or
  matching.
- **Skill**: the ability being assessed, such as classification, debugging or
  digital safety.
- **Slot**: one fixed position in a set blueprint, defined by track, topic,
  skill, difficulty, progression band, mechanic and expected time.
- **Variant**: one calibrated task that may fill a specific slot.
- **Demo set**: a public, repeatable, non-official set generated from approved
  demo slots.
- **Main-round set**: a private, immutable official set assigned to one grade.

Demo and main-round tasks may assess the same skills and use the same
mechanics. They must not reuse the same task or a superficial reskin whose
solution can be memorised from the demo.

## Approved Set Sizes and Initial Time Limits

| Grade | Demo tasks | Demo time | Main-round tasks | Main-round time |
|---|---:|---:|---:|---:|
| 1 | 12 | 20 minutes | 16 | 45 minutes |
| 2 | 12 | 20 minutes | 20 | 45 minutes |
| 3 | 12 | 20 minutes | 24 | 45 minutes |
| 4 | 12 | 20 minutes | 24 | 45 minutes |

The 45-minute main-round limit is the approved common rule for every grade.
The 20-minute demo limit remains an initial target because the demo has only
12 tasks and is intended to be repeatable.

A pilot should verify that:

- the main-round limit allows participants to read, reason and review instead
  of turning the event into a speed-reading test;
- at least 80% of participants open every task;
- the last tasks are not disproportionately unanswered because of time.

If those conditions fail, adjust wording, task load or the time limit before
changing the intended skill coverage.

The decision is consistent with two directly relevant competition models:

- UK Bebras gives participants aged 6-8 and older 45 minutes for its
  computational-thinking challenge;
- Brain Ring publishes a 45-minute limit for 24-task online contests.

Forty-five minutes is common rather than universal: the current Olimpis
competition publishes a 40-minute limit for 24 tasks. Rozumko therefore adopts
45 minutes as its own fairness rule, not as a claim that every competitor uses
the same duration.

## Public Mode Model

The public student-facing Olympiad area should expose two concepts:

1. **Demo Olympiad**: repeatable, scored and reviewable.
2. **Main Olympiad**: one official server-scored attempt.

The separate difficulty-based training mode should be removed from the primary
student navigation. Its question bank, static export and
`olympiad_training` delivery channel remain in place as the content source and
security boundary for public demo variants.

Removing the training UI must not widen the public question API or move
official answer keys into the browser.

## Demo Blueprint

Every grade has a versioned 12-slot demo blueprint. Each slot has at least
three approved variants; four are preferred for editorial reserve and replay
variety.

This requires:

- minimum: 36 demo tasks per grade, 144 across grades 1-4;
- preferred: 48 demo tasks per grade, 192 across grades 1-4.

The generator selects one variant per slot. It must not select 12 questions
independently from the whole bank.

Three variants per slot already produce `3^12 = 531,441` possible sets. Four
produce `4^12 = 16,777,216`. More variants are not a security requirement.

### Demo Composition

| Axis | Target |
|---|---|
| Tracks | 5 computational thinking, 5 informatics, 2 AI basics |
| Difficulty | 3 easy, 6 medium, 3 hard |
| Progression | approximately 3 recognize, 6 apply, 3 reason |
| Mechanics | at least 5 distinct mechanics |
| Images | at least 2 tasks where the image is required to solve the task |
| Duplicate topics | no more than 2 tasks from one topic |

The demo must not be hard-only. It must represent the range and interaction
model of the main round.

Every main-round mechanic must appear in the demo or in a short unscored
interaction tutorial before the official timer starts.

### Demo Selection Rules

- Select exactly one variant from every slot.
- Use a stable random seed for the run.
- Persist the selected question IDs and their order so reload/resume does not
  generate a different set.
- Randomise only inside predefined difficulty blocks; do not allow a hard task
  to become the first task.
- Avoid serving the same variant in two consecutive runs on the same browser
  when enough alternatives exist. This is a replay-quality feature, not a
  security guarantee.
- Show the aggregate score only after the full demo is finished. Do not send
  raw answer keys, per-item correctness or explanations to the browser; any
  future review experience must be generated server-side without creating an
  answer-key oracle.
- Offer "Try another variant" from the result screen.

Public demo variation improves replay value and reduces casual answer copying.
It is not protection for the official round. Official content remains separate
and private.

## Main-Round Blueprint

The main round uses one reviewed and immutable set per grade for the initial
Olympiad releases. Do not generate a unique official set per participant until
variants have enough response data to demonstrate equivalent difficulty and
completion time.

The track target is approximately:

- 40% computational thinking;
- 40% informatics and digital literacy;
- 20% AI basics.

Variation of one task is acceptable when needed for an exact integer set, but
all three tracks must be represented.

### Main-Round Difficulty

| Grade | Easy | Medium | Hard |
|---|---:|---:|---:|
| 1 | 3 | 9 | 4 |
| 2 | 4 | 11 | 5 |
| 3 | 4 | 14 | 6 |
| 4 | 4 | 14 | 6 |

The order follows a difficulty wave:

- begin with an accessible task;
- place short recovery tasks after demanding tasks;
- end with a strong reasoning task;
- never introduce an unfamiliar interaction in the final positions.

### Main-Round Coverage Rules

- Use at least five distinct mechanics.
- Use no more than 40% single-choice tasks.
- Use no more than one true/false task.
- For grade 1, avoid free-text input; numeric input may be used at most once.
- Cover at least six topics.
- Use no more than two tasks from one topic.
- Do not assess the same factual answer more than once.
- Do not let one task reveal the answer to another.
- Include algorithms or debugging, logic or patterns, classification or data,
  digital safety, and age-appropriate AI judgment.
- Allow three or four reserve tasks per grade before the event starts. Never
  swap tasks after attempts have started.

For the first releases, all participants in one grade receive the same
main-round set. Option order may be randomised only if the server snapshots the
permutation and scores against that snapshot.

## Current Scoring Constraint

The current platform awards one binary point per task. Choice, input,
ordering, sequence and matching are all scored as fully correct or incorrect.

Until partial scoring exists:

- keep one point per task;
- keep matching tasks to at most three pairs;
- keep ordering tasks to at most four items;
- do not author multi-part scene tasks;
- do not display different point weights;
- report results as `score / task count`.

Weighted tasks must not be added as a display-only change. They require an
explicit `maxPoints`, a versioned scoring policy and server-side partial
scoring rules.

## Current Mechanics

The official renderer and server scoring support:

- `choice`: one correct text option;
- `truefalse`: one yes/no statement;
- `input`: one exact text or numeric answer;
- `sort`: one full ordering;
- `sequence`: choose the next item in a sequence;
- `match`: match left items to right items.

The recommended extension order is:

1. `multi_select`;
2. image-capable options for `choice` and `multi_select`;
3. `classify`;
4. accepted-answer normalisation for `input`;
5. optional authored question audio;
6. partial scoring and task weights;
7. `cloze`;
8. multi-part visual scenes;
9. accessible grid/path tasks.

## Editorial Rules

Each task must:

- assess one primary skill;
- use one clear action verb;
- avoid double negatives and trick wording;
- target no more than 25 words, with up to 40 allowed for a reviewed reasoning
  task;
- contain all information required for a unique answer;
- use plausible distractors from the same category;
- avoid software-specific facts unless the software is explicitly part of the
  task;
- avoid proprietary characters or unlicensed artwork;
- use an image only when it supports or is required by the task;
- remain readable and operable on a phone-sized viewport;
- have a reviewed `imageAlt` that does not expose the answer.

### Vertical Progression by Grade

The same screen template may reappear across grades, but the reasoning must
progress. Changing names, colours or characters is not progression.

| Grade | Expected task character | Concrete examples |
|---|---|---|
| 1 | Concrete recognition, one rule, short sequences | identify an input device; order 3–4 visible actions; follow a route with arrows |
| 2 | Apply one learned rule to several objects | classify files as text/image/audio; match keys to actions; order a familiar process |
| 3 | Combine a representation with a rule | read grid coordinates; complete a visual pattern; find and correct one algorithmic error |
| 4 | Reason across constraints and justify a choice | trace a colour-coded grid algorithm; compare two strategies; identify a safe and efficient AI-assisted decision |

Every official set must cover age-appropriate versions of algorithms or
debugging, logic or patterns, classification or data, digital safety, and AI
judgment. The admin preflight reports a warning when one of these concept
groups is absent.

### Lessons Taken from Competitor Demo Sets

Patterns worth adopting:

- visual routing and colour-grid tasks where the image is the data;
- coordinate tasks that connect rows and columns to a meaningful object;
- ordering real or computational procedures;
- matching representations, device roles or file types;
- classification and pattern tasks that require applying a rule rather than
  recalling a definition.

Patterns to reject:

- three or four subquestions in one tall card when the final part is below an
  inner scrollbar;
- decorative character images that consume half the screen but contribute no
  information;
- the same keyboard, printer or file-extension fact repeated in several
  grades;
- branded characters or copied artwork used as attention decoration;
- a long story that does not change the reasoning;
- several independently scored ideas combined into one binary-point task.

Concrete Rozumko-style examples:

- **Grade 2, classification:** show six file cards and ask the child to match
  `.txt`, `.jpg` and `.mp3` to text, image and sound. Use a new data set for
  each variant.
- **Grade 3, coordinates:** show a pixel animal on a labelled grid and match
  coordinates to body parts. The grid is `essential`, not decorative.
- **Grade 4, algorithm tracing:** start on a marked cell and follow colour
  rules until the exit; ask for the number of visited cells. The wording,
  legend and full grid must fit on one desktop screen.
- **Grade 4, AI judgment:** present a short school scenario and choose which
  decision can be delegated to AI and which still requires a person. The
  distractors should reflect realistic misconceptions, not absurd answers.

### One-Screen Layout Contract

On the supported desktop baselines `1366×625` and `1280×800`:

- the complete stem, every response control and any essential legend must be
  visible without page scrolling;
- the question card, code block and options area must not have their own
  scrollbar;
- the question font must be at least 15 px;
- choice and true/false tasks may have at most six visible options;
- sort and match tasks may have at most six response elements;
- one option may not exceed 90 characters;
- the stem may not exceed 40 words; 26–40 words require editorial review.

The automated Playwright layout gate enforces the no-scroll and font rules on
desktop. Content preflight enforces the authored word, option and element
budgets before a demo is issued or an official set is published. The question
editor also provides scaled `1366×625` and `1280×800` previews with an explicit
fit indicator; these previews support editorial work but do not replace the
Playwright gate.

Phone and tablet layouts may reflow vertically, but no response control may be
hidden behind an undisclosed nested scrollbar. When a task cannot satisfy the
desktop contract at a readable font size, shorten or split the task; do not
shrink the text to make it pass.

For every slot, variants must have the same:

- primary skill;
- mechanic;
- difficulty and progression band;
- number of response elements;
- approximate reading load;
- expected completion time;
- scoring rule.

Sibling variants share one `templateId`; the question ID identifies the
individual variant. A `templateId` must not be reused in another grade unless
the reasoning operation is deliberately and demonstrably more advanced.
When legacy questions have no `templateId`, the normalized stem is the fallback
variant-group key. The demo generator never places two members of one variant
group in the same attempt.

## Set Validation

Before a demo blueprint or main-round set is activated, the admin surface
should report:

- task count;
- track, topic and concept coverage;
- difficulty and progression distribution;
- mechanic distribution;
- estimated total time;
- exact and near-duplicate templates;
- image and accessibility status;
- editorial publication status.

Activation must fail when:

- the task count does not match the configured grade;
- a task is unpublished or belongs to another grade;
- an official task has a public delivery channel;
- an answer key or task shape is invalid;
- the set contains an exact duplicate;
- estimated time exceeds the grade limit.

An exact duplicate is calculated from the normalized stem, visible code,
question type, public response data and image reference. Answer keys and
explanations are excluded from that fingerprint. Therefore two Snail tasks
with the same stem but different programs are variants, not exact duplicates;
they may coexist in the bank but not in one generated demo.

Demo readiness is not inferred from one lucky draw. The admin preflight runs
64 reproducible seeded compositions through the same generator and hard policy
used by the public endpoint, and reports passed samples plus the number of
unique sets. The generator itself uses backtracking, rejects repeated exact
fingerprints and variant groups, and returns only a hard-policy-compliant set.
Candidate rows are sorted by ID before seeded selection, so the same seed is
stable even when PostgreSQL returns rows in another order. Questions with a
blocking per-item content error or no progression band are removed before
composition. The search has a strict node and time budget and fails closed with
`422` when no compliant set is found; it must never exhaust the Node.js event
loop. The 64-sample admin audit yields between samples so student and health
requests continue to be served while the preflight runs.

The current enforcement model is:

- **Errors** block demo issuance and official publication/activation: wrong
  count, delivery-boundary leak, unpublished task, exact duplicate, missing
  taxonomy, missing image alt, excessive authored length/elements, event time
  or cap mismatch, and estimated time over the limit.
- **Warnings** remain visible for editorial action: distribution drift,
  missing concept groups, weak mechanic/topic variety, excessive factual
  repetition, missing timing/image-role metadata and vertical template reuse.

Warnings do not silently disappear after publication. They stay visible in
the event readiness report so the team can calibrate thresholds from pilot
data rather than weakening them informally.

## Event Rule Model

The current event model stores one `questionsCount` and one `timeMinutes` value
for the whole event. The common 45-minute rule now fits that model, but the
approved task counts still differ by grade.

Safe transitional option for one shared event:

- configure the event with `timeMinutes = 45` and `questionsCount = 24`;
- assign exactly 16, 20, 24 and 24 published tasks to grades 1-4;
- treat `questionsCount = 24` as the event-wide upper limit, while the attempt
  total is the number of tasks actually assigned to that student's grade.

This is implemented in the current attempt flow. The readiness endpoint
validates the exact per-grade totals even though the event table retains one
event-wide cap.

Future data-model improvement:

- add versioned per-grade expected task counts;
- make code exchange and attempt timing resolve the rule for the student's
  grade;
- validate each grade's assigned set against that rule before activation.

The common time limit should remain an event-level rule unless a later product
decision explicitly changes it.

## Immediate Delivery Plan

### Can Be Done Without a Database Schema Change

1. Build the 12-slot blueprint for each grade. **Implemented.**
2. Tag or catalogue three candidate variants for every slot outside the live
   selection path. **Preflight implemented; content gaps remain.**
3. Author missing non-choice variants, prioritising apply and reason tasks.
4. Change demo defaults from 5 hard tasks / 10 minutes to 12 balanced tasks /
   20 minutes. **Implemented.**
5. Replace whole-bank random sampling with slot selection and persist the
   issued set for reload recovery. **Implemented; deterministic seed storage is
   not required because the signed issued IDs are persisted.**
6. Show the server-scored aggregate demo result. **Implemented.** Add post-finish review only
   after a separate security design is approved.
7. Remove the difficulty-based training entry from primary student navigation
   while keeping `olympiad_training` infrastructure. **Implemented.**
8. Configure one official event for 45 minutes with a 24-task cap, then assign
   exactly 16, 20, 24 and 24 tasks to grades 1-4. **Admin defaults and
   publication gate implemented.**
9. Add an editorial preflight checklist to the event question picker.
   **Implemented as a live readiness report with errors and warnings.**
10. Freeze event question selection after leaving draft status.
    **Implemented.**

### Requires Platform or Data-Model Work

1. Store versioned demo blueprints and slot variants in the admin workflow.
2. Store per-grade expected task counts directly on the event model; exact
   validation is already implemented against the approved policy.
3. Add `multi_select` and media-capable options.
4. Add partial and weighted server scoring before compound tasks.

## Pilot and Review

Before the first public round:

- pilot sibling variants, never the exact main-round task;
- record correctness rate, median time and skip rate;
- replace ambiguous or extreme variants;
- verify the full set on phone, tablet and desktop;
- confirm every demo mechanic is available before the official timer;
- freeze the reviewed official set before codes are issued.

After the round, use item-level statistics to calibrate variants. Unique
participant-level official sets remain deferred until equivalence can be
demonstrated from real data.

## External Duration References

- [UK Bebras Challenge](https://bebras.uk/) — 45 minutes, including the Kits
  age group (6-8).
- [Brain Ring participation rules](https://www.brainring.com.ua/ua/konkurs-z-matematiki/brati-uchast)
  — 24 tasks in 45 minutes.
- [Olimpis participation rules](https://www.olimpis.com.ua/ua/konkurs-z-ukrainskoi-movi/brati-uchast)
  — 24 tasks in 40 minutes.
