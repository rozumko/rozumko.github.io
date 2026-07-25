# ADR-0006: Content is database-owned and ships only as a published snapshot

_Status: Accepted — 2026-07-24 (recorded retroactively for migrations
`0036`-`0038` and `0041`, which shipped before this record existed)_

## Context

Content started as hand-edited rows and committed JSON bundles. That worked
while one person edited a small question bank, but it broke down as soon as
content became the product: questions, micro-lessons, missions and the learning
path all feed children directly, and several of them carry answer keys.

Three problems forced a decision. An edit to a live question silently changed
what an in-flight attempt was being scored against. Nothing recorded *who*
changed *what*, so a bad edit could not be explained or reverted. And a routine
frontend deployment rebuilt `public/` from committed files, quietly restoring an
older content bundle over newer live content.

## Decision

**The database owns content; children only ever see a published snapshot.**

- Questions, micro-lessons and missions move through
  `draft -> review -> published -> archived`. Only `published` rows are issued
  by public practice, Home, School, event selection or the static export.
- Every create, edit, status change and restore writes an immutable snapshot to
  a `*_revisions` table in the same transaction as the mutation, and admin
  writes use `edit_version` optimistic locking. A published revision is never
  edited in place — a replacement is a separate draft, so in-flight and
  historical scoring stay stable. Revision tables are admin-API-only with RLS
  enabled and no browser-facing policy.
- Publishing static bundles is an **audited job, not a side effect of a push**.
  The admin API freezes the exact published-version manifest in
  `content_publications` (one active job), GitHub Actions re-exports from
  PostgreSQL with a dedicated read-only role, and deployment is refused when the
  freshly computed manifest differs from the approved hash. Callbacks are
  HMAC-signed, timestamp-bounded and state-machine checked.
- The backend's publication token is a fine-grained repository token with
  **Actions: write only** — it can dispatch the Pages workflow and cannot push
  code. Ordinary pushes re-export current published content too, so a code
  deployment cannot restore a stale committed bundle.

## Alternatives considered

- **Editing live rows directly, as before** — rejected: no audit trail, and an
  edit during an active event changes the basis of an in-flight attempt.
- **Content as committed JSON reviewed through pull requests** — rejected: it
  makes every wording fix an engineering task, and it was the mechanism that
  caused stale bundles to overwrite live content.
- **Letting the backend commit and push exported bundles** — rejected: that
  gives a network-facing service write access to source code. Dispatching a
  workflow with an Actions-only token is the least privilege that still works.
- **Trusting the exporter's output as-is** — rejected: the export role is
  subject to RLS, so a missing `GRANT`/policy returns zero rows instead of
  failing. The manifest hash comparison plus a per-family emptiness check turn
  that silence into a hard error.

## Consequences

- Adding a content table means adding its `GRANT SELECT` and exporter read
  policy **in the same change**, or publication fails closed (this already
  happened once with `public.missions`).
- New authorable mission kinds go through the single `EDITABLE_MISSION_KINDS`
  constant, guarded by a regression test. Generated puzzles stay read-only code.
- Content edits are decoupled from deployments: an administrator publishes
  without an engineer, and the audit trail explains every live bundle.
- Restores must include the content and revision tables — see
  [backup-restore.md](../backup-restore.md). Losing a `path_map_revisions` row
  invalidates already deployed bundles that reference it.
