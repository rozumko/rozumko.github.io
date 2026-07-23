# App Reference: Ethical Mobile Learning Loop For Rozumko

_Created: 2026-07-23_

This document records product decisions from reviewing mobile learning app
patterns on 2026-07-23. The reference is useful for a clear mobile learning
loop, not as a product to copy.

## Core Decision

Rozumko should adopt app-like clarity, guidance and completion feedback, but
must reject dark patterns, pressure-based monetization and manipulative
retention mechanics. Rozumko works with children, so motivation must support
learning and wellbeing rather than create anxiety.

The useful pattern is:

> learning path -> short activity -> immediate feedback -> completion result ->
> gentle reward -> next step.

For Rozumko this belongs primarily to **Home Mode**, where the child returns to
a parent-led practice habit. **School Mode** should stay a fast, free classroom
tool for teachers, with only lightweight celebration and aggregate feedback.

## What Is Already Implemented

| App pattern | Current Rozumko implementation |
|---|---|
| Learning path with locked, open and completed nodes | `features/path/path-data.ts`, `path.ts`, `style-path.css` |
| Progressive unlock conditions | `PathPoint.unlockAfter` |
| Local and profile-scoped path progress | `features/path/progress-store.ts`, `features/path/path-sync.ts` |
| Stars and attempts per point | `PointProgress.bestStars`, `PointProgress.attempts` |
| Unified activity completion contract | `features/path/activity-result.ts` |
| Mascot with speech bubble | `features/path/mascot.ts` |
| Completion screen with stars, task count, accuracy and skills | `finishPoint` in `path.ts` |
| Parent-led save/profile flow | `parent.html`, `parent.ts`, `/api/parent/*` |
| School session leaderboard | `teacher.ts`, `/api/school/*` |

Important: the mascot, completion stats and skill chips already exist. The next
step is not to create them from zero, but to make them more consistent,
mobile-first and emotionally clear.

## Adopt

### Clear Current Step

Home Mode should make the next action obvious on mobile:

- current grade/path title;
- current point title;
- visible progress through the path;
- one primary action: continue the next activity.

The map can remain playful, but the child and parent should never have to guess
what to do next.

### Mascot As A Guide

Use Rozumko as a functional guide, not decoration. The mascot should appear at
high-value moments:

- first visit to a path;
- before the first activity;
- after a correct or incorrect answer when a short explanation helps;
- on completion;
- when a new point opens.

Mascot copy should be short, concrete and calm. It should help the child act,
not merely cheer.

### Stronger Completion Screen

Keep the current completion data, but present it as a satisfying end state:

- activity complete;
- stars;
- tasks completed;
- accuracy when available;
- skills practiced;
- what opened next;
- one primary action: continue or return to the path.

This is the highest-value app pattern for Home Mode because it makes short
practice feel complete.

### Gentle Achievements

Add achievements as recognition, not currency. Good first examples:

- first point completed;
- first lesson completed;
- topic completed;
- three practice days in one week;
- careful reader;
- data detective;
- safety helper;
- algorithm builder.

Achievements should describe learning behavior in child-friendly language and
remain parent-safe.

### Soft Daily Or Weekly Goal

A light practice goal can support habit formation:

- "one short mission today";
- "three practice days this week";
- "continue your path".

Do not make the child feel punished for missing a day.

## Adapt Carefully

### Streaks

Streaks can motivate, but they are risky for younger children. If used, they
should be soft and parent-framed:

- weekly rhythm instead of daily pressure;
- no loss animation;
- no shame state;
- no paid repair;
- no "you broke your streak" language.

Preferred wording: "You practiced this week" rather than "Your streak is in
danger."

### XP

XP is not needed for the first retention slice. Stars and achievements are
enough.

If XP is added later, it must remain cosmetic unless server-trusted scoring is
introduced for that specific context. Client-side XP must never unlock paid,
official or diploma-generating outcomes.

### School Leaderboards

A local School session leaderboard can stay because it is short-lived,
teacher-controlled and uses temporary classroom identity. Do not turn it into:

- global rankings;
- cross-class rankings;
- leagues;
- promotion/demotion systems;
- parent-facing individual conversion hooks.

## Reject

Do not implement these dark or pressure-based patterns:

- keys or energy that block learning;
- "unlimited keys" as a paid relief mechanic;
- coin store for streak protection;
- streak freeze or streak repair;
- paid rescue mechanics;
- global leagues;
- top-15 promotion/demotion pressure;
- child-facing upgrade prompts;
- child account creation pressure;
- school-to-home claim tokens or individual school result transfer.

These mechanics conflict with Rozumko's positioning as useful screen time,
parent-led Home practice and teacher-safe School Mode.

## Surface Split

### Home Mode

Home Mode may use:

- clear learning path;
- mascot guidance;
- completion rewards;
- achievements;
- soft practice goals;
- parent-visible progress.

The product promise is a useful 10-15 minute habit, not a game economy.

### School Mode

School Mode should use only:

- quick topic/grade setup;
- temporary avatars/nicknames;
- live classroom progress;
- aggregate/class-level results;
- a neutral Home link after class activity.

School Mode should not add Home-style retention mechanics. The teacher came for
a quick way to check or activate knowledge on a topic.

### Olympiad / Seasonal Events

Seasonal events may use:

- milestones;
- certificates/diplomas;
- event completion celebration.

They should not inherit Home streaks or School leaderboard identity.

## First MVP Slice

1. Polish the Home path first screen on mobile:
   - show current path progress;
   - show current point;
   - add a clear Continue action.

2. Make mascot messages systematic:
   - first visit;
   - activity start;
   - completion;
   - next point unlocked.

3. Improve the completion screen:
   - keep stars/tasks/accuracy/skills;
   - add next-step copy;
   - add achievement-ready event names internally.

4. Add a minimal achievement model after the completion loop is polished:
   - no store;
   - no coins;
   - no streak repair;
   - no global ranking.

## Product Test

Before adding any app-inspired mechanic, ask:

1. Does it help the child understand the next step?
2. Does it make short practice feel complete?
3. Does it support parent trust?
4. Does it keep School Mode teacher-safe?
5. Would it still feel acceptable if used by a 6-year-old?

If the answer is no, do not build it now.
