// ── Class activity contract ──────────────────────────────────────────────────
// An activity is a procedural game with no content rows and no answer key. The
// runner mounts it into a container, the game reports its own outcome, and the
// School page sends that outcome to the server as client-unverified evidence
// (backend/src/lib/school-activities.ts).
//
// Deliberately narrower than the Home Mode ActivityResult (features/path):
// School needs only what the teacher's dashboard shows.

export interface ActivityRunResult {
  /** How much of the activity the child completed. */
  correct: number
  /** How much there was to complete. */
  total: number
  /** Wrong attempts along the way; feeds the star rubric. */
  mistakes: number
  durationSec: number
}

export interface ActivityMountOptions {
  /** Level id from the registry; the teacher chose it when starting the game. */
  level: string
  /** Called once the child finishes on their own. */
  onFinish: (result: ActivityRunResult) => void
  /** Progress text for the surrounding shell, e.g. "7 / 18". */
  onProgress?: (done: number, total: number) => void
}

export interface ActivityHandle {
  /**
   * Result as of right now. The School page calls this when the teacher ends
   * the session before the child is done, so partial work still counts.
   */
  snapshot(): ActivityRunResult
  /** Detach listeners and clear the container. */
  destroy(): void
}

export type ActivityMount = (container: HTMLElement, options: ActivityMountOptions) => ActivityHandle
