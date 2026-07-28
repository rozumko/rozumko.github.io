// ── School activity registry (fail-closed) ───────────────────────────────────
// Class activities are procedural games: they carry no content rows and no
// answer key, so the server cannot grade them the way it grades questions.
// The browser reports the outcome; this registry is the only place that says
// which activities exist, which levels each accepts and what result values are
// even plausible. Unknown key or level → 400 (same shape as taxonomy.ts).
//
// Trust boundary: an activity result is `client-unverified` evidence for the
// teacher dashboard only. It must never feed entitlements, payments or
// certificates — see docs/security-model.md.

export type SchoolActivityKey = 'key-puzzle' | 'maze' | 'windows' | 'mouse-buttons'

/** Devices an activity is usable on. School Mode targets computer labs first. */
export type SchoolActivityDevice = 'desktop' | 'any'

export interface SchoolActivityLevel {
  id: string
  /** Upper bound of `total` the client may report for this level. */
  maxTotal: number
  /** Below this many seconds a completed run is not physically plausible. */
  minDurationSec: number
}

export interface SchoolActivityDefinition {
  key: SchoolActivityKey
  device: SchoolActivityDevice
  levels: readonly SchoolActivityLevel[]
  /**
   * Star rubric. Per-activity because completion alone means different things:
   * key-puzzle can only end at 100%, so its rubric leans on the mistake count,
   * while a timed or scored game will lean on the ratio.
   */
  stars: (result: ActivityResultInput) => number
}

// key-puzzle: the child drags loose letter keys onto an empty keyboard. All
// three levels share the same key set (difficulty only changes hint
// visibility), so one ceiling covers them: the 26 letters of the layout.
const KEY_PUZZLE_MAX_TOTAL = 26

export const SCHOOL_ACTIVITIES: Record<SchoolActivityKey, SchoolActivityDefinition> = {
  'key-puzzle': {
    key: 'key-puzzle',
    device: 'desktop',
    levels: [
      { id: 'easy',   maxTotal: KEY_PUZZLE_MAX_TOTAL, minDurationSec: 10 },
      { id: 'medium', maxTotal: KEY_PUZZLE_MAX_TOTAL, minDurationSec: 10 },
      { id: 'hard',   maxTotal: KEY_PUZZLE_MAX_TOTAL, minDurationSec: 10 },
    ],
    // Same rubric the children already know from the standalone game: a clean
    // board is 3 stars, a few misses 2, a messy assembly 1. A run cut short by
    // the teacher scores on how far the child got.
    stars: ({ correct, total, mistakes }) => {
      if (correct < total) {
        const percent = (correct / total) * 100
        return percent >= 75 ? 2 : percent >= 40 ? 1 : 0
      }
      return mistakes === 0 ? 3 : mistakes < 5 ? 2 : 1
    },
  },
  // maze: the child drags a dot through a maze without touching a wall.
  // `total` is the number of levels in the mode the teacher picked, so the
  // ceiling differs per level — unlike key-puzzle.
  maze: {
    key: 'maze',
    device: 'any',
    levels: [
      { id: 'beginner', maxTotal: 5,  minDurationSec: 10 },
      { id: 'master',   maxTotal: 10, minDurationSec: 20 },
    ],
    // A wall hit costs no progress, only accuracy, so the budget scales with
    // how many levels the child had to walk through.
    stars: ({ correct, total, mistakes }) => {
      if (correct < total) {
        const percent = (correct / total) * 100
        return percent >= 75 ? 2 : percent >= 40 ? 1 : 0
      }
      return mistakes <= total ? 3 : mistakes <= total * 3 ? 2 : 1
    },
  },
  // windows: a fixed number of windows to close, minimise or maximise. Unlike
  // the other two the child always reaches the end, so `correct` is a genuine
  // accuracy score and the rubric is the plain percentage one.
  windows: {
    key: 'windows',
    device: 'desktop',
    levels: [
      { id: 'easy',   maxTotal: 10, minDurationSec: 15 },
      { id: 'medium', maxTotal: 15, minDurationSec: 20 },
      { id: 'hard',   maxTotal: 20, minDurationSec: 25 },
    ],
    stars: ({ correct, total }) => {
      const percent = (correct / total) * 100
      return percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0
    },
  },
  // mouse-buttons: left button steers left, right button steers right. Each
  // obstacle that reaches the ambulance is one decision, so `total` is however
  // many arrived during the fixed run time — it varies per run, and the
  // ceiling is what the spawn rate can physically produce in that time.
  'mouse-buttons': {
    key: 'mouse-buttons',
    device: 'desktop',
    // Ceilings sit above what the spawn rate can produce in the run time
    // (measured: ~331 obstacles across a full master run, ~362 in theory at
    // the tightest spawn interval). Rejecting an honest result is worse than a
    // loose ceiling, so there is headroom.
    levels: [
      { id: 'beginner', maxTotal: 150, minDurationSec: 60 },
      { id: 'master',   maxTotal: 500, minDurationSec: 150 },
    ],
    stars: ({ correct, total }) => {
      const percent = (correct / total) * 100
      return percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0
    },
  },
}

export const SCHOOL_ACTIVITY_KEYS = ['key-puzzle', 'maze', 'windows', 'mouse-buttons'] as const satisfies readonly SchoolActivityKey[]

/** Every level id any activity accepts — for the route's JSON schema enum. */
export const SCHOOL_ACTIVITY_LEVEL_IDS: readonly string[] = [
  ...new Set(
    SCHOOL_ACTIVITY_KEYS.flatMap(key => SCHOOL_ACTIVITIES[key].levels.map(l => l.id)),
  ),
]

// A run cannot outlive the session join TTL (school.ts SESSION_JOIN_TTL_MS).
export const ACTIVITY_MAX_DURATION_SEC = 2 * 60 * 60

export type SchoolSessionKind = 'questions' | 'activity'

export function normalizeSessionKind(raw: unknown): SchoolSessionKind {
  if (raw == null || raw === '') return 'questions'
  if (raw === 'questions' || raw === 'activity') return raw
  throw new Error('Невідомий тип сесії')
}

export function resolveActivityDefinition(raw: unknown): SchoolActivityDefinition {
  if (typeof raw !== 'string') throw new Error('Оберіть активність')
  // hasOwn, not a plain lookup: 'constructor' and friends would otherwise
  // resolve through Object.prototype and pass as an activity.
  if (!Object.hasOwn(SCHOOL_ACTIVITIES, raw)) throw new Error('Невідома активність')
  return SCHOOL_ACTIVITIES[raw as SchoolActivityKey]
}

export function resolveActivityLevel(
  activity: SchoolActivityDefinition,
  raw: unknown,
): SchoolActivityLevel {
  if (raw == null || raw === '') {
    const first = activity.levels[0]
    if (!first) throw new Error('Активність без рівнів')
    return first
  }
  if (typeof raw !== 'string') throw new Error('Невідомий рівень активності')
  const level = activity.levels.find(l => l.id === raw)
  if (!level) throw new Error('Невідомий рівень активності')
  return level
}

export interface ActivityResultInput {
  correct: number
  total: number
  durationSec: number
  mistakes: number
}

export interface NormalizedActivityResult extends ActivityResultInput {
  stars: number
}

/** A plausible mistake budget: more misses than this is noise, not evidence. */
export const ACTIVITY_MAX_MISTAKES = 999

/**
 * Clamps a client-reported result to what the registry allows and derives the
 * star count server-side. Rejects impossible shapes outright rather than
 * silently storing them: a wrong number in the teacher's dashboard is worse
 * than a missing one.
 */
export function normalizeActivityResult(
  activity: SchoolActivityDefinition,
  level: SchoolActivityLevel,
  input: ActivityResultInput,
): NormalizedActivityResult {
  const { correct, total, durationSec, mistakes } = input
  if (![correct, total, durationSec, mistakes].every(Number.isInteger)) {
    throw new Error('Невірний результат активності')
  }
  if (total < 1 || total > level.maxTotal) throw new Error('Невірний результат активності')
  if (correct < 0 || correct > total) throw new Error('Невірний результат активності')
  if (mistakes < 0 || mistakes > ACTIVITY_MAX_MISTAKES) throw new Error('Невірний результат активності')
  if (durationSec < level.minDurationSec) throw new Error('Невірний результат активності')
  if (durationSec > ACTIVITY_MAX_DURATION_SEC) throw new Error('Невірний результат активності')

  const stars = Math.max(0, Math.min(3, Math.floor(activity.stars(input))))
  return { correct, total, durationSec, mistakes, stars }
}
