# Visual Lesson Builder MVP

Entry: admin → **Конструктор уроків** (`admin.html#lesson-builder`), gated
by the existing Lesson Engine flag and database-authorized admin session.

The builder authors the existing curriculum lesson schema and uses the
existing optimistic-locking editorial routes, immutable revisions, projection
gate, projector window and teacher run console. No migrations or new service
configuration are needed.

## Authoring

- Library / sequence split with search, subject, grade, topic/module and type
  filters; the sequence can be expanded and stacks on narrow screens.
- Capture by URL paste, cross-tab image/URL drop, or PNG/JPEG/WebP/PDF upload.
  Capture inherits the current subject, grade and topic filters. Missing topics
  do not block use. URL-backed images still depend on the external host.
- Text, image, YouTube, LearningApps, PDF, HTML code, link and native activity
  cards. HTML has source editing, an isolated preview, and inline CSS/JS.
  External scripts and network requests are intentionally unavailable there.
- Native activity editing reuses the existing activity dialog (choice,
  true/false, classification, platform games, pack-allowlisted external tools).
- Saved lessons can be opened as a block library or appended in full. Copies
  get new block and activity IDs and bring referenced assets/outcomes with them.
  Whole lessons are flattened into the sequence rather than nested.
- Drag reorder, keyboard-accessible move buttons, duplication, deletion,
  undo/redo, JSON export, and server save with conflict protection.

## Storage limits

The capture inbox is local IndexedDB scoped to the admin ID. It is explicitly
labelled as this browser's library. Saving a lesson puts its cards in the
server-backed lesson library, accessible on other devices. The local inbox
stores only non-scored canvas materials; no answer keys are persisted there.
Unsaved lesson edits stay in memory and are protected by an unload warning.

Embedded files are limited to 512 KiB each; total serialized lesson size is
4 MiB. This keeps audited snapshots bounded without introducing an object
storage service. Larger PDFs can be linked and opened separately. Supported
uploaded PDFs render through the browser PDF viewer, with a download fallback.

## Conducting

**Розпочати урок** saves/validates the draft and opens the projector console.
It supports direct slide selection and the existing keyboard/clicker controls.
The projector receives only the board projection; notes and keys never leave
the admin console.

**Провести з учнями** opens the existing teacher lesson surface. A draft
requires explicit publication first (review → published); publication is not
an automatic side effect of saving or presenting. The existing class picker,
join links, device mapping, activity dispatch, live grid and reports apply.
Canvas student content follows its authored current-step visibility;
activities are dispatched separately and take priority, as before.

The builder does not claim to collect scores from LearningApps or arbitrary
external websites. Such resources are launch/display materials.

## Verification

`features/admin/lesson-builder-model.test.mjs` verifies capture URL rejection,
copy identity/dependency handling and default display boundaries.
`backend/src/lib/curriculum-builder-security.test.ts` verifies the explicit
HTML exception, unknown-field rejection, file signatures and size limits.
`tests/layout/lesson-builder.spec.ts` exercises real schema validation with
mocked HTTP persistence, interactive HTML isolation, reload/edit/projector,
native activities, clipboard/file capture, accessibility and responsive layout.
