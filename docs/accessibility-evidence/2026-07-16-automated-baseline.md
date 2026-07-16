# Accessibility Automated Baseline - 2026-07-16

Repository base commit: `aa0d2597a98178c169c551d21c271b228a54967a`

Evidence state: generated from an uncommitted guardrail change set. Record the
final commit SHA here after merge; do not treat the base SHA as the change SHA.

## Environment

- Operating system: Windows
- Browser engine: Playwright Chromium
- Axe: `@axe-core/playwright` 4.12.1
- Automated WCAG tags: `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`
- Viewports exercised by the suite include 320 and 375 CSS pixel phone widths,
  phone landscape, tablet, laptop and desktop layouts.

## Results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, including the incremental strict flags in `tsconfig.json` |
| `npm run lint` | Pass, zero warnings allowed |
| `npm test` | Pass: 159 unit and guardrail tests |
| `npm run build` | Pass |
| `npm run test:layout` | Pass: 90 Playwright tests |

The Playwright result includes axe scans for all normal Vite production entries,
with explicit exceptions only for `offline.html` and `framing-blocked.html`.
It also includes rendered question mechanics, selected keyboard/focus behavior,
44 CSS pixel target contracts and phone overflow/quiz-fit checks.
Reduced-motion emulation additionally verifies representative public, School
and learning-path animations.

## Boundaries of This Evidence

This record is not a WCAG certification. It does not prove:

- manual keyboard completion of every P0 flow;
- NVDA, VoiceOver or TalkBack behavior;
- browser zoom at 200 percent;
- real-device iOS Safari or Android Chrome behavior;
- child comprehension or supervised usability;
- contrast in every transient or authenticated state.

Those checks remain manual requirements in
`docs/accessibility-inclusion-baseline.md` and must be recorded separately
before an institutional pilot or public conformance claim.

No personal data, access codes, authentication tokens or user screenshots were
used in this run.
