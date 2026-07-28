import type { ActivityMount } from './activity-contract.js'

// ── Client-side activity registry ────────────────────────────────────────────
// Mirrors backend/src/lib/school-activities.ts: same keys, same level ids. The
// backend owns validation (it refuses anything not in its own registry); this
// side owns the Ukrainian labels and the lazy loader for the game module.
// registry.test.mjs fails the build if the two drift apart.

export type ActivityDevice = 'desktop' | 'any'

export interface ActivityLevelInfo {
  id: string
  label: string
  description: string
}

export interface ActivityInfo {
  key: string
  label: string
  /** One line for the teacher's picker. */
  description: string
  device: ActivityDevice
  /**
   * Below this viewport width the activity is not playable. School Mode targets
   * computer labs; a phone gets an honest "open this on a computer" screen
   * instead of a broken layout.
   */
  minWidth: number
  levels: readonly ActivityLevelInfo[]
  load: () => Promise<{ mount: ActivityMount }>
}

export const ACTIVITIES: readonly ActivityInfo[] = [
  {
    key: 'key-puzzle',
    label: 'Клавіатурний пазл',
    description: 'Дитина збирає клавіатуру: перетягує літери на їхні місця.',
    device: 'desktop',
    // The full keyboard row is ~940px wide plus the scatter zones around it.
    minWidth: 1024,
    levels: [
      { id: 'easy',   label: 'Легко',    description: 'На порожніх місцях видно підказку — яка клавіша туди йде' },
      { id: 'medium', label: 'Середньо', description: 'Підказка з’являється лише коли клавіша над місцем' },
      { id: 'hard',   label: 'Складно',  description: 'Жодних підказок — треба знати клавіатуру' },
    ],
    load: () => import('./key-puzzle/key-puzzle.js'),
  },
  {
    key: 'maze',
    label: 'Чарівний лабіринт',
    description: 'Дитина веде кульку лабіринтом до кубка, не торкаючись стін, і збирає зірки.',
    device: 'any',
    // The board letterboxes into whatever space it gets, so a tablet works.
    minWidth: 360,
    levels: [
      { id: 'beginner', label: 'Початківець', description: '5 рівнів, широкі коридори, прощає один промах зірки' },
      { id: 'master',   label: 'Майстер',     description: '10 рівнів, вузькі проходи, треба зібрати всі зірки' },
    ],
    load: () => import('./maze/maze.js'),
  },
]

export function findActivity(key: string | null | undefined): ActivityInfo | null {
  if (!key) return null
  return ACTIVITIES.find(a => a.key === key) ?? null
}

export function findActivityLevel(activity: ActivityInfo, level: string | null | undefined): ActivityLevelInfo | null {
  if (!level) return null
  return activity.levels.find(l => l.id === level) ?? null
}

/** Human label for the teacher's list and the child's intro screen. */
export function activityLabel(key: string | null | undefined): string {
  return findActivity(key)?.label ?? 'Активність'
}

export function activityLevelLabel(key: string | null | undefined, level: string | null | undefined): string {
  const activity = findActivity(key)
  if (!activity) return ''
  return findActivityLevel(activity, level)?.label ?? ''
}
