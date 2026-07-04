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
}

export interface SortingLevel {
  instruction: string
  bins: SortingBin[]
  items: SortingItem[]
}

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
