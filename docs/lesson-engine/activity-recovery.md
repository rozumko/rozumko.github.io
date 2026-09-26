# Activity recovery and remote slides

This change requires migration `0061_add_lesson_activity_progress` before the
updated backend starts. The migration was applied to the locally configured
database on 2026-09-26. Its journal hash, assignment version column, progress
table constraints, and enabled RLS were verified against database metadata.
Student clients must reload after the API rollout because
submissions now require the run-student ID and device assignment version.

## Saved work

`POST /api/student/lesson/progress` stores a raw, ungraded checkpoint per
dispatch and run student. It does not create an attempt, score, or outcome
evidence. Choices, true/false answers and classification save partial selections.
The typing-words activity additionally saves the shuffled texts, word index,
letter index, mistakes and elapsed game duration. Other games currently save
their aggregate snapshot only and explicitly show that the game restarts;
full continuation requires their own `checkpoint`/`resumeState` adapter.
External tools do not expose a recovery contract.

Changes first persist locally, then flush about once per second. A task being
removed or paused captures the last game checkpoint and flushes it. The server
accepts a final checkpoint for up to 60 seconds after dispatch closure; it never
accepts a scored answer to a closed dispatch. A finished/cancelled run accepts
neither new checkpoints nor new attempts. Recovery ignores local drafts older
than 12 hours; drafts contain no device token. Local storage is best effort.

Reload restores the latest checkpoint and, when it still matches the server
revision, pending local edits. Changing devices restores the latest checkpoint
that reached the server. Unsynced work left on a disconnected laptop cannot be
recovered on a tablet. Checkpoints remain scoped to their original dispatch;
sending an activity again creates a fresh dispatch.

## A laptop left running during evacuation

The teacher assigns the same run student to the tablet through the existing
device mapping control. The old laptop may remain powered on, online, and even
continue polling or running a timer. Mapping increments assignment versions on
the old and new devices. Both checkpoints and scored submissions require the
exact current student and assignment version. An old request is refused before
any write, including after the laptop is assigned back to the same student.

Writes take a shared run lock first, then re-read and lock the device. Parallel
pupils can save concurrently; teacher reassignment, dispatch closure and lesson
transitions take an exclusive run lock in the same order.
Checkpoint revisions prevent parallel tabs or a delayed save from overwriting
newer confirmed work. A lost response can replay the identical last checkpoint
without creating another revision. No new student identification flow is added.

## Remote presentation

The student state endpoint projects the current run block using the projector's
student-visible presentation gate. It sends only the public headline, short
text, selected assets, board canvas items and display-safe activity metadata.
Teacher notes, expected answers, speaker notes, scoring keys and outcome links
are excluded. The student renders the slide with the same slide renderer as the
projector. Active tasks take priority; an authored student practice material
retains its existing priority over the slide. Pausing shows the attention screen.
Synchronization uses the existing state polling and requires connectivity.

## Verification

Unit and injected API tests cover partial recovery, lost responses, concurrent
edits, assignment changes, forged tokens, UUID validation and public slide
projection. Browser tests cover reload/offline recovery, a running old laptop
plus a new tablet, remote slide changes, task priority, pause, and continuing the
exact typing word and letter at a 390-pixel viewport. Browser persistence is
mocked; these tests do not establish PostgreSQL transaction/constraint behavior
or the behavior of physical classroom equipment.
