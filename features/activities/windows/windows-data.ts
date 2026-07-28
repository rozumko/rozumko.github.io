// Content for «Вікна програм»: the fake applications whose windows the child
// operates, and the three window actions being drilled.
//
// The standalone game used English product names (TextEditor Pro, Browser X)
// and Font Awesome icons. Both are replaced here: the names are Ukrainian so a
// first-grader can read them, and the icons are emoji so the activity carries
// no icon-font dependency.

export interface WindowApp {
  name: string
  icon: string
  color: string
}

// The app colour is used twice against near-white: white text on the title bar
// and the task instruction below it. Every value must therefore clear WCAG AA
// (4.5:1) on its own — the green, orange and teal here used to sit at 3.3–3.7,
// which made the very sentence telling the child what to do the hardest thing
// on screen to read. Pinned by windows-data.test.mjs.
export const WINDOW_APPS: readonly WindowApp[] = [
  { name: 'Текстовий редактор', icon: '📝', color: '#15803d' },
  { name: 'Калькулятор',        icon: '🧮', color: '#2563eb' },
  { name: 'Перегляд фото',      icon: '🖼️', color: '#c2410c' },
  { name: 'Музичний плеєр',     icon: '🎵', color: '#db2777' },
  { name: 'Провідник файлів',   icon: '📁', color: '#475569' },
  { name: 'Браузер',            icon: '🌐', color: '#0f766e' },
  { name: 'Пошта',              icon: '✉️', color: '#4338ca' },
  { name: 'Відеоплеєр',         icon: '🎬', color: '#dc2626' },
  { name: 'Малювалка',          icon: '🎨', color: '#9333ea' },
]

export type WindowTaskId = 'close' | 'minimize' | 'maximize'

export interface WindowTask {
  id: WindowTaskId
  /** What the child is asked to do, shown inside the window. */
  prompt: string
  /** Label of the matching title-bar control. */
  control: string
  icon: string
}

export const WINDOW_TASKS: readonly WindowTask[] = [
  { id: 'minimize', prompt: 'Згорни це вікно',   control: 'Згорнути',  icon: '➖' },
  { id: 'maximize', prompt: 'Розгорни це вікно', control: 'Розгорнути', icon: '⬜' },
  { id: 'close',    prompt: 'Закрий це вікно',   control: 'Закрити',   icon: '✕' },
]

export interface WindowsLevel {
  id: string
  label: string
  /** How many windows the child handles before the run ends. */
  taskCount: number
  /** Time allowed per window. */
  timeLimitMs: number
}

// The standalone game ran forever and sped itself up every five correct
// answers. A lesson activity has to end, so the teacher's level fixes both how
// many windows come and how long each one waits.
export const WINDOWS_LEVELS: Record<string, WindowsLevel> = {
  easy:   { id: 'easy',   label: 'Легко',    taskCount: 10, timeLimitMs: 10_000 },
  medium: { id: 'medium', label: 'Середньо', taskCount: 15, timeLimitMs: 8_000 },
  hard:   { id: 'hard',   label: 'Складно',  taskCount: 20, timeLimitMs: 6_000 },
}

export function windowsLevel(id: string): WindowsLevel | null {
  return Object.prototype.hasOwnProperty.call(WINDOWS_LEVELS, id) ? WINDOWS_LEVELS[id]! : null
}
