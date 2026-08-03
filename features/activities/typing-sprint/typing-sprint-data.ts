// Targets for «Спринт»: one minute of moving targets. The teacher's level is a
// pair — what flies by (single keys, letter combos, whole words) and how hard
// the set is — so the ids are composite: `keys-easy`, `words-hard`, …
//
// Speed follows the difficulty instead of being a fourth control: in a lesson
// the teacher needs one decision, not three.

export type SprintMode = 'keys' | 'combos' | 'words'
export type Difficulty = 'easy' | 'medium' | 'hard'

/** How long a target takes to cross the field, before the mode factor. */
const TRAVEL_MS: Record<Difficulty, number> = { easy: 8500, medium: 6000, hard: 4200 }

/** Longer targets need proportionally more time in the air. */
const MODE_FACTOR: Record<SprintMode, number> = { keys: 1, combos: 1.25, words: 1.65 }

export const SPRINT_SECONDS = 60

const TARGETS: Record<SprintMode, Record<Difficulty, readonly string[]>> = {
  keys: {
    easy: Array.from('аоіентсрвл'),
    medium: Array.from('абвгдеєжзиіїйклмнопрстуфхцчшщьюя'),
    hard: Array.from('абвгґдеєжзиіїйклмнопрстуфхцчшщьюя1234567890'),
  },
  combos: {
    easy: [
      'ва', 'ла', 'на', 'ти', 'то', 'ра', 'ст', 'ко', 'по', 'ми', 'но', 'ро',
      'ді', 'ка', 'ло', 'ні', 'се', 'ту', 'ме', 'ви', 'да', 'за', 'мо', 'лі',
    ],
    medium: [
      'про', 'при', 'ний', 'ого', 'ати', 'ення', 'ість', 'ува', 'ере', 'ово', 'вся', 'ться',
      'ити', 'іль', 'ань', 'ове', 'ста', 'три', 'між', 'обі', 'іка', 'ель', 'юва', 'ерж',
    ],
    hard: [
      'під', 'над', 'роз', 'без', 'ств', 'ння', 'зап', 'ком', 'швид', 'клав', 'трен', 'друк',
      'ґан', 'ґро', 'вств', 'зькі', 'нськ', 'хвил', 'спів', 'зроз', 'пись', 'штов', 'джер', 'щедр',
    ],
  },
  words: {
    easy: [
      'мама', 'тато', 'вода', 'небо', 'мова', 'клас', 'урок', 'друг', 'сила', 'пісня',
      'сонце', 'земля', 'птах', 'риба', 'спорт', 'хата', 'поле', 'ріка', 'море', 'гора',
      'село', 'стіл', 'хліб', 'мрія', 'день', 'рука', 'зима', 'літо', 'сніг', 'казка',
    ],
    medium: [
      'школа', 'учень', 'зошит', 'квітка', 'дерево', 'кімната', 'учитель', 'олівець',
      'природа', 'музика', 'дівчина', 'малюнок', 'хлопець', 'вулиця', 'корова', 'дорога',
      'яблуко', 'година', 'робота', 'книжка', 'стежка', 'ведмідь', 'повітря', 'зупинка',
      'колесо', 'джерело', 'пшениця', 'веселка',
    ],
    hard: [
      'клавіатура', 'комп’ютер', 'підготовка', 'результати', 'знайомство', 'організація',
      'суспільство', 'продовжувати', 'ґрунтовний', 'математика', 'бібліотека', 'українська',
      'мандрівник', 'обчислення', 'повідомлення', 'користувач', 'несподіванка', 'дослідження',
      'розповідати', 'спостерігати',
    ],
  },
}

export interface SprintLevel {
  mode: SprintMode
  difficulty: Difficulty
  items: readonly string[]
  /** Milliseconds a target stays on the field at pace 1. */
  travelMs: number
}

/** `combos-medium` → that set and its timing. Unknown ids fall back to easy keys. */
export function resolveSprintLevel(level: string): SprintLevel {
  const [rawMode, rawDifficulty] = level.split('-')
  const mode: SprintMode = rawMode === 'combos' || rawMode === 'words' ? rawMode : 'keys'
  const difficulty: Difficulty = rawDifficulty === 'medium' || rawDifficulty === 'hard' ? rawDifficulty : 'easy'
  return {
    mode,
    difficulty,
    items: TARGETS[mode][difficulty],
    travelMs: Math.round(TRAVEL_MS[difficulty] * MODE_FACTOR[mode]),
  }
}

export const SPRINT_LEVEL_IDS = [
  'keys-easy', 'keys-medium', 'keys-hard',
  'combos-easy', 'combos-medium', 'combos-hard',
  'words-easy', 'words-medium', 'words-hard',
] as const
