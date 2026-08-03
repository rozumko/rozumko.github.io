import type { ActivityMount } from './activity-contract.js'

// ── Client-side activity registry ────────────────────────────────────────────
// Mirrors backend/src/lib/school-activities.ts: same keys, same level ids. The
// backend owns validation (it refuses anything not in its own registry); this
// side owns the Ukrainian labels and the lazy loader for the game module.
// registry.test.mjs fails the build if the two drift apart.

export type ActivityDevice = 'desktop' | 'any'

/**
 * Cards, not a dropdown: the teacher scans a grid of activities, so they need
 * a heading to scan under. Purely a presentation grouping — the backend knows
 * nothing about it.
 */
export type ActivityGroupId = 'input' | 'logic' | 'information'

export const ACTIVITY_GROUPS: readonly { id: ActivityGroupId; label: string }[] = [
  { id: 'input',       label: 'Клавіатура і миша' },
  { id: 'logic',       label: 'Логіка й мислення' },
  { id: 'information', label: 'Інформація та дані' },
]

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
  group: ActivityGroupId
  /** Font Awesome 5 class for the picker card, e.g. `fa-keyboard`. */
  icon: string
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
    group: 'input',
    icon: 'fa-keyboard',
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
    key: 'typing-keys',
    label: 'Знайди клавішу',
    description: 'Дитина шукає на клавіатурі показану клавішу — 12 завдань поспіль.',
    hint: 'Знайди на клавіатурі клавішу, яку показано на екрані.',
    device: 'desktop',
    group: 'input',
    icon: 'fa-i-cursor',
    // The full keyboard is ~940px wide; below that the keycaps stop being
    // readable for a child sitting at a school monitor.
    minWidth: 900,
    levels: [
      { id: 'starter',    label: 'Перші літери',     description: '10 найчастіших українських літер' },
      { id: 'alphabet',   label: 'Уся абетка',       description: 'Абетка без «ґ» — вона потребує комбінації клавіш' },
      { id: 'digits',     label: 'Цифри',            description: 'Цифри верхнього ряду' },
      { id: 'controls',   label: 'Важливі клавіші',  description: 'Пробіл, Enter, Backspace, Shift, Ctrl і Alt' },
      { id: 'everything', label: 'Усе разом',        description: 'Літери, цифри та важливі клавіші в одному раунді' },
    ],
    load: () => import('./typing-keys/typing-keys.js'),
  },
  {
    key: 'typing-words',
    label: 'Друкуй слова',
    description: 'Дитина друкує слова або речення по літері — клавіатура підсвічує наступну клавішу.',
    hint: 'Друкуй текст по літері. Наступна клавіша світиться на клавіатурі.',
    device: 'desktop',
    group: 'input',
    icon: 'fa-font',
    minWidth: 900,
    levels: [
      { id: 'words-easy',       label: 'Короткі слова',   description: '18 слів до 5 літер' },
      { id: 'words-medium',     label: 'Середні слова',   description: '18 слів на 6–8 літер' },
      { id: 'words-hard',       label: 'Довгі слова',     description: '18 слів від 9 літер' },
      { id: 'sentences-easy',   label: 'Прості речення',  description: '5 коротких речень із великої літери й з крапкою' },
      { id: 'sentences-medium', label: 'Середні речення', description: '5 довших речень зі знаками' },
      { id: 'sentences-hard',   label: 'Складні речення', description: '5 найдовших речень із комами та двокрапкою' },
    ],
    load: () => import('./typing-words/typing-words.js'),
  },
  {
    key: 'typing-sprint',
    label: 'Спринт: устигни надрукувати',
    description: 'Хвилина на швидкість: дитина друкує ціль, доки та рухається полем.',
    hint: 'Надрукуй ціль, поки вона не втекла з поля.',
    device: 'desktop',
    group: 'input',
    icon: 'fa-bolt',
    minWidth: 900,
    levels: [
      { id: 'keys-easy',     label: 'Клавіші · легко',      description: 'Одна літера з десяти найчастіших, повільний рух' },
      { id: 'keys-medium',   label: 'Клавіші · звичайно',   description: 'Одна літера з усієї абетки, середній рух' },
      { id: 'keys-hard',     label: 'Клавіші · складно',    description: 'Літери й цифри, швидкий рух' },
      { id: 'combos-easy',   label: 'Сполучення · легко',   description: 'Двобуквені сполучення, повільний рух' },
      { id: 'combos-medium', label: 'Сполучення · звичайно', description: 'Часті трибуквені сполучення, середній рух' },
      { id: 'combos-hard',   label: 'Сполучення · складно', description: 'Довгі сполучення приголосних, швидкий рух' },
      { id: 'words-easy',    label: 'Слова · легко',        description: 'Короткі слова, повільний рух' },
      { id: 'words-medium',  label: 'Слова · звичайно',     description: 'Слова на 6–8 літер, середній рух' },
      { id: 'words-hard',    label: 'Слова · складно',      description: 'Довгі слова, швидкий рух' },
    ],
    load: () => import('./typing-sprint/typing-sprint.js'),
  },
  {
    key: 'maze',
    label: 'Чарівний лабіринт',
    description: 'Дитина веде кульку лабіринтом до кубка, не торкаючись стін, і збирає зірки.',
    hint: 'Веди кульку до кубка і не торкайся стін.',
    device: 'any',
    group: 'input',
    icon: 'fa-route',
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
    group: 'input',
    icon: 'fa-window-restore',
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
    group: 'input',
    icon: 'fa-mouse',
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
    group: 'logic',
    icon: 'fa-th',
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
    group: 'logic',
    icon: 'fa-calculator',
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
    description: 'Дитина розкодовує повідомлення: символи, числа, лампочки, пікселі та прості шифри за класом.',
    hint: 'Знайди правило в легенді чи прикладах і обери правильний варіант.',
    device: 'any',
    group: 'information',
    icon: 'fa-barcode',
    minWidth: 360,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '5 коротких завдань з одним простим способом кодування' },
      { id: 'medium', label: 'Середньо', description: '5 завдань із довшими повідомленнями або новим видом подання' },
      { id: 'hard',   label: 'Складно',  description: '5 завдань, де порядок, двійкові коди чи шифри треба читати уважніше' },
    ],
    load: () => import('./message-coding/message-coding.js'),
  },
  {
    key: 'sorting-station',
    label: 'Сортувальна станція',
    description: 'Дитина розкладає об’єкти за двома ознаками: форма+колір, живе+місце або роль пристрою+тип даних.',
    hint: 'Перевір дві ознаки одразу й натисни правильну комірку.',
    device: 'any',
    group: 'information',
    icon: 'fa-boxes',
    minWidth: 360,
    levels: [
      { id: 'easy',   label: 'Легко',    description: '8 об’єктів, очевидні ознаки без пасток' },
      { id: 'medium', label: 'Середньо', description: '10 об’єктів, більше схожих варіантів і уважніше читання підписів' },
      { id: 'hard',   label: 'Складно',  description: '12 об’єктів або ситуацій, де рішення залежить від двох ознак' },
    ],
    load: () => import('./sorting-station/sorting-station.js'),
  },
  {
    key: 'precise-click',
    label: 'Точний клік',
    description: 'Дитина тренує точність і швидкість: знаходить підсвічену клітинку та натискає її у трьох послідовних етапах.',
    hint: 'Знайди підсвічену клітинку й натисни її. Пройди всі три етапи!',
    device: 'desktop',
    group: 'input',
    icon: 'fa-crosshairs',
    minWidth: 760,
    levels: [
      { id: 'session', label: 'Повна сесія', description: 'Три етапи від спокійного до швидкого в одній грі' },
    ],
    load: () => import('./precise-click/precise-click.js'),
  },
  {
    key: 'fact-or-opinion',
    label: 'Факт чи думка',
    description: 'Дитина читає десять тверджень і визначає, де перевірюваний факт, а де особиста думка.',
    hint: 'Прочитай твердження й обери: це факт чи думка?',
    device: 'any',
    group: 'information',
    icon: 'fa-balance-scale',
    minWidth: 360,
    levels: [
      { id: 'session', label: 'За класом', description: 'Твердження автоматично добираються відповідно до вибраного класу' },
    ],
    load: () => import('./fact-or-opinion/fact-or-opinion.js'),
  },
  {
    key: 'tangram',
    label: 'Танграм: заповни силует',
    description: 'Дитина заповнює три силуети сімома геометричними деталями, пересуваючи, повертаючи й віддзеркалюючи їх.',
    hint: 'Перетягуй деталі на силует. Вибрану деталь можна повертати кнопками.',
    device: 'any',
    group: 'logic',
    icon: 'fa-shapes',
    minWidth: 360,
    levels: [
      { id: 'session', label: 'За класом', description: 'Підказки та початкові орієнтації деталей залежать від класу' },
    ],
    load: () => import('./tangram/tangram.js'),
  },
  {
    key: 'fireflies',
    label: 'Світлячки',
    description: 'Дитина тренує перетягування мишкою: переносить 30 різнокольорових світлячків у банку.',
    hint: 'Затисни світлячка кнопкою миші, перетягни до банки й відпусти.',
    device: 'desktop',
    group: 'input',
    icon: 'fa-bug',
    minWidth: 760,
    levels: [
      { id: 'session', label: '30 світлячків', description: 'Одна сесія з 30 перетягувань у цільову зону' },
    ],
    load: () => import('./fireflies/fireflies.js'),
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
