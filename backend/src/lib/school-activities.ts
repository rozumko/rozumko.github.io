// ── School activity registry (fail-closed) ───────────────────────────────────
// Class activities are low-stakes formative games. Procedural games report a
// bounded outcome; content-backed games evaluate individual answers through a
// dedicated server endpoint and still report a client-unverified aggregate.
// This registry is the only place that says
// which activities exist, which levels each accepts and what result values are
// even plausible. Unknown key or level → 400 (same shape as taxonomy.ts).
//
// Trust boundary: an activity result is `client-unverified` evidence for the
// teacher dashboard only. It must never feed entitlements, payments or
// certificates — see docs/security-model.md.

export type SchoolActivityKey =
  | 'key-puzzle'
  | 'typing-keys'
  | 'typing-words'
  | 'typing-sprint'
  | 'typing-lessons'
  | 'maze'
  | 'windows'
  | 'mouse-buttons'
  | 'magic-squares'
  | 'symbol-logic'
  | 'message-coding'
  | 'sorting-station'
  | 'precise-click'
  | 'fact-or-opinion'
  | 'tangram'
  | 'fireflies'

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

/**
 * Star rubric for activities the child cannot fail out of: every item is
 * retried until it is right, so a finished run always reports 100% and the
 * mistake count is the whole signal. Mirrors the shape of key-puzzle's rubric,
 * including the percentage fallback for a run that never reached the end.
 */
const retryRubric = ({ correct, total, mistakes }: ActivityResultInput): number => {
  if (correct < total) {
    const percent = (correct / total) * 100
    return percent >= 75 ? 2 : percent >= 40 ? 1 : 0
  }
  if (mistakes === 0) return 3
  if (mistakes <= Math.ceil(total / 4)) return 2
  return mistakes <= total ? 1 : 0
}

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
  // typing-keys: one key is shown at a time and the child finds it on the real
  // keyboard. Every level runs the same 12-target round; the level only decides
  // which set the targets are drawn from, so one ceiling covers them all.
  'typing-keys': {
    key: 'typing-keys',
    device: 'desktop',
    levels: [
      { id: 'starter',    maxTotal: 12, minDurationSec: 5 },
      { id: 'alphabet',   maxTotal: 12, minDurationSec: 5 },
      { id: 'digits',     maxTotal: 12, minDurationSec: 5 },
      { id: 'controls',   maxTotal: 12, minDurationSec: 5 },
      { id: 'everything', maxTotal: 12, minDurationSec: 5 },
    ],
    // The target stays until it is pressed correctly, so a finished run is
    // always 12/12 and only the mistake count carries information.
    stars: retryRubric,
  },
  // typing-words: the child types words or sentences character by character. A
  // wrong key does not advance the text, so a finished run is always complete
  // and the mistake count is the accuracy signal — but unlike the click games,
  // mistakes here are typos across dozens of characters, so the budget scales
  // with how much typing the level asked for.
  'typing-words': {
    key: 'typing-words',
    device: 'desktop',
    levels: [
      // 18 words per round; a sentence round is 5 items but far more typing.
      { id: 'words-easy',       maxTotal: 18, minDurationSec: 10 },
      { id: 'words-medium',     maxTotal: 18, minDurationSec: 12 },
      { id: 'words-hard',       maxTotal: 18, minDurationSec: 15 },
      { id: 'sentences-easy',   maxTotal: 5,  minDurationSec: 10 },
      { id: 'sentences-medium', maxTotal: 5,  minDurationSec: 12 },
      { id: 'sentences-hard',   maxTotal: 5,  minDurationSec: 15 },
    ],
    stars: ({ correct, total, mistakes }) => {
      if (correct < total) {
        const percent = (correct / total) * 100
        return percent >= 75 ? 2 : percent >= 40 ? 1 : 0
      }
      return mistakes <= total ? 3 : mistakes <= total * 3 ? 2 : 1
    },
  },
  // typing-sprint: one fixed minute of moving targets. `total` is however many
  // targets appeared during the run, so it varies per run — the ceiling is what
  // the shortest target and the fastest child could physically produce in a
  // minute, with headroom, because rejecting an honest result is worse.
  'typing-sprint': {
    key: 'typing-sprint',
    device: 'desktop',
    levels: [
      // Measured: a script hitting every single-key target lands ~240 in a
      // minute, so the ceilings sit above what a child could ever produce.
      { id: 'keys-easy',     maxTotal: 300, minDurationSec: 55 },
      { id: 'keys-medium',   maxTotal: 300, minDurationSec: 55 },
      { id: 'keys-hard',     maxTotal: 300, minDurationSec: 55 },
      { id: 'combos-easy',   maxTotal: 200, minDurationSec: 55 },
      { id: 'combos-medium', maxTotal: 200, minDurationSec: 55 },
      { id: 'combos-hard',   maxTotal: 200, minDurationSec: 55 },
      { id: 'words-easy',    maxTotal: 150, minDurationSec: 55 },
      { id: 'words-medium',  maxTotal: 150, minDurationSec: 55 },
      { id: 'words-hard',    maxTotal: 150, minDurationSec: 55 },
    ],
    // A target the child did not finish in time is a miss, so the hit ratio is
    // a genuine score here — the same rubric the other timed games use.
    stars: ({ correct, total }) => {
      const percent = (correct / total) * 100
      return percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0
    },
  },
  // typing-lessons: a series of typing lessons, worked through in order. A
  // class period rarely covers a whole series, so unlike every other activity
  // the unit here is characters, not items: `total` is the character count of
  // the series the teacher picked and `correct` is how many of them the child
  // typed. Reaching the end is not the point; typing accurately is.
  'typing-lessons': {
    key: 'typing-lessons',
    device: 'desktop',
    // Exact character counts of the four series (features/activities/
    // typing-lessons/typing-lessons-data.ts). typing-lessons-data.test.mjs
    // fails if the texts and these ceilings ever drift apart.
    levels: [
      { id: 'foundation-guided',      maxTotal: 993, minDurationSec: 5 },
      { id: 'foundation-finger',      maxTotal: 993, minDurationSec: 5 },
      { id: 'foundation-independent', maxTotal: 993, minDurationSec: 5 },
      { id: 'expansion-guided',       maxTotal: 936, minDurationSec: 5 },
      { id: 'expansion-finger',       maxTotal: 936, minDurationSec: 5 },
      { id: 'expansion-independent',  maxTotal: 936, minDurationSec: 5 },
      { id: 'alphabet-guided',        maxTotal: 789, minDurationSec: 5 },
      { id: 'alphabet-finger',        maxTotal: 789, minDurationSec: 5 },
      { id: 'alphabet-independent',   maxTotal: 789, minDurationSec: 5 },
      { id: 'texts-guided',           maxTotal: 588, minDurationSec: 5 },
      { id: 'texts-finger',           maxTotal: 588, minDurationSec: 5 },
      { id: 'texts-independent',      maxTotal: 588, minDurationSec: 5 },
    ],
    // Accuracy over the characters actually attempted, not progress through the
    // series: a child who typed two lessons cleanly deserves the same three
    // stars as one who raced through five with typos everywhere. The floor
    // stops a child who typed a handful of characters from collecting stars.
    stars: ({ correct, mistakes }) => {
      if (correct < 20) return correct > 0 ? 1 : 0
      const accuracy = (correct / (correct + mistakes)) * 100
      return accuracy >= 95 ? 3 : accuracy >= 85 ? 2 : accuracy >= 70 ? 1 : 0
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
  // magic-squares: three generated logic squares. The browser evaluates the
  // formative answers locally; the server only stores bounded classroom
  // evidence for the teacher dashboard.
  'magic-squares': {
    key: 'magic-squares',
    device: 'any',
    levels: [
      { id: 'easy',   maxTotal: 3, minDurationSec: 8 },
      { id: 'medium', maxTotal: 3, minDurationSec: 8 },
      { id: 'hard',   maxTotal: 3, minDurationSec: 8 },
    ],
    stars: ({ correct, total }) =>
      correct >= total ? 3 : correct >= 2 ? 2 : correct >= 1 ? 1 : 0,
  },
  // symbol-logic: five generated symbol equations per run.
  'symbol-logic': {
    key: 'symbol-logic',
    device: 'any',
    levels: [
      { id: 'easy',   maxTotal: 5, minDurationSec: 12 },
      { id: 'medium', maxTotal: 5, minDurationSec: 12 },
      { id: 'hard',   maxTotal: 5, minDurationSec: 12 },
    ],
    stars: ({ correct, total }) => {
      const percent = (correct / total) * 100
      return percent >= 90 ? 3 : percent >= 60 ? 2 : percent >= 40 ? 1 : 0
    },
  },
  // message-coding: five short representation-of-information tasks. The
  // browser owns local formative checking; the backend bounds the classroom
  // evidence and derives stars for the teacher dashboard.
  'message-coding': {
    key: 'message-coding',
    device: 'any',
    levels: [
      { id: 'easy',   maxTotal: 5, minDurationSec: 5 },
      { id: 'medium', maxTotal: 5, minDurationSec: 5 },
      { id: 'hard',   maxTotal: 5, minDurationSec: 5 },
    ],
    // Retry-until-correct, like sorting-station: the mistake count is the only
    // thing that separates one finished run from another.
    stars: retryRubric,
  },
  // sorting-station: two-axis classification with curated visuals. The server
  // accepts only plausible classroom evidence; local feedback remains formative.
  // Each level ships a different number of objects (8 / 10 / 12), so the
  // ceilings differ too — an easy run cannot claim a hard one's workload.
  'sorting-station': {
    key: 'sorting-station',
    device: 'any',
    levels: [
      { id: 'easy',   maxTotal: 8,  minDurationSec: 8 },
      { id: 'medium', maxTotal: 10, minDurationSec: 10 },
      { id: 'hard',   maxTotal: 12, minDurationSec: 12 },
    ],
    // The child retries an object until it lands in the right bin, so a
    // finished run is always 100% correct and only the mistake count carries
    // information — a percentage rubric here would hand out the same 2 stars
    // for 3 mistakes and for 30.
    stars: retryRubric,
  },
  'precise-click': {
    key: 'precise-click',
    device: 'desktop',
    levels: [{ id: 'session', maxTotal: 43, minDurationSec: 1 }],
    stars: ({ correct, total }) => {
      const percent = (correct / total) * 100
      return percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0
    },
  },
  'fact-or-opinion': {
    key: 'fact-or-opinion',
    device: 'any',
    levels: [{ id: 'session', maxTotal: 10, minDurationSec: 1 }],
    stars: ({ correct, total }) => {
      const percent = (correct / total) * 100
      return percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0
    },
  },
  tangram: {
    key: 'tangram',
    device: 'any',
    levels: [{ id: 'session', maxTotal: 21, minDurationSec: 1 }],
    stars: retryRubric,
  },
  fireflies: {
    key: 'fireflies',
    device: 'desktop',
    levels: [{ id: 'session', maxTotal: 30, minDurationSec: 1 }],
    stars: retryRubric,
  },
}

export const SCHOOL_ACTIVITY_KEYS = [
  'key-puzzle', 'typing-keys', 'typing-words', 'typing-sprint', 'typing-lessons',
  'maze', 'windows', 'mouse-buttons', 'magic-squares', 'symbol-logic',
  'message-coding', 'sorting-station', 'precise-click', 'fact-or-opinion', 'tangram', 'fireflies',
] as const satisfies readonly SchoolActivityKey[]

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
