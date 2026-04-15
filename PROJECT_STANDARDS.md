# PROJECT STANDARDS — Educational Tool Development

## Project-Specific Override For `course/new_lessons`

This document is broad and reusable across educational projects, but this specific project has mandatory local overrides.

For `course/new_lessons`, these project rules take precedence:
- Lesson progress must not persist between page refreshes, browser restarts, or different pupils on the same school computer.
- Do not introduce auto-save of lesson completion state across sessions, even if a generic standard elsewhere recommends saving progress.
- In student mode, the first visible block must be a motivational hook, not a technical lesson passport.
- The textbook **home page** (`course/new_lessons/index.html`) uses the same **student / teacher** view split as lessons: in student mode keep navigation friendly and avoid curriculum codes on the surface; curriculum alignment (ІФО, outcomes) belongs in teacher mode. Implementation details: `js/landing.js`, `js/landing-modules.js` — see `AI_LESSON_WORKFLOW.md` and `LESSON_TEMPLATE_GUIDE.md`.
- Wording must stay simple, concrete, and age-appropriate for grades 1-2.
- Sequence/order tasks for young children should prefer clear visual placement zones over abstract list manipulation.

If an AI agent sees a conflict between this file and `AI_LESSON_WORKFLOW.md` or `LESSON_TEMPLATE_GUIDE.md`, the local files for `course/new_lessons` win.

> **Mandatory reading for every AI agent, developer, or contributor working on this project.**
> These standards are non-negotiable and apply to every file, component, and feature.
> When in doubt — check this document first.

---

## 📋 Table of Contents

1. [Purpose & Audience](#1-purpose--audience)
2. [UI/UX Design Principles](#2-uiux-design-principles)
3. [Accessibility — WCAG 2.2](#3-accessibility--wcag-22)
4. [Responsive Design & Touch Adaptation](#4-responsive-design--touch-adaptation)
5. [Cognitive Accessibility](#5-cognitive-accessibility)
6. [Typography & Readability](#6-typography--readability)
7. [Color & Visual Design](#7-color--visual-design)
8. [Keyboard & Alternative Input](#8-keyboard--alternative-input)
9. [Canvas, WebGL & Complex Widgets](#9-canvas-webgl--complex-widgets)
10. [Performance & PWA Standards](#10-performance--pwa-standards)
11. [Design Tokens & AI Agent Rules](#11-design-tokens--ai-agent-rules)
12. [Child Safety & Privacy](#12-child-safety--privacy)
13. [Internationalization & Language](#13-internationalization--language)
14. [Testing Checklist](#14-testing-checklist)
15. [Prohibited Patterns](#15-prohibited-patterns)

---

## 1. Purpose & Audience

This tool is an **educational application** designed primarily for:

- **Primary audience:** School-age children (grades 1–11, ages 6–17)
- **Extended audience:** Teachers, parents, school administrators
- **Special consideration:** Children with disabilities, including visual, hearing, motor, and cognitive impairments

Every design and technical decision must be evaluated through the lens of:
> **"Will this work for a child with a disability, on a low-end device, in a noisy classroom, for the first time, without instructions?"**

---

## 2. UI/UX Design Principles

This section defines the design philosophy of the project. All UI decisions must be justified against these principles. When a proposed design conflicts with a principle — the principle wins, not the aesthetic preference.

---

### 2.1 Krug's Laws — "Don't Make Me Think" (Steve Krug, 2000/2014)

**Core thesis:** Every moment a user has to think about how to use the interface is a moment they are not learning. For children, cognitive load from UI is especially harmful — it competes directly with learning content.

#### Law 1 — Self-Evidence
> *"Every page/screen should be self-evident. Obvious. Self-explanatory."*

- [ ] A child who has never seen this screen before must understand what to do within **5 seconds**
- [ ] Every button, link, and interactive element must look like what it is — buttons look clickable, links look tappable
- [ ] The purpose of the current screen is visible **without scrolling**
- [ ] Primary action is visually dominant — there is no confusion about what to do next

#### Law 2 — Eliminate Question Marks
> *"Get rid of half the words on each page, then get rid of half of what's left."*

- [ ] Every label, tooltip, instruction, and message is as short as possible
- [ ] Navigation items use **familiar words**, not invented terms
- [ ] No "creative" naming for standard UI elements unless meaning is 100% clear in context
- [ ] Instructions appear **at the point of use**, not in a separate help section

#### Law 3 — Navigation Must Answer Three Questions
Every screen must make immediately clear:
1. **Where am I?** — Current location is highlighted in navigation; page has a clear title
2. **What can I do here?** — Available actions are visible and obvious
3. **Where can I go?** — Navigation is visible and consistent

#### Law 4 — Users Scan, They Do Not Read
- [ ] Use **visual hierarchy** to guide the eye: headings → sub-headings → body
- [ ] Important information is **never buried** in paragraphs
- [ ] Bullet points, short labels, and icons carry the primary load
- [ ] Instructional text is reviewed and cut to minimum — happy talk ("Welcome to our amazing platform!") is removed

---

### 2.2 Nielsen's 10 Usability Heuristics (Jakob Nielsen, 1994 — timeless)

These are the most validated UI principles in existence. Treat them as laws, not suggestions.

| # | Heuristic | Application in This Project |
|---|---|---|
| 1 | **Visibility of system status** | Always show loading states, progress bars, save confirmations, error states. A child must never wonder "Did it work?" |
| 2 | **Match between system and real world** | Use language and concepts the child already knows. Avoid technical terms. Icons must be universally recognizable. |
| 3 | **User control and freedom** | Every action has an Undo. Every dialog has a Cancel. No dead ends. |
| 4 | **Consistency and standards** | Same action = same visual element, always. Follow platform conventions (iOS, Android, Web). |
| 5 | **Error prevention** | Design so mistakes are hard to make. Confirm before destructive actions. Disable unavailable options visually — don't hide them. |
| 6 | **Recognition over recall** | Show options — don't make users remember them. Keep navigation visible, not hidden in menus. |
| 7 | **Flexibility and efficiency** | Basic path is simple for novices; power-user shortcuts available but not required. |
| 8 | **Aesthetic and minimalist design** | Every UI element must earn its place. Remove anything that does not serve a function. |
| 9 | **Help users recognize, diagnose, and recover from errors** | Error messages: plain language, explain what happened, suggest a fix. No raw error codes ever. |
| 10 | **Help and documentation** | Help is contextual and searchable. First resort is good design; help is the last resort. |

---

### 2.3 Fitts's Law — Target Size & Distance

> *"The time to acquire a target is a function of distance to and size of the target."*

- [ ] Primary actions (Submit, Next, Save) are **large and centrally placed**
- [ ] Destructive actions (Delete, Reset) are **small, distant from primary action, and require confirmation**
- [ ] Do not place opposing actions (Yes / No, Save / Delete) immediately next to each other
- [ ] On mobile: primary action button is in the **bottom half of the screen** (thumb-reachable zone)

```
Thumb-reachable zone on mobile (portrait):
┌─────────────────┐
│  ☠ Hard to reach │  ← avoid primary actions here
│  ⚠ Stretch zone  │
│  ✅ Natural zone  │  ← place primary CTAs here
│  ✅ Natural zone  │
└─────────────────┘
```

---

### 2.4 Hick's Law — Reduce Choices

> *"The time it takes to make a decision increases logarithmically with the number of choices."*

- [ ] **Maximum 5–7 items** in any navigation menu or option list
- [ ] When more options are needed — **group them** into categories (chunking)
- [ ] Onboarding screens introduce features **one at a time**, not all at once
- [ ] Wizards and step-by-step flows are preferred over forms with many fields at once
- [ ] Default values are pre-selected wherever a sensible default exists

---

### 2.5 Gestalt Principles — Visual Grouping

Children read visual relationships, not just text. Apply these principles in every layout:

| Principle | Rule |
|---|---|
| **Proximity** | Elements that belong together are placed together. Unrelated elements have clear space between them. |
| **Similarity** | Elements that behave the same look the same (same color, shape, size). |
| **Continuity** | Guide the eye in a clear direction — top-to-bottom, left-to-right. |
| **Closure** | Use incomplete shapes intentionally for progress indicators and outlines. |
| **Figure/Ground** | Content clearly stands out from background. No ambiguous depth. |
| **Common Fate** | Elements that move together are perceived as a group — use in animations deliberately. |

- [ ] Cards group related content and have consistent padding and border
- [ ] Form fields and their labels are visually connected (proximity)
- [ ] White space is used actively — not empty, but breathing room that separates concerns

---

### 2.6 Progressive Disclosure

> *Show only what is needed now. Reveal complexity progressively.*

This is especially important for children — overwhelming them with all features at once leads to abandonment.

- [ ] The **default view shows only essential controls**
- [ ] Advanced options are hidden behind "More options" / expandable sections
- [ ] Onboarding reveals features **at the moment they become relevant**, not upfront
- [ ] Tooltips and hints appear on demand (hover/tap), not permanently
- [ ] Complex multi-step tasks are split into a **wizard/stepper pattern** with clear progress indication

---

### 2.7 Mental Models & Affordances (Don Norman — "The Design of Everyday Things")

> *"Design should make it obvious what actions are possible and how to perform them."*

- [ ] Buttons look **pressable** (elevation, border, or fill — not flat rectangles without any affordance indicator)
- [ ] Draggable items have a **drag handle** or visual cue (dots, grip lines)
- [ ] Scrollable areas have a **visible scrollbar or fade** indicating more content below
- [ ] Links are **underlined or clearly distinguishable** from non-interactive text
- [ ] Input fields have a visible **border or underline** — blank white space is not recognizable as a field
- [ ] Toggle switches look like physical switches with clear on/off states and labels

---

### 2.8 Calm Technology (Amber Case, 2015)

> *"Technology should require the smallest possible amount of your attention."*

The tool should support learning, not demand attention for itself.

- [ ] Notifications are shown **only when the user needs to act or know something critical**
- [ ] The system does as much as possible **without requiring user decisions** (smart defaults)
- [ ] Status is communicated **at the periphery** — visible but not intrusive (status bar, subtle badge)
- [ ] The UI steps back when the user is focused on content (full-screen reading/exercise mode)
- [ ] Audio feedback is **purposeful** — success sounds, error sounds — not background music that competes with thinking

---

### 2.9 Emotional Design & Motivation (Aarron Walter; B.J. Fogg — Behavior Model)

> *"Make it functional, reliable, usable — and then make it pleasurable."*

Children are especially sensitive to emotional tone. The interface must feel **encouraging, safe, and rewarding**.

- [ ] **Empty states are warm** — no blank pages; show an encouraging illustration and a clear call to action
- [ ] **Error states are friendly** — never threatening, never blaming the user
- [ ] **Success is celebrated** — micro-animation, positive sound, or congratulatory message after task completion
- [ ] **Progress is always visible** — progress bars, completion percentages, streaks motivate continuation
- [ ] **The interface never makes a child feel stupid** — if something is unclear, that is the interface's fault
- [ ] Onboarding uses encouragement language: "You're doing great!" not "Error: step incomplete"

---

### 2.10 Information Architecture (Peter Morville)

- [ ] Content is organized by **how children think**, not how the system is structured
- [ ] Maximum **3 clicks/taps** to reach any piece of content from the home screen
- [ ] Search is available and returns results **even with partial or misspelled queries**
- [ ] Breadcrumbs or back navigation is always available
- [ ] The most important content is reachable from the **first screen without authentication**

---

### 2.11 Design System & Token Rules

To ensure consistency and reduce decision fatigue during development:

- [ ] A **design token file** exists (CSS variables or tokens JSON) defining: colors, spacing, border radius, shadows, font sizes, z-index scale
- [ ] **Spacing follows an 8px grid**: all margins, paddings, gaps are multiples of 4px or 8px
- [ ] **Border radius is consistent**: define small (4px), medium (8px), large (16px), pill (9999px) — use only these
- [ ] **Shadow levels are defined**: 0 (flat), 1 (card), 2 (dropdown), 3 (modal) — do not improvise
- [ ] All interactive states are defined for every component: default, hover, focus, active, disabled, loading

```css
/* 8px spacing scale — use only these values */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  24px;
--space-6:  32px;
--space-7:  48px;
--space-8:  64px;
--space-9:  96px;
--space-10: 128px;
```

---

## 3. Accessibility — WCAG 2.2

### Minimum Required Level: **AA** | Target: **AAA**

> ⚠️ **WCAG 2.2** is the current standard (published October 2023).
> Do NOT reference WCAG 2.1 as the baseline — it is superseded.
> Reference: [WCAG 2.2 Guidelines](https://www.w3.org/TR/WCAG22/)

### 3.1 Perceivable

- [ ] All non-text content has a descriptive `alt` attribute (`alt=""` for decorative images)
- [ ] Audio/video content includes captions or transcripts
- [ ] No information is conveyed **only** through color — always pair color with text, icon, or pattern
- [ ] No content flashes more than **3 times per second** (seizure prevention)
- [ ] Text can be resized up to **200% without loss of content or functionality**

### 3.2 Operable

- [ ] All functionality is accessible via **keyboard alone**
- [ ] Keyboard focus is always **visible** — never remove `outline` without providing an equivalent
- [ ] Focus order is **logical and predictable**
- [ ] No keyboard traps
- [ ] Timed interactions provide a **20-second warning** and option to extend
- [ ] Auto-playing animations/videos can be **paused, stopped, or hidden**
- [ ] Skip navigation link: `<a href="#main-content" class="skip-link">Skip to main content</a>`
- [ ] **[2.2 NEW — 2.4.11 Focus Not Obscured AA]** Focused component is not fully hidden by sticky headers, chat widgets, cookie banners, or other overlapping UI. At least part of the focused element must always be visible.
- [ ] **[2.2 NEW — 2.5.7 Dragging Movements AA]** Every drag-and-drop interaction has a **single-pointer alternative** (e.g., a click/tap to select + click/tap to drop). Dragging must never be the only way to complete an action.
- [ ] **[2.2 NEW — 2.5.8 Target Size Minimum AA]** Touch/click targets are at least **24×24 CSS pixels**. If smaller, ensure sufficient spacing so the 24px activation area does not overlap another target. Preferred size remains 48×48px per section 4.2.

### 3.3 Understandable

- [ ] `lang` attribute correctly set on `<html>` element
- [ ] Page `<title>` is descriptive and unique per view
- [ ] Error messages explain **what went wrong** and **how to fix it**
- [ ] Form fields have associated `<label>` elements
- [ ] Consistent navigation and layout across all screens
- [ ] **[2.2 NEW — 3.3.7 Redundant Entry AA]** Information already entered by the user earlier in the same session is auto-populated or selectable — the user is never asked to re-enter the same data twice (e.g., name in step 1 should not be requested again in step 3).

### 3.4 Robust

- [ ] Valid, semantic HTML: `<button>`, `<a>`, `<nav>`, `<main>`, `<header>`, `<footer>` used appropriately
- [ ] ARIA attributes used **only when native HTML is insufficient**
- [ ] Components follow [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

### 3.5 Contrast Requirements

| Element Type | Minimum Ratio |
|---|---|
| Normal text (< 18pt) | **4.5 : 1** |
| Large text (≥ 18pt) | **3 : 1** |
| UI components & graphics | **3 : 1** |
| Focus indicator | **3 : 1** against adjacent colors |

### 3.6 Multimodal Feedback (Cognitive Accessibility Extension)

For children with cognitive, attention, or learning disabilities — every significant event (success, error, warning) **must be communicated simultaneously through all three channels**:

| Channel | Implementation |
|---|---|
| **Visual** | Color change + icon (✅ ❌ ⚠️) + animation |
| **Auditory** | Short distinct sound (can be muted globally) |
| **Textual** | Plain-language message in an `aria-live` region |

```html
<!-- Announce result to screen reader AND show visually -->
<div role="alert" aria-live="assertive" class="feedback feedback--success">
  <span aria-hidden="true">✅</span>
  <span>Відповідь правильна! Молодець!</span>
</div>
```

> ❌ Feedback through **only one channel** (e.g., only a green color) is not acceptable.

---

## 4. Responsive Design & Touch Adaptation

### 4.1 Breakpoints (Mobile-First)

```css
/* xs */ @media (min-width: 320px) { }
/* sm */ @media (min-width: 480px) { }
/* md */ @media (min-width: 768px) { }
/* lg */ @media (min-width: 1024px) { }
/* xl */ @media (min-width: 1280px) { }
/* 2xl */ @media (min-width: 1536px) { }
```

**No horizontal scrolling is ever acceptable.**

### 4.2 Touch Target Sizes

- Minimum: **48×48 px** — spacing between targets: **8 px minimum**
- Primary actions: **56×56 px** recommended
- `user-scalable=no` is **strictly forbidden**

### 4.3 Device & Browser Support

| Category | Minimum |
|---|---|
| Browsers | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| Mobile OS | iOS 14+, Android 8+ |
| Screen sizes | 320px – 2560px |
| Input | Mouse, touch, keyboard, stylus |
| Orientation | Portrait and landscape (never force one) |

---

## 5. Cognitive Accessibility

### 5.1 Simplicity

- [ ] One primary task per screen
- [ ] Reading level targets **grade 4–6** for primary audience
- [ ] Use positive language — say what to do, not what not to do

### 5.2 Error Prevention & Recovery

- [ ] Destructive actions require explicit confirmation
- [ ] Progress is **auto-saved** — children must not lose work
- [ ] Error messages are friendly and constructive — never blame the user

### 5.3 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 6. Typography & Readability

- [ ] Minimum body font size: **16px (1rem)**
- [ ] Line height: minimum **1.5** for body, **1.3** for headings
- [ ] Paragraphs no wider than **75 characters**
- [ ] **Left-align text only** — never justify (uneven gaps harm dyslexic readers)
- [ ] Prioritize dyslexia-friendly fonts: **Atkinson Hyperlegible**, OpenDyslexic, Nunito
- [ ] Provide a font switcher where possible
- [ ] Maximum **2 typefaces** per project
- [ ] One `<h1>` per page; never skip heading levels

---

## 7. Color & Visual Design

- [ ] Color is never the **sole** means of conveying information
- [ ] Test in grayscale — must remain fully functional
- [ ] All color values use **CSS custom properties**
- [ ] Light mode is default; Dark mode via `prefers-color-scheme: dark`
- [ ] High contrast via `prefers-contrast: high`

```css
:root {
  --color-primary:       #1a56db;
  --color-text:          #111827;
  --color-text-muted:    #4b5563;
  --color-background:    #ffffff;
  --color-surface:       #f9fafb;
  --color-border:        #d1d5db;
  --color-error:         #dc2626;
  --color-success:       #16a34a;
  --color-warning:       #d97706;
  --color-focus-ring:    #3b82f6;
}

/* Focus — mandatory, never remove */
:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: 4px;
}
```

---

## 8. Keyboard & Alternative Input

### 8.1 Keyboard Navigation

- [ ] All flows completable with **Tab / Shift+Tab, Enter, Space, Arrow keys, Escape**
- [ ] Modal focus is **trapped inside modal** while open; returns to trigger on close
- [ ] Dynamic content announced via `aria-live`

```html
<div aria-live="polite" aria-atomic="true" class="sr-only" id="announcements"></div>
```

### 8.2 Voice Input — Speech-to-Text (Web Speech API)

Voice input is a primary assistive technology for users with motor impairments, dyslexia, and young children who cannot type fluently. It **must be supported** on all substantial text input fields.

**Scope — apply to:**
- Free-text answer fields
- Search inputs
- Essay / long-answer fields
- Any `<textarea>` or `<input type="text">` longer than a single word response

**Implementation pattern:**

```html
<!-- Voice input button paired with text field -->
<div class="input-with-voice">
  <label for="answer-field">Твоя відповідь</label>

  <div class="input-row">
    <textarea id="answer-field"
              aria-describedby="answer-hint voice-status"
              placeholder="Введи або надиктуй відповідь...">
    </textarea>

    <button type="button"
            id="voice-btn"
            class="voice-btn"
            aria-label="Голосове введення — натисни і говори"
            aria-pressed="false"
            title="Голосове введення">
      🎤
    </button>
  </div>

  <div id="voice-status"
       aria-live="polite"
       class="voice-status sr-only">
    <!-- Announces: "Слухаю...", "Готово", "Помилка мікрофона" -->
  </div>

  <p id="answer-hint" class="hint">
    Можна надиктувати відповідь мікрофоном
  </p>
</div>
```

```js
// Web Speech API — minimal production pattern
function initVoiceInput(buttonId, fieldId, statusId) {
  const btn    = document.getElementById(buttonId);
  const field  = document.getElementById(fieldId);
  const status = document.getElementById(statusId);

  // Guard: API not available (Firefox without flag, some mobile browsers)
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    btn.hidden = true; // Hide button silently — do NOT show an error to the user
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SR();

  recognition.lang          = 'uk-UA'; // Default; allow override per project locale
  recognition.interimResults = true;   // Show partial results while speaking
  recognition.maxAlternatives = 1;

  let isListening = false;

  btn.addEventListener('click', () => {
    isListening ? recognition.stop() : recognition.start();
  });

  recognition.onstart = () => {
    isListening = true;
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Зупинити запис голосу');
    status.textContent = 'Слухаю...';
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join('');
    field.value = transcript;          // Overwrite with latest result
    field.dispatchEvent(new Event('input')); // Trigger validation/auto-save
  };

  recognition.onend = () => {
    isListening = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Голосове введення — натисни і говори');
    status.textContent = 'Готово';
  };

  recognition.onerror = (event) => {
    isListening = false;
    btn.setAttribute('aria-pressed', 'false');
    // User-friendly error messages — never expose raw API error codes
    const messages = {
      'not-allowed':  'Доступ до мікрофона заборонено. Перевір налаштування браузера.',
      'no-speech':    'Нічого не почуто. Спробуй ще раз.',
      'network':      'Немає зʼєднання для голосового введення.',
    };
    status.textContent = messages[event.error] ?? 'Помилка голосового введення.';
  };
}
```

**Rules:**

- [ ] Voice button is visible and labeled — never hidden by default (only hidden if API unavailable)
- [ ] `aria-pressed` reflects listening state — screen reader announces start/stop
- [ ] `lang` attribute matches current UI language — switch when locale changes
- [ ] If `SpeechRecognition` is unavailable, button is silently removed — **no error shown to user**, text input remains fully functional
- [ ] Voice input **appends or replaces** field content — behavior is documented with a visible hint
- [ ] Interim (partial) results are displayed in the field in real time — reduces anxiety for the user
- [ ] Microphone permission prompt is triggered only on explicit user action (button click) — never on page load
- [ ] Error messages are plain-language Ukrainian — never raw API codes (`not-allowed`, `network`, etc.)

**Browser support note (document in project README):**

| Browser | Support |
|---|---|
| Chrome / Edge | ✅ Full |
| Safari (iOS 14.5+) | ✅ Full |
| Firefox | ⚠️ Requires `media.webspeech.recognition.enable` flag |
| Android WebView | ⚠️ Partial — test per device |

> ⚠️ **AI agents:** When generating any `<textarea>` or long `<input type="text">`, always add the voice input button pattern above unless the field is inside an authentication form (password, PIN, verification code).

---

## 9. Canvas, WebGL & Complex Widgets

> Standard HTML/ARIA rules do not apply to `<canvas>` and WebGL contexts.
> These elements are **invisible to screen readers by default**.
> Every interactive canvas-based feature requires an explicit accessibility layer.

### 9.1 Canvas Accessibility (Mandatory)

Every `<canvas>` element that conveys information or accepts interaction **must** have:

```html
<!-- Pattern: accessible DOM overlay on top of canvas -->
<div class="canvas-wrapper" style="position: relative;">

  <canvas id="game-canvas" width="800" height="600"
          aria-label="Інтерактивна гра: розміщення елементів на карті"
          role="img">
    <!-- Fallback for no-JS / no-canvas environments -->
    <p>Ваш браузер не підтримує canvas.
       <a href="/fallback-activity">Перейти до текстової версії завдання</a>
    </p>
  </canvas>

  <!-- Invisible accessible DOM layer — mirrors canvas state for screen readers -->
  <div id="canvas-a11y-layer"
       aria-live="polite"
       class="sr-only"
       role="region"
       aria-label="Стан гри">
    <!-- Dynamically updated via JS to reflect canvas state -->
  </div>

</div>
```

**Rules for every canvas implementation:**

- [ ] `aria-label` on `<canvas>` describes the **purpose**, not the technology
- [ ] An **accessible DOM layer** (`role="region"`, updated via JS) mirrors the meaningful state of the canvas
- [ ] Every interactive canvas element (button, drop zone, draggable item) has a **keyboard-accessible DOM equivalent** — either visible or visually hidden (`.sr-only`)
- [ ] Score, progress, and game state changes are announced via `aria-live="polite"` (non-urgent) or `aria-live="assertive"` (critical)
- [ ] A **text/non-canvas fallback** exists and is linked from within the canvas element
- [ ] Canvas-based games work in **two modes**: full canvas (default) and simplified accessible mode (DOM-based)

### 9.2 Drag-and-Drop Accessibility (WCAG 2.2 — 2.5.7)

All drag-and-drop interactions require a complete click/tap alternative:

```html
<!-- Pattern: Drag + Click-to-place alternative -->
<!-- Step 1: User clicks item to "pick it up" (aria-pressed="true") -->
<div role="button"
     aria-pressed="false"
     aria-label="Перетягніть або натисніть, щоб вибрати: Фотосинтез"
     tabindex="0"
     class="draggable-card"
     draggable="true">
  Фотосинтез
</div>

<!-- Step 2: User clicks a drop zone to place the selected item -->
<div role="button"
     aria-label="Зона для відповіді: Рослини. Натисніть, щоб помістити вибраний елемент"
     tabindex="0"
     aria-dropeffect="move"
     class="drop-zone">
  Рослини
</div>

<!-- Live region announces result -->
<div aria-live="polite" class="sr-only" id="dnd-status"></div>
```

- [ ] Keyboard flow: **Tab** to item → **Enter/Space** to select → **Tab** to target → **Enter/Space** to drop → **Escape** to cancel
- [ ] Selected state communicated via `aria-pressed="true"` and visual highlight
- [ ] Drop result announced in `aria-live` region
- [ ] Touch alternative: tap-to-select + tap-to-place (no drag required)

### 9.3 MathML / Mathematical Content

- [ ] Math formulas are rendered with **MathJax 3** or **KaTeX** — not as images
- [ ] MathJax/KaTeX output uses **MathML** for screen reader access (not SVG-only)
- [ ] Images of formulas (if unavoidable) have `alt` text with the full formula in text form: `alt="a squared plus b squared equals c squared"`
- [ ] Math is tested with NVDA + MathPlayer or VoiceOver on macOS

---

## 10. Performance & PWA Standards

### 10.1 Core Web Vitals Targets

| Metric | Target | Max |
|---|---|---|
| LCP | < 2.5s | < 4s |
| INP | < 100ms | < 300ms |
| CLS | < 0.1 | < 0.25 |

### 10.2 Asset Rules

- [ ] Images: **WebP** with fallback; explicit `width`/`height`; `loading="lazy"` below fold
- [ ] Initial JS: **< 200 KB** gzipped; CSS: **< 50 KB** gzipped
- [ ] No render-blocking scripts — use `defer` or `async`
- [ ] Loading states always shown; network errors show helpful message with retry

### 10.3 Progressive Web App (PWA) Requirements

> Ukrainian schools frequently experience unstable connectivity and power outages.
> This tool **must remain functional** during network interruptions.

**Required PWA features:**

- [ ] `manifest.json` with `name`, `short_name`, `icons` (192px + 512px), `start_url`, `display: standalone`, `lang: uk`
- [ ] HTTPS required (PWA prerequisite)
- [ ] **Service Worker** registered on first load

**Service Worker caching strategy:**

```js
// sw.js — recommended caching approach for educational tools
const STATIC_CACHE = 'edu-static-v1';
const DYNAMIC_CACHE = 'edu-dynamic-v1';

// Cache-first for static assets (HTML shell, CSS, JS, fonts, icons)
// Network-first for API calls and dynamic content
// Stale-while-revalidate for images and non-critical content

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',       // ← dedicated offline fallback page
  '/css/main.css',
  '/js/app.js',
  '/fonts/atkinson.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', event => {
  // Network-first for API, cache-first for static
});
```

- [ ] `/offline.html` exists — a friendly page shown when user is offline, with list of cached content available
- [ ] Progress and user answers are **saved to localStorage / IndexedDB** immediately on input — not only on submit
- [ ] On reconnect, pending data is synced automatically (Background Sync API where supported)

**Offline user experience checklist:**

- [ ] User sees a clear, friendly message when offline (not a browser error page)
- [ ] Previously loaded lessons/content remain accessible from cache
- [ ] Input fields remain active offline; data is queued for submission
- [ ] No spinner that hangs forever — timeout after **8 seconds** with offline fallback message

---

## 11. Design Tokens & AI Agent Rules

> This section is written **directly for AI coding agents** (Claude Code, Codex, Cursor, Copilot).
> These are hard constraints, not suggestions. Violations require manual review before merge.

### 11.1 Token-Only Design System

A `tokens.css` (or `tokens.json`) file is the **single source of truth** for all visual values.

**AI agents MUST:**
- [ ] Use **only** CSS variables defined in `tokens.css` for colors, spacing, radii, shadows, font sizes, z-index
- [ ] Never invent new color values — if a needed color is missing, **add it to `tokens.css` with a comment**, do not inline it
- [ ] Never use hardcoded `px` values for spacing — use `var(--space-N)` tokens
- [ ] Never use hardcoded hex/rgb/hsl color values anywhere in component files

**AI agents MUST NOT:**
- ❌ Add a new `npm` / `yarn` dependency without a comment explaining why it is necessary
- ❌ Import any UI component library not already in `package.json` (e.g., no spontaneous addition of Material UI, Chakra, Ant Design)
- ❌ Create new CSS classes that duplicate existing utility classes
- ❌ Use `!important` except in accessibility overrides (`prefers-reduced-motion`, `prefers-contrast`)
- ❌ Generate inline `style=""` attributes with color or spacing values — use class names with token variables

```css
/* tokens.css — AI agents read this file before writing any CSS */

/* ─── Colors ─────────────────────────────────────── */
:root {
  --color-primary:        #1a56db;
  --color-primary-hover:  #1e429f;
  --color-primary-active: #1a3a8f;
  --color-secondary:      #7e3af2;
  --color-text:           #111827;
  --color-text-muted:     #4b5563;
  --color-text-inverse:   #ffffff;
  --color-background:     #ffffff;
  --color-surface:        #f9fafb;
  --color-surface-raised: #f3f4f6;
  --color-border:         #d1d5db;
  --color-border-strong:  #9ca3af;
  --color-error:          #dc2626;
  --color-error-bg:       #fef2f2;
  --color-success:        #16a34a;
  --color-success-bg:     #f0fdf4;
  --color-warning:        #d97706;
  --color-warning-bg:     #fffbeb;
  --color-focus-ring:     #3b82f6;

/* ─── Spacing (8px grid) ─────────────────────────── */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  24px;
  --space-6:  32px;
  --space-7:  48px;
  --space-8:  64px;
  --space-9:  96px;
  --space-10: 128px;

/* ─── Typography ─────────────────────────────────── */
  --font-size-xs:   0.75rem;   /* 12px */
  --font-size-sm:   0.875rem;  /* 14px */
  --font-size-base: 1rem;      /* 16px — minimum for body */
  --font-size-lg:   1.125rem;  /* 18px */
  --font-size-xl:   1.25rem;   /* 20px */
  --font-size-2xl:  1.5rem;    /* 24px */
  --font-size-3xl:  1.875rem;  /* 30px */
  --font-size-4xl:  2.25rem;   /* 36px */

/* ─── Border Radius ──────────────────────────────── */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   16px;
  --radius-xl:   24px;
  --radius-pill: 9999px;

/* ─── Shadows ────────────────────────────────────── */
  --shadow-0: none;
  --shadow-1: 0 1px 3px rgba(0,0,0,.1), 0 1px 2px rgba(0,0,0,.06);   /* card */
  --shadow-2: 0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06);  /* dropdown */
  --shadow-3: 0 10px 15px rgba(0,0,0,.1), 0 4px 6px rgba(0,0,0,.05); /* modal */

/* ─── Z-index scale ──────────────────────────────── */
  --z-base:    0;
  --z-raised:  10;
  --z-dropdown:200;
  --z-sticky:  300;
  --z-overlay: 400;
  --z-modal:   500;
  --z-toast:   600;
  --z-tooltip: 700;
}
```

### 11.2 Component Generation Rules for AI Agents

When generating or modifying a component, the AI agent **must**:

1. **Check `tokens.css` first** — use existing tokens, do not create parallel values
2. **Check for an existing component** before creating a new one — reuse over reinvent
3. **Add ARIA attributes** to every interactive element — no exceptions
4. **Include all interactive states** in CSS: `:hover`, `:focus-visible`, `:active`, `:disabled`
5. **Write the `.sr-only` utility class** if it is not present:

```css
/* Visually hidden but accessible to screen readers */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
```

6. **Never generate `<canvas>` without an accessible DOM layer** (see Section 9.1)
7. **Never generate a form** without associated `<label>` elements
8. **Never generate a modal** without focus trap logic and Escape-to-close

---

## 12. Child Safety & Privacy

- [ ] Collect **only data necessary** for educational function
- [ ] No sensitive personal data from minors without verifiable parental consent
- [ ] No advertising or tracking pixels of any kind
- [ ] All user-generated content moderated before display
- [ ] Content is age-appropriate for the target grade level

---

## 13. Internationalization & Language

- [ ] All visible text in **language resource files** — no hardcoded strings
- [ ] UI handles **30–40% text expansion** for translations without breaking layout
- [ ] Default language: **Ukrainian**
- [ ] Ukrainian typography: quotes «», em dash —
- [ ] Font verified to include full **Cyrillic character set**

---

## 14. Testing Checklist

### 14.1 Automated

```bash
npx axe-core
npx lighthouse --preset=desktop
npx lighthouse --preset=mobile
npx html-validate ./dist/**/*.html
```

### 14.2 Accessibility (Manual)

- [ ] Keyboard-only navigation of full app (no mouse)
- [ ] NVDA + Firefox / VoiceOver + Safari / TalkBack
- [ ] Browser zoom at 200% — no content loss
- [ ] Windows High Contrast Mode
- [ ] Color blindness simulation (Chrome DevTools)
- [ ] **WCAG 2.2 specific:** test focus not obscured by sticky headers (2.4.11)
- [ ] **WCAG 2.2 specific:** verify all drag-and-drop has click/tap alternative (2.5.7)
- [ ] **WCAG 2.2 specific:** all targets meet 24×24px minimum (2.5.8)

### 14.3 UX Testing (Critical)

- [ ] **5-second test** — show screen to a new user for 5 sec: they must name the primary action correctly
- [ ] **First-click test** — where do new users click first? It must be the primary action
- [ ] **Hallway test (Krug)** — 3–5 people outside the team complete the core task without guidance
- [ ] **Think-aloud with children** — observe a child; document every moment of hesitation
- [ ] **Nielsen heuristic evaluation** — audit all 10 heuristics and document findings

### 14.4 Devices

- [ ] Smartphone portrait (375px) and landscape (667px)
- [ ] Tablet portrait (768px) and landscape (1024px)
- [ ] Laptop (1280px) and Desktop (1440px+)
- [ ] Touch tested on actual physical device

### 14.5 Performance & PWA

- [ ] Lighthouse: **Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 90**
- [ ] CPU throttle 4× + Slow 3G simulation
- [ ] PWA installable (passes Chrome install criteria)
- [ ] Offline mode: disconnect network, verify `/offline.html` appears and cached content loads
- [ ] Canvas elements: test with screen reader + verify `aria-live` announcements fire correctly

---

## 15. Prohibited Patterns

### HTML & Semantics
- ❌ `<div onclick="...">` instead of `<button>` or `<a>`
- ❌ Skipping heading levels (h1 → h3)
- ❌ Missing `alt` attributes on informative images
- ❌ `<table>` for layout
- ❌ `<canvas>` without an accessible DOM layer and fallback content

### CSS & Visuals
- ❌ `outline: none` without a replacement focus indicator
- ❌ `user-scalable=no` in viewport meta
- ❌ Font size below **12px**
- ❌ Color contrast below **4.5:1** for normal text
- ❌ Fixed `px` font sizes on body copy (use `rem`)
- ❌ Hardcoded color values outside of `tokens.css`
- ❌ Hardcoded spacing values — use `var(--space-N)` tokens

### UX Anti-Patterns
- ❌ **Dark patterns** — misleading UI that tricks users (pre-checked opt-ins, hidden unsubscribe)
- ❌ **Confirmshaming** — "No thanks, I hate learning" style decline buttons
- ❌ **Roach motel** — easy to enter, hard to exit (e.g., account impossible to delete)
- ❌ **Bait and switch** — UI behaves differently than it appeared it would
- ❌ **10+ items in any menu/list** without grouping (violates Hick's Law)
- ❌ **Modal on top of modal** — maximum one modal layer at a time
- ❌ **Auto-advancing carousels** — content disappears without user control
- ❌ **Infinite scroll without position restore** — user loses place on Back navigation
- ❌ **Drag-only interactions** with no click/tap alternative (violates WCAG 2.2 — 2.5.7)

### Behavior
- ❌ Auto-playing audio/video with sound and no pause/stop control
- ❌ Content flashing more than **3 times per second**
- ❌ Time limits with no option to extend or disable
- ❌ Opening new tabs without warning
- ❌ Keyboard traps

### AI Agent–Specific Prohibitions
- ❌ Adding npm/yarn dependencies without explicit comment justification
- ❌ Importing UI component libraries not in `package.json`
- ❌ Using `!important` outside of accessibility media query overrides
- ❌ Generating inline `style=""` with color or spacing values
- ❌ Generating `<canvas>` or drag-and-drop without the required accessibility patterns from Section 9

### Privacy & Safety
- ❌ Third-party tracking scripts without explicit consent
- ❌ Passwords in plain text or localStorage
- ❌ Children's data collection without parental consent mechanism

---

## 📚 Key References

| Resource | URL / Note |
|---|---|
| **WCAG 2.2** | https://www.w3.org/TR/WCAG22/ |
| ARIA Authoring Practices | https://www.w3.org/WAI/ARIA/apg/ |
| WebAIM Contrast Checker | https://webaim.org/resources/contrastchecker/ |
| **Laws of UX** | https://lawsofux.com |
| Nielsen's 10 Heuristics | https://www.nngroup.com/articles/ten-usability-heuristics/ |
| **Calm Technology** — Amber Case | https://calmtech.com |
| Google Lighthouse | https://developer.chrome.com/docs/lighthouse/ |
| Axe Accessibility | https://www.deque.com/axe/ |
| Coblis Color Blindness Sim | https://www.color-blindness.com/coblis-color-blindness-simulator/ |
| MathJax Accessibility | https://www.mathjax.org/accessibility/ |
| Web App Manifest | https://developer.mozilla.org/en-US/docs/Web/Manifest |
| Service Worker API | https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API |
| Atkinson Hyperlegible Font | https://brailleinstitute.org/freefont |
| OpenDyslexic Font | https://opendyslexic.org/ |
| Material Design Accessibility | https://m3.material.io/foundations/accessible-design/ |
| **"Don't Make Me Think"** — Steve Krug | 3rd ed. 2014 |
| **"The Design of Everyday Things"** — Don Norman | Revised ed. 2013 |

---

> **Last updated:** _(fill in date at project creation)_
> **Version:** 3.0
> **Maintained by:** _(author name)_
>
> *Review and update at the start of each new major feature.*
