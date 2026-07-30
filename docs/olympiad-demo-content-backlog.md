# Olympiad Demo Content Backlog

This is an editorial snapshot of the published `olympiad_training` export. The
live source of truth is **Admin → Questions → Olympiad demo readiness**, which
recalculates the same checks from the database.

## Priority 1: Grade 1

The current bank can compose 12 questions, but it does not meet the demo
quality standard.

- Add one Grade 1 `informatics / medium` variant. Prefer a visual `sort`
  question.
- Add three Grade 1 `computational-thinking / medium` variants. Prefer
  `match`, `input` and `truefalse`; make at least one of them genuinely visual.
- Do not add another plain choice question to these cells until the mechanic
  gap is closed.
- Add Grade 1 `informatics / hard` questions outside
  `algorithms-programming`. Prioritise `digital-safety`, `data` and
  `computer-systems` so one topic does not occupy five positions in a generated
  demo.

Expected result after the first four additions:

- variant target closed for every Grade 1 blueprint cell;
- at least five mechanics become selectable;
- two visual tasks can be selected;
- topic duplication can be reduced once hard informatics is diversified.

## Priority 2: Grade 4

- Add two `computational-thinking / easy` variants. The current cell has one
  candidate against a target of three.
- Add one `ai-basics / easy` variant. The current cell has two candidates
  against a target of three.
- Use at least two visual questions across those three additions.
- Prefer non-choice mechanics where the task remains age-appropriate.

## Priority 3: Grades 2 and 3

Both grades already meet the numeric three-variant proxy for every blueprint
cell and can expose all six current mechanics.

- Add or replace with at least two genuinely visual candidates per grade.
- Grade 2 also needs hard informatics topics outside
  `algorithms-programming`; otherwise one topic can occupy four positions.
- Grade 3 currently meets the topic-repeat target, so visual coverage is its
  only blocking gap.

## Authoring Order

1. Create every new item as a draft in Content Studio.
2. Complete grade, track, topic, difficulty, progression band and image alt
   text before publication.
3. Preview the interaction at phone and tablet widths.
4. Publish the item into `olympiad_training`.
5. Reopen **Olympiad demo readiness** and confirm that the intended gap
   disappeared.
6. Run several demos for the grade and check that the image is required for
   solving, not merely decorative.

Do not edit `public/questions/grade-*.json` manually. Those files are generated
delivery artifacts and must continue to come from the audited publication
workflow.
