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
  /** Short instruction shown above the child's activity stage. */
  hint: string
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
    hint: 'Перетягуй клавіші на їхні місця!',
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
    hint: 'Веди кульку до кубка і не торкайся стін.',
    device: 'any',
    // The board letterboxes into whatever space it gets, so a tablet works.
    minWidth: 360,
    levels: [
      { id: 'beginner', label: 'Початківець', description: '5 рівнів, широкі коридори, прощає один промах зірки' },
      { id: 'master',   label: 'Майстер',     description: '10 рівнів, вузькі проходи, треба зібрати всі зірки' },
    ],
    load: () => import('./maze/maze.js'),
  },
  {
    key: 'windows',
    label: 'Вікна програм',
    description: 'Дитина вчиться закривати, згортати й розгортати вікна програм.',
    hint: 'Виконуй дію на кожному вікні.',
    device: 'desktop',
    // A window is 420px wide and has to land somewhere on a desktop.
    minWidth: 900,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '10 вікон, 10 секунд на кожне' },
      { id: 'medium', label: 'Середньо', description: '15 вікон, 8 секунд на кожне' },
      { id: 'hard',   label: 'Складно',  description: '20 вікон, 6 секунд на кожне' },
    ],
    load: () => import('./windows/windows.js'),
  },
  {
    key: 'mouse-buttons',
    label: 'Ліва і права кнопки миші',
    description: 'Дитина керує швидкою: ліва кнопка миші — ліворуч, права — праворуч.',
    hint: 'Керуй швидкою лівою і правою кнопками миші.',
    device: 'desktop',
    // Needs a real mouse with two buttons, and room for three lanes.
    minWidth: 900,
    levels: [
      { id: 'beginner', label: 'Початківець', description: '75 секунд, спершу лише бонуси, щоб навчитись керувати' },
      { id: 'master',   label: 'Майстер',     description: '3 хвилини, швидше й густіше' },
    ],
    load: () => import('./mouse-buttons/mouse-buttons.js'),
  },
  {
    key: 'magic-squares',
    label: 'Магічні квадрати',
    description: 'Дитина розвʼязує три квадрати: з картинками або числами залежно від класу й рівня.',
    hint: 'Заповнюй пропуски за правилом квадрата.',
    device: 'any',
    minWidth: 360,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '3 завдання з меншою кількістю пропусків' },
      { id: 'medium', label: 'Середньо', description: '3 завдання з більшим полем або складнішими числами' },
      { id: 'hard',   label: 'Складно',  description: '3 завдання з найбільшою кількістю пропусків для цього класу' },
    ],
    load: () => import('./magic-squares/magic-squares.js'),
  },
  {
    key: 'symbol-logic',
    label: 'Символьна логіка',
    description: 'Дитина знаходить значення символів і розвʼязує пʼять коротких логічних прикладів.',
    hint: 'Починай із рядка, де два однакові символи.',
    device: 'any',
    minWidth: 360,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '5 завдань із малими числами та простими звʼязками' },
      { id: 'medium', label: 'Середньо', description: '5 завдань із більшою кількістю символів' },
      { id: 'hard',   label: 'Складно',  description: '5 завдань із більшими числами та кількома залежностями' },
    ],
    load: () => import('./symbol-logic/symbol-logic.js'),
  },
  {
    key: 'message-coding',
    label: 'Кодування повідомлень',
    description: 'Дитина кодує й розкодовує повідомлення: символи, числа, лампочки, пікселі або координати за класом.',
    hint: 'Звір повідомлення з кодом і обери правильний варіант.',
    device: 'any',
    minWidth: 360,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '5 коротких завдань з одним простим способом кодування' },
      { id: 'medium', label: 'Середньо', description: '5 завдань із довшими повідомленнями або новим видом подання' },
      { id: 'hard',   label: 'Складно',  description: '5 завдань, де порядок, двійкові коди чи координати треба читати уважніше' },
    ],
    load: () => import('./message-coding/message-coding.js'),
  },
  {
    key: 'sorting-station',
    label: 'Сортувальна станція',
    description: 'Дитина розкладає об’єкти за двома ознаками: форма+колір, живе+місце або роль пристрою+тип даних.',
    hint: 'Перевір дві ознаки одразу й натисни правильну комірку.',
    device: 'any',
    minWidth: 360,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '8 об’єктів, очевидні ознаки без пасток' },
      { id: 'medium', label: 'Середньо', description: '10 об’єктів, більше схожих варіантів і уважніше читання підписів' },
      { id: 'hard',   label: 'Складно',  description: '12 об’єктів або ситуацій, де рішення залежить від двох ознак' },
    ],
    load: () => import('./sorting-station/sorting-station.js'),
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
