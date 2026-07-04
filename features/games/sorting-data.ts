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

export const SORTING_ATTRIBUTES_LEVELS: SortingLevel[] = [
  {
    instruction: 'Що можна їсти?',
    bins: [
      { id: 'eat',    label: '😋 Їстівне' },
      { id: 'no-eat', label: '🚫 Неїстівне' },
    ],
    items: [
      { emoji: '🍕', bin: 'eat' }, { emoji: '🎩', bin: 'no-eat' },
      { emoji: '🍓', bin: 'eat' }, { emoji: '🧱', bin: 'no-eat' },
      { emoji: '🧀', bin: 'eat' }, { emoji: '⏰', bin: 'no-eat' },
      { emoji: '🍎', bin: 'eat' }, { emoji: '⚽', bin: 'no-eat' },
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
      { emoji: '🚁', bin: 'air' }, { emoji: '🚢', bin: 'water' }, { emoji: '🚌', bin: 'land' },
      { emoji: '🚀', bin: 'air' }, { emoji: '⛵', bin: 'water' }, { emoji: '🚲', bin: 'land' },
      { emoji: '🚤', bin: 'water' }, { emoji: '🚂', bin: 'land' }, { emoji: '🦅', bin: 'air' },
    ],
  },
  {
    instruction: 'Яка це форма?',
    bins: [
      { id: 'circle', label: '⭕ Кругле' },
      { id: 'square', label: '🟥 Кутасте' },
    ],
    items: [
      { emoji: '⚽', bin: 'circle' }, { emoji: '📺', bin: 'square' },
      { emoji: '🌕', bin: 'circle' }, { emoji: '🖼️', bin: 'square' },
      { emoji: '🍕', bin: 'circle' }, { emoji: '🧊', bin: 'square' },
    ],
  },
  {
    instruction: 'Велике чи маленьке?',
    bins: [
      { id: 'big',   label: '🐘 Велике' },
      { id: 'small', label: '🐭 Маленьке' },
    ],
    items: [
      { emoji: '🐋', bin: 'big' }, { emoji: '🐜', bin: 'small' },
      { emoji: '🏠', bin: 'big' }, { emoji: '📌', bin: 'small' },
      { emoji: '🚌', bin: 'big' }, { emoji: '🍬', bin: 'small' },
    ],
  },
  {
    instruction: 'Швидке чи повільне?',
    bins: [
      { id: 'fast', label: '⚡ Швидке' },
      { id: 'slow', label: '🐌 Повільне' },
    ],
    items: [
      { emoji: '🐆', bin: 'fast' }, { emoji: '🐢', bin: 'slow' },
      { emoji: '🏎️', bin: 'fast' }, { emoji: '🚜', bin: 'slow' },
      { emoji: '🚀', bin: 'fast' }, { emoji: '🦥', bin: 'slow' },
    ],
  },
]
