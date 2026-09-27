# Visual Lesson Builder

Entry: admin → **Конструктор уроків** (`admin.html#lesson-builder`), gated
by the existing Lesson Engine flag and database-authorized admin session.

The builder authors the existing curriculum lesson schema and uses the
existing optimistic-locking editorial routes, immutable revisions, projection
gate, projector window and teacher run console. Boards need migration `0062`.

## Authoring

Two fields: a large **board** of collected materials on the left and the
**lesson outline** on the right. Scattered materials are dragged into a
structured lesson. Every card is a thumbnail only; a click opens a dialog with
the preview and every action.

- **Boards** are topic canvases (Інтернет, Космос…), switched by tabs. The
  canvas pans (drag the background, wheel), zooms (Ctrl/⌘ + wheel, pinch, the
  − / + / fit controls) and keeps every card where it was put. Shift + drag
  selects several, Shift + click adds to the selection, Delete removes (with an
  undo toast), arrows nudge, and «Упорядкувати» lays cards out by type.
- **Search** spans all boards. Non-matching cards on this board are dimmed;
  matches on other boards appear in a strip above the canvas, from where they
  open their board or are dragged straight into the lesson. Type chips filter
  the same way.
- **Adding**: drop files, links or images anywhere on the canvas, paste with
  Ctrl+V, or use «+ Додати» (text, image, video, PDF, HTML, LearningApps, link,
  file upload). Large photos are shrunk to WebP/JPEG under 512 KiB. HTML has a
  live sandboxed preview and warns when code relies on external resources.
  Thumbnails never run authored HTML.
- **From lessons** opens a drawer with every saved lesson's cards, grouped by
  lesson and loaded in one request; thumbnails render lazily. Tasks come from
  here or from «+ Завдання»; materials from it can also be dropped on the board.
- **Outline**: numbered thumbnails. Drag to reorder, or drop from the board at
  the marked position. A step dialog offers edit, copy (placed right after),
  up/down, remove, and «Де показувати»: projector, student devices, both, or
  teacher only. Undo/redo, «+ Текстовий слайд», and a ⋯ menu for opening a
  lesson, settings (grade, an existing module), the full editor and JSON export.
- Native activity editing reuses the existing activity dialog. An unchanged
  dialog leaves no undo step. Copies get new block and activity IDs and bring
  referenced assets/outcomes with them.

## Storage limits

Collected materials live on server-side **boards** (migration `0062`,
`/api/admin/builder`): one board per topic, each a canvas where every material
keeps its position. Boards are owner-scoped and available on any device;
search spans all of the owner's boards. A material holds only non-scored canvas
items (max 1 MiB, 300 per board); tests and activities come from saved lessons
or are created in the lesson itself. The legacy browser inbox (IndexedDB) is
imported into a board on first open and then cleared. Saved lessons remain the
shared card library, served in one request by `GET /api/admin/curriculum/cards`
with embedded file payloads emptied. Unsaved lesson edits stay in memory and
are protected by an unload warning.

Migration `0062_add_builder_boards` must be applied before the updated backend
serves the builder.

Embedded files are limited to 512 KiB each; total serialized lesson size is
4 MiB. This keeps audited snapshots bounded without introducing an object
storage service. Larger PDFs can be linked and opened separately. Supported
uploaded PDFs render through the browser PDF viewer, with a download fallback.

## Conducting

**Провести урок** asks how. **Лише проєктор** saves the draft and opens the
projector console with direct slide selection and the existing keyboard/clicker
controls; the projector receives only the board projection, and notes and keys
never leave the admin console. **З класом** saves, asks to publish
(review → published) when the lesson is not published yet, and opens the
existing teacher lesson surface: class picker, join links, device mapping,
activity dispatch, live grid and reports. Publication is never a silent side
effect of saving or presenting. Canvas student content follows its authored
current-step visibility; activities are dispatched separately and take priority.

The builder does not claim to collect scores from LearningApps or arbitrary
external websites. Such resources are launch/display materials.

## Verification

`features/admin/builder-canvas-model.test.mjs` covers canvas geometry (zoom at
the cursor, fit, arrange, free cell, marquee). `backend/src/lib/builder-materials.test.ts`
and `backend/src/routes/builder-admin.test.ts` cover material validation,
search text, owner scoping, UUID/coordinate validation, the flag and auth.
`backend/src/lib/curriculum-builder-security.test.ts` verifies the explicit
HTML exception, unknown-field rejection, file signatures and size limits.
`tests/layout/lesson-builder.spec.ts` drives the real UI with pointer drags:
HTML isolation, board → outline insertion, multi-select delete/undo,
cross-board search, the one-request lesson drawer, legacy inbox import, the
projector console, PDF preview, accessibility (light/dark) and a narrow viewport.
