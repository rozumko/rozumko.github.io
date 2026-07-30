# Olympiad Main-Round Content Backlog

This is the production checklist for the private official sets. It complements
`olympiad-content-standard.md`; the live source of truth is the readiness
report in **Admin → Olympiads → Question set**.

## Required Set Shape

| Grade | Tasks | Time | Easy / Medium / Hard | Track target: CT / informatics / AI |
|---|---:|---:|---:|---:|
| 1 | 16 | 45 min | 3 / 9 / 4 | 7 / 6 / 3 |
| 2 | 20 | 45 min | 4 / 11 / 5 | 8 / 8 / 4 |
| 3 | 24 | 45 min | 4 / 14 / 6 | 10 / 10 / 4 |
| 4 | 24 | 45 min | 4 / 14 / 6 | 10 / 10 / 4 |

An event stays a draft until every grade has its exact set and all hard checks
pass. Once published, the question selection is frozen and the event cannot
return to draft. If a serious defect is found before the round, archive the
event, create a replacement draft, revise the set and run readiness again.

## Grade 1

- Use concrete objects, arrows and short visible procedures.
- Include one visual route, one classification task and one 3–4 item ordering
  task.
- Include a digital-safety situation and an AI-versus-human judgment with
  concrete choices.
- Avoid typed text. If numeric input is indispensable, use it once at most.
- Reject tasks that only ask for the name of a familiar device.

Example concept IDs:

- `g1-route-arrows`
- `g1-sort-input-output`
- `g1-safe-device-choice`
- `g1-human-or-ai`

## Grade 2

- Move from naming objects to applying a rule across several objects.
- Include file-type classification, keyboard actions, a familiar process
  ordering task and one visual pattern.
- Test safe search or source checking through a short scenario, not a slogan.
- Prefer matching/classification to repeated single-choice definitions.

Example concept IDs:

- `g2-file-type-classify`
- `g2-key-action-match`
- `g2-process-order`
- `g2-source-safety`

## Grade 3

- Include grid coordinates, algorithm debugging, pattern reasoning and a
  representation-of-data task.
- Require at least one answer derived from an essential diagram.
- Ask about files, programs or networks through use cases rather than isolated
  extensions and shortcuts.
- Include a realistic AI-learning or human-oversight decision.

Example concept IDs:

- `g3-grid-coordinate`
- `g3-debug-sequence`
- `g3-data-representation`
- `g3-ai-human-oversight`

## Grade 4

- Include a multi-constraint algorithm trace, decomposition/abstraction,
  efficiency comparison, digital-source judgment and AI safety.
- Use grids, tables or compact diagrams as data, but keep the full task on one
  desktop screen.
- A hard task may combine constraints; it may not hide a third subquestion
  below a scrollbar or bundle independently scored ideas into one binary
  point.
- Do not reuse a Grade 3 template unless the reasoning operation materially
  changes and the shared template warning is explicitly reviewed.

Example concept IDs:

- `g4-grid-route-trace`
- `g4-decompose-system`
- `g4-compare-algorithms`
- `g4-ai-source-risk`

## Editorial Workflow

1. Create the task as a private main-round draft.
2. Complete grade, track, topic, concept, progression, difficulty,
   `estimatedSeconds`, `templateId`, and image role/alt text.
3. Preview the task and verify it at `1366×625` and `1280×800`.
4. Publish the question itself.
5. Add it to the draft event set.
6. Inspect all errors and warnings in the readiness panel.
7. Publish the event only when hard checks are green and remaining warnings
   have an editorial reason.
8. Do not change a published set. Freeze it before access codes are issued.

## Pilot Evidence to Record

For every question variant, retain:

- percentage correct;
- median and 90th-percentile completion time;
- skip/no-answer rate;
- common wrong answer;
- viewport or interaction failures;
- editorial decision: retain, revise or retire.

The first official releases use one reviewed set per grade. Participant-level
official variants remain deferred until this evidence demonstrates equivalent
difficulty and timing.
