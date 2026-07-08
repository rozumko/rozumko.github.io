// Дані гри «Розумне сортування» (класифікація за ознакою).
// Джерело вмісту: temp/abc_sort.html. Реєстр: місія game-sorting-attributes-grade1
// (kind=sorting-game, config у БД дублює ці рівні — джерело правди для адмінки).

export interface SortingBin {
  id: string
  label: string
}

export interface SortingItem {
  emoji: string
  bin: string
  /** Підпис під емодзі — для ігор, де сам предмет неочевидний (ІнфоСорт). */
  label?: string
}

export interface SortingLevel {
  instruction: string
  bins: SortingBin[]
  items: SortingItem[]
}

// «ІнфоСорт» — сортування інформації (джерело вмісту: temp/infosort.html,
// FontAwesome-іконки замінені на емодзі). Track: informatics, topic: information.
export const INFO_SORT_LEVELS: SortingLevel[] = [
  {
    instruction: 'Яким органом чуття ми це сприймаємо?',
    bins: [
      { id: 'eye',   label: '👀 Очі' },
      { id: 'ear',   label: '👂 Вуха' },
      { id: 'nose',  label: '👃 Ніс' },
      { id: 'mouth', label: '👅 Язик' },
      { id: 'skin',  label: '✋ Шкіра' },
    ],
    items: [
      { emoji: '🌈', label: 'Веселка',        bin: 'eye' },
      { emoji: '🚦', label: 'Світлофор',      bin: 'eye' },
      { emoji: '🖼️', label: 'Картина',        bin: 'eye' },
      { emoji: '🔔', label: 'Дзвінок',        bin: 'ear' },
      { emoji: '🐕', label: 'Гавкіт собаки',  bin: 'ear' },
      { emoji: '🎵', label: 'Музика',         bin: 'ear' },
      { emoji: '🧴', label: 'Парфуми',        bin: 'nose' },
      { emoji: '🍞', label: 'Свіжий хліб',    bin: 'nose' },
      { emoji: '🍬', label: 'Цукерка',        bin: 'mouth' },
      { emoji: '🍋', label: 'Лимон',          bin: 'mouth' },
      { emoji: '🧊', label: 'Лід',            bin: 'skin' },
      { emoji: '🐱', label: "М'яке хутро",    bin: 'skin' },
    ],
  },
  {
    instruction: 'У якій формі подана інформація?',
    bins: [
      { id: 'text',    label: '🔤 Текст' },
      { id: 'graphic', label: '🖼️ Зображення' },
      { id: 'numeric', label: '🔢 Числа' },
      { id: 'sound',   label: '🔊 Звук' },
    ],
    items: [
      { emoji: '📖', label: 'Казка у книзі',    bin: 'text' },
      { emoji: '🚪', label: 'Напис на дверях',  bin: 'text' },
      { emoji: '🅰️', label: 'Буква А',          bin: 'text' },
      { emoji: '📷', label: 'Фотографія',       bin: 'graphic' },
      { emoji: '🚸', label: 'Дорожній знак',    bin: 'graphic' },
      { emoji: '🎨', label: 'Малюнок',          bin: 'graphic' },
      { emoji: '5️⃣', label: 'Число 5',          bin: 'numeric' },
      { emoji: '🏷️', label: 'Ціна 10 грн',      bin: 'numeric' },
      { emoji: '🏠', label: 'Номер будинку 15', bin: 'numeric' },
      { emoji: '🎵', label: 'Пісня',            bin: 'sound' },
      { emoji: '⏰', label: 'Сигнал будильника', bin: 'sound' },
      { emoji: '🗣️', label: 'Голос учителя',    bin: 'sound' },
    ],
  },
]

// «Мульти-Сортування» (джерело: temp/sort.html). Родзинка механіки: той самий
// предмет має кілька ознак і в різних рівнях потрапляє в різні кошики. Це
// тренує абстрагування — вибір ознаки, яка зараз важлива. Кошики = теги;
// правильний кошик предмета обчислюється зіставленням його тегів із тегами рівня.
const MULTISORT_DB: Record<string, { emoji: string; label: string; tags: string[] }> = {
  apple:     { emoji: '🍎', label: 'Яблуко',     tags: ['red', 'food', 'round', 'nature'] },
  chili:     { emoji: '🌶️', label: 'Перець',     tags: ['red', 'food', 'nature'] },
  firetruck: { emoji: '🚒', label: 'Пожежна',    tags: ['red', 'machine'] },
  balloon:   { emoji: '🎈', label: 'Кулька',     tags: ['red', 'round'] },
  banana:    { emoji: '🍌', label: 'Банан',      tags: ['yellow', 'food', 'nature'] },
  lemon:     { emoji: '🍋', label: 'Лимон',      tags: ['yellow', 'food', 'round', 'nature'] },
  cheese:    { emoji: '🧀', label: 'Сир',        tags: ['yellow', 'food'] },
  leaf:      { emoji: '🍃', label: 'Листок',     tags: ['green', 'nature'] },
  broccoli:  { emoji: '🥦', label: 'Броколі',    tags: ['green', 'food', 'nature'] },
  frog:      { emoji: '🐸', label: 'Жаба',       tags: ['green', 'animal', 'nature'] },
  turtle:    { emoji: '🐢', label: 'Черепаха',   tags: ['green', 'animal'] },
  sun:       { emoji: '☀️', label: 'Сонце',      tags: ['yellow', 'nature', 'round'] },
  water:     { emoji: '💧', label: 'Крапля',     tags: ['blue', 'nature'] },
  whale:     { emoji: '🐋', label: 'Кит',        tags: ['blue', 'animal'] },
  jeans:     { emoji: '👖', label: 'Джинси',     tags: ['blue', 'clothing'] },
  car:       { emoji: '🚗', label: 'Авто',       tags: ['red', 'machine'] },
  plane:     { emoji: '✈️', label: 'Літак',      tags: ['machine'] },
  cat:       { emoji: '🐱', label: 'Кіт',        tags: ['animal'] },
  dog:       { emoji: '🐕', label: 'Пес',        tags: ['animal'] },
  donut:     { emoji: '🍩', label: 'Пончик',     tags: ['food', 'round'] },
  clock:     { emoji: '⏰', label: 'Годинник',   tags: ['round', 'machine'] },
  shirt:     { emoji: '👕', label: 'Футболка',   tags: ['clothing'] },
  socks:     { emoji: '🧦', label: 'Шкарпетки',  tags: ['clothing', 'red'] },
}

interface MultiSortLevelDef {
  instruction: string
  bins: SortingBin[]     // bin.id має збігатися з тегом у MULTISORT_DB
  pool: string[]         // ключі MULTISORT_DB
}

/** Розв'язує теги предметів у конкретні кошики рівня. Кидає, якщо предмет
 *  не підходить рівно до одного кошика — захист від помилок у даних. */
function buildMultiSort(defs: MultiSortLevelDef[]): SortingLevel[] {
  return defs.map(def => {
    const binIds = def.bins.map(b => b.id)
    const items: SortingItem[] = def.pool.map(key => {
      const entry = MULTISORT_DB[key]
      if (!entry) throw new Error(`MULTISORT_DB: немає предмета «${key}»`)
      const matches = entry.tags.filter(t => binIds.includes(t))
      if (matches.length !== 1) {
        throw new Error(`«${key}» підходить до ${matches.length} кошиків рівня «${def.instruction}» (очікувався 1)`)
      }
      return { emoji: entry.emoji, label: entry.label, bin: matches[0] }
    })
    return { instruction: def.instruction, bins: def.bins, items }
  })
}

export const MULTISORT_LEVELS: SortingLevel[] = buildMultiSort([
  {
    instruction: 'Спочатку — за кольором',
    bins: [
      { id: 'red',   label: '🔴 Червоне' },
      { id: 'green', label: '🟢 Зелене' },
    ],
    pool: ['apple', 'chili', 'firetruck', 'balloon', 'leaf', 'broccoli', 'frog', 'turtle', 'car', 'socks'],
  },
  {
    instruction: 'Ті самі речі — тепер їжа чи тварини?',
    bins: [
      { id: 'food',   label: '🍔 Їжа' },
      { id: 'animal', label: '🐾 Тварини' },
    ],
    pool: ['apple', 'banana', 'cheese', 'donut', 'cat', 'dog', 'whale', 'frog', 'broccoli', 'lemon'],
  },
  {
    instruction: 'А тепер — природа, техніка чи одяг?',
    bins: [
      { id: 'nature',   label: '🌿 Природа' },
      { id: 'machine',  label: '⚙️ Техніка' },
      { id: 'clothing', label: '👕 Одяг' },
    ],
    pool: ['leaf', 'sun', 'water', 'frog', 'car', 'clock', 'plane', 'jeans', 'firetruck', 'shirt', 'socks'],
  },
])

export const SORTING_ATTRIBUTES_LEVELS: SortingLevel[] = [
  {
    instruction: 'Що можна їсти?',
    bins: [
      { id: 'eat',    label: '😋 Їстівне' },
      { id: 'no-eat', label: '🚫 Неїстівне' },
    ],
    items: [
      { emoji: '🍕', label: 'Піца', bin: 'eat' }, { emoji: '🎩', label: 'Капелюх', bin: 'no-eat' },
      { emoji: '🍓', label: 'Полуниця', bin: 'eat' }, { emoji: '🧱', label: 'Цеглина', bin: 'no-eat' },
      { emoji: '🧀', label: 'Сир', bin: 'eat' }, { emoji: '⏰', label: 'Будильник', bin: 'no-eat' },
      { emoji: '🍎', label: 'Яблуко', bin: 'eat' }, { emoji: '⚽', label: 'Мʼяч', bin: 'no-eat' },
    ],
  },
  {
    instruction: 'Який це транспорт?',
    bins: [
      { id: 'air',   label: '✈️ Повітря' },
      { id: 'water', label: '⛵ Вода' },
      { id: 'land',  label: '🚗 Земля' },
    ],
    items: [
      { emoji: '🚁', label: 'Гелікоптер', bin: 'air' }, { emoji: '🚢', label: 'Корабель', bin: 'water' }, { emoji: '🚌', label: 'Автобус', bin: 'land' },
      { emoji: '🚀', label: 'Ракета', bin: 'air' }, { emoji: '⛵', label: 'Вітрильник', bin: 'water' }, { emoji: '🚲', label: 'Велосипед', bin: 'land' },
      { emoji: '🚤', label: 'Катер', bin: 'water' }, { emoji: '🚂', label: 'Потяг', bin: 'land' }, { emoji: '🦅', label: 'Орел', bin: 'air' },
    ],
  },
  {
    instruction: 'Яка це форма?',
    bins: [
      { id: 'circle', label: '⭕ Кругле' },
      { id: 'square', label: '🟥 Кутасте' },
    ],
    items: [
      { emoji: '⚽', label: 'Мʼяч', bin: 'circle' }, { emoji: '📺', label: 'Телевізор', bin: 'square' },
      { emoji: '🌕', label: 'Місяць', bin: 'circle' }, { emoji: '🖼️', label: 'Картина', bin: 'square' },
      { emoji: '🍕', label: 'Піца', bin: 'circle' }, { emoji: '🧊', label: 'Кубик льоду', bin: 'square' },
    ],
  },
  {
    instruction: 'Велике чи маленьке?',
    bins: [
      { id: 'big',   label: '🐘 Велике' },
      { id: 'small', label: '🐭 Маленьке' },
    ],
    items: [
      { emoji: '🐋', label: 'Кит', bin: 'big' }, { emoji: '🐜', label: 'Мураха', bin: 'small' },
      { emoji: '🏠', label: 'Будинок', bin: 'big' }, { emoji: '📌', label: 'Кнопка', bin: 'small' },
      { emoji: '🚌', label: 'Автобус', bin: 'big' }, { emoji: '🍬', label: 'Цукерка', bin: 'small' },
    ],
  },
  {
    instruction: 'Швидке чи повільне?',
    bins: [
      { id: 'fast', label: '⚡ Швидке' },
      { id: 'slow', label: '🐌 Повільне' },
    ],
    items: [
      { emoji: '🐆', label: 'Гепард', bin: 'fast' }, { emoji: '🐢', label: 'Черепаха', bin: 'slow' },
      { emoji: '🏎️', label: 'Гоночне авто', bin: 'fast' }, { emoji: '🚜', label: 'Трактор', bin: 'slow' },
      { emoji: '🚀', label: 'Ракета', bin: 'fast' }, { emoji: '🦥', label: 'Лінивець', bin: 'slow' },
    ],
  },
]
