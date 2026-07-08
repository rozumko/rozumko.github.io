# Accessibility and Inclusion Baseline

Updated: 2026-07-08

Status: working baseline. This document is an internal product and evidence checklist. It is not a completed WCAG audit, legal accessibility statement, or external accessibility certification.

Related evidence:

- [Responsible EdTech evidence portfolio](./responsible-edtech-evidence.md)
- [Security model](./security-model.md)
- [Architecture](./architecture.md)
- [Content taxonomy](./content-taxonomy.md)
- [For parents](../for-parents.html)
- [For teachers](../for-teachers.html)

## Purpose

Inclusive access is the weakest current evidence area in the EdTech for Good mapping. Rozumko already has useful accessibility signals in the UI, but the project needs a repeatable baseline that can be checked before pilots, partner conversations, and larger content releases.

This baseline has three goals:

- make the current accessibility evidence visible;
- define a small, practical audit scope for child, parent, and teacher flows;
- turn accessibility work into product value, not just compliance cleanup.

## Target Standard

Target: WCAG 2.2 AA as the working baseline for public and product surfaces.

Child-first additions:

- large touch targets;
- short wording;
- visible feedback after actions;
- no reliance on color alone;
- predictable navigation;
- reduced-motion support;
- error recovery that a young pupil can understand with minimal adult help.

## Current Positive Signals

These signals were observed in the repository and should be preserved:

| Area | Current evidence | Notes |
| --- | --- | --- |
| Page language | Public pages use `lang="uk"` | Good for screen readers and browser language handling. |
| Skip links | Key public/app pages include a skip link to `#main-content` | Present on home, school, parent, teacher, privacy, transparency, and index pages. |
| Main landmark | Main content uses `<main id="main-content" tabindex="-1">` | Supports skip-link focus target. |
| Focus visibility | Global `:focus-visible` and component-specific focus styles exist | Needs visual verification across all interactive surfaces. |
| Reduced motion | CSS includes `prefers-reduced-motion: reduce` handling | Good baseline; needs runtime verification for animated game/mission states. |
| Live feedback | Mission errors and quiz feedback use `aria-live="polite"` | Useful for dynamic feedback. |
| Semantic grouping | Grade, track, avatar, progress, and quiz option areas use ARIA roles | Needs keyboard and screen reader behavior checks. |
| Child privacy inclusion | School Mode works without child registration or real name | Reduces access friction and protects pupils. |
| Parent consent | Home report gate asks for adult consent before saved report data | Supports safer inclusion for home use. |
| Mobile-first layout | CSS uses mobile breakpoints and app-shell sizing | Needs device matrix evidence. |

## Scope

### P0 Surfaces

These are the first surfaces to baseline because they are used by children or gate child data:

- `index.html`: first product choice and safety framing.
- `home.html`: child Home demo, parent consent, parent report gate.
- `school.html`: student join, lobby, mission, result.
- `teacher.html`: class setup and classroom operation.
- `for-parents.html`: parent trust and consent explanation.
- `privacy.html`: data rights and consent explanation.

### P1 Surfaces

These should be checked after the P0 surfaces:

- `games.html`
- `student.html`
- `login.html`
- `teacher-dashboard.html`
- `olympiad.html`
- `results.html`
- `transparency.html`
- `terms.html`

## Baseline Checklist

### Keyboard Access

- [ ] Every interactive element is reachable by keyboard.
- [ ] Focus order matches the visual and task order.
- [ ] Focus is always visible.
- [ ] No keyboard trap exists in missions, modals, reports, or classroom flows.
- [ ] Enter and Space trigger buttons consistently.
- [ ] Dynamic mission controls move focus predictably after screen changes.

### Screen Reader Semantics

- [ ] Each page has one clear `<h1>`.
- [ ] Heading order does not skip levels in a confusing way.
- [ ] Buttons and links have accessible names.
- [ ] Decorative images are hidden from assistive technology.
- [ ] Instructional images have useful alt text when they carry task meaning.
- [ ] Error and success messages are announced.
- [ ] Progress information is announced without overwhelming the user.
- [ ] Quiz option groups expose enough context to understand the question and options.

### Visual Design

- [ ] Text contrast meets WCAG AA.
- [ ] Focus rings have enough contrast against every card/background color.
- [ ] Text can zoom to 200% without loss of content or function.
- [ ] Important information is not communicated by color alone.
- [ ] Long Ukrainian words and labels do not overflow on narrow screens.
- [ ] Icons used with meaning have a text equivalent.

### Child Usability

- [ ] Primary actions are visually obvious.
- [ ] Buttons and cards have touch targets of at least 44 by 44 CSS pixels.
- [ ] Instructions are short enough for grades 1-4.
- [ ] Error messages tell the child what to do next.
- [ ] Timed or animated states do not pressure the child unnecessarily.
- [ ] The child can recover from a wrong tap without losing the task.

### Motion and Attention

- [ ] `prefers-reduced-motion` disables decorative animation.
- [ ] Mission transitions remain understandable with reduced motion.
- [ ] No flashing or rapid animation is present.
- [ ] Loading/waiting states do not rely only on animated dots.

### Forms and Consent

- [ ] Inputs have programmatic labels.
- [ ] Errors are connected to the relevant field or announced clearly.
- [ ] Required vs optional fields are clear.
- [ ] Parent consent text is understandable before submission.
- [ ] Child-facing flows do not ask for real names unless the adult context is explicit.

### Mobile and Device Readiness

- [ ] P0 flows work at 320 px width.
- [ ] P0 flows work on a typical phone in portrait orientation.
- [ ] Classroom join works with numeric keyboard where appropriate.
- [ ] No fixed footer/header hides content or controls.
- [ ] Orientation changes do not break active missions.
- [ ] Offline/PWA states avoid misleading progress or scoring claims.

## Manual Test Matrix

| Test | Pages | Expected result | Status |
| --- | --- | --- | --- |
| Keyboard-only tab path | `index.html`, `home.html`, `school.html`, `teacher.html` | User can reach and operate all primary actions | Not run |
| Screen reader smoke | `home.html`, `school.html`, `privacy.html` | Page purpose, controls, errors, and progress are understandable | Not run |
| 320 px viewport | `index.html`, `home.html`, `school.html` | No clipped primary text or blocked controls | Not run |
| 200% zoom | `for-parents.html`, `home.html`, `school.html` | Content remains readable and usable | Not run |
| Reduced motion | `index.html`, `home.html`, `school.html` | Decorative motion stops; task flow remains clear | Not run |
| Consent flow clarity | `home.html`, `privacy.html`, `for-parents.html` | Parent can understand what is saved and why | Not run |
| Classroom stress path | `school.html`, `teacher.html` | Child can join, wait, answer, and finish without inaccessible controls | Not run |

## Current Automated Guard

The first focused accessibility smoke guard is implemented in `tests/layout/accessibility-smoke.spec.ts`.

Latest local run: 2026-07-08.

Verified:

- Home choice questions expose `role="radiogroup"` with child options as `role="radio"`.
- Home choice answers update `aria-checked`.
- Home sort questions do not keep a misleading `radiogroup` role.
- Hidden edge move buttons in sort questions are disabled and hidden from assistive technology.
- School choice questions keep the same radio semantics after a mocked anonymous join.

Command:

```powershell
npm run test:layout -- accessibility-smoke.spec.ts
```

## Evidence to Collect

For each baseline run, save a short record with:

- date;
- commit SHA;
- browser and device;
- viewport size;
- assistive technology used, if any;
- pages checked;
- pass/fail notes;
- screenshots only when they do not expose child data or secrets;
- follow-up issue or checklist item.

Suggested private record path for future runs:

- `docs/accessibility-evidence/YYYY-MM-DD-baseline.md`

Do not store real child names, parent emails, access codes, payment identifiers, or private support messages in the evidence file.

## First Improvement Backlog

### P0

- Run keyboard-only checks for `index.html`, `home.html`, `school.html`, and `teacher.html`.
- Run a 320 px and 200% zoom visual check for child-facing flows.
- Verify that all quiz option types expose keyboard and screen reader behavior correctly.
- Check contrast for focus rings, mission cards, feedback states, and disabled states.
- Add a short public accessibility contact line to the responsible EdTech or transparency page once that public page exists.

### P1

- Expand the automated accessibility smoke check to static pages and more app states.
- Add a device/browser support matrix for phone, tablet, and classroom display use.
- Add content-writing guidance for early-primary readability.
- Add reduced-motion verification to browser smoke tests.

### P2

- Run a small supervised usability session with a child and adult observer.
- Ask a teacher to test classroom setup and student join using only written onboarding.
- Consider an external accessibility review before institutional pilots.

## Definition of Done for the Baseline

The baseline is complete when:

- P0 pages have keyboard-only, 320 px, 200% zoom, reduced-motion, and screen-reader smoke results;
- findings are sorted into P0/P1/P2 fixes;
- no P0 issue blocks a child from starting, answering, finishing, or recovering from an error;
- no P0 issue blocks a parent from understanding consent before report access;
- the responsible EdTech evidence portfolio links to this baseline as current evidence.

## Next Slice

After this document, the next practical slice is to run the first manual keyboard and mobile audit for `home.html` and `school.html`, then convert findings into focused UI fixes.
