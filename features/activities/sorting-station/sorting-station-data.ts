export type SortingStationDifficulty = 'easy' | 'medium' | 'hard'
export type SortingStationAxisId = 'color' | 'shape' | 'life' | 'place' | 'role' | 'data'

export interface SortingStationValue {
  id: string
  label: string
}

export interface SortingStationAxis {
  id: SortingStationAxisId
  label: string
  values: readonly SortingStationValue[]
}

export type SortingStationVisual =
  | { kind: 'shape'; shape: 'circle' | 'square' | 'triangle' | 'diamond'; color: 'red' | 'blue' | 'green' | 'yellow' }
  | { kind: 'emoji'; emoji: string }

export interface SortingStationItem {
  id: string
  label: string
  visual: SortingStationVisual
  traits: Record<string, string>
}

export interface SortingStationSet {
  title: string
  instruction: string
  axes: readonly [SortingStationAxis, SortingStationAxis]
  items: readonly SortingStationItem[]
}

export const SORTING_STATION_BANNED_EMOJI = ['🍕', '🍰', '🍉', '🧀', '📐', '🪁'] as const

function normalizeGrade(grade: number): 1 | 2 | 3 | 4 {
  return grade === 2 || grade === 3 || grade === 4 ? grade : 1
}

function normalizeDifficulty(difficulty: string | null | undefined): SortingStationDifficulty {
  return difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy'
}

const colorAxis: SortingStationAxis = {
  id: 'color',
  label: 'Колір',
  values: [
    { id: 'red', label: 'червоне' },
    { id: 'blue', label: 'синє' },
  ],
}

const colorAxisHard: SortingStationAxis = {
  id: 'color',
  label: 'Колір',
  values: [
    { id: 'red', label: 'червоне' },
    { id: 'blue', label: 'синє' },
    { id: 'green', label: 'зелене' },
  ],
}

const shapeAxis: SortingStationAxis = {
  id: 'shape',
  label: 'Форма',
  values: [
    { id: 'circle', label: 'кругле' },
    { id: 'square', label: 'кутасте' },
  ],
}

const shapeAxisHard: SortingStationAxis = {
  id: 'shape',
  label: 'Форма',
  values: [
    { id: 'circle', label: 'кругле' },
    { id: 'square', label: 'квадрат' },
    { id: 'triangle', label: 'трикутник' },
  ],
}

const lifeAxis: SortingStationAxis = {
  id: 'life',
  label: 'Ознака',
  values: [
    { id: 'living', label: 'живе' },
    { id: 'nonliving', label: 'неживе' },
  ],
}

const placeAxis: SortingStationAxis = {
  id: 'place',
  label: 'Де використовується або зустрічається',
  values: [
    { id: 'home', label: 'дім' },
    { id: 'school', label: 'школа' },
  ],
}

const placeAxisHard: SortingStationAxis = {
  id: 'place',
  label: 'Де використовується або зустрічається',
  values: [
    { id: 'home', label: 'дім' },
    { id: 'school', label: 'школа' },
    { id: 'nature', label: 'природа' },
  ],
}

const roleAxis: SortingStationAxis = {
  id: 'role',
  label: 'Роль пристрою',
  values: [
    { id: 'input', label: 'введення' },
    { id: 'output', label: 'виведення' },
  ],
}

const dataAxis: SortingStationAxis = {
  id: 'data',
  label: 'Тип даних',
  values: [
    { id: 'text', label: 'текст' },
    { id: 'image', label: 'зображення' },
    { id: 'sound', label: 'звук' },
  ],
}

function shapeItem(
  id: string,
  shape: SortingStationVisual & { kind: 'shape' },
): SortingStationItem {
  return {
    id,
    label: `${shape.color} ${shape.shape}`,
    visual: shape,
    traits: { color: shape.color, shape: shape.shape === 'diamond' ? 'square' : shape.shape },
  }
}

function emojiItem(
  id: string,
  emoji: string,
  label: string,
  traits: Record<string, string>,
): SortingStationItem {
  return { id, label, visual: { kind: 'emoji', emoji }, traits }
}

function gradeOne(difficulty: SortingStationDifficulty): SortingStationSet {
  if (difficulty === 'hard') {
    return {
      title: 'Фігури на станції',
      instruction: 'Визнач одночасно колір і форму. Це не емодзі, а стабільні фігури.',
      axes: [colorAxisHard, shapeAxisHard],
      items: [
        shapeItem('g1h-red-circle-1', { kind: 'shape', color: 'red', shape: 'circle' }),
        shapeItem('g1h-red-square-1', { kind: 'shape', color: 'red', shape: 'square' }),
        shapeItem('g1h-red-triangle-1', { kind: 'shape', color: 'red', shape: 'triangle' }),
        shapeItem('g1h-blue-circle-1', { kind: 'shape', color: 'blue', shape: 'circle' }),
        shapeItem('g1h-blue-square-1', { kind: 'shape', color: 'blue', shape: 'diamond' }),
        shapeItem('g1h-blue-triangle-1', { kind: 'shape', color: 'blue', shape: 'triangle' }),
        shapeItem('g1h-green-circle-1', { kind: 'shape', color: 'green', shape: 'circle' }),
        shapeItem('g1h-green-square-1', { kind: 'shape', color: 'green', shape: 'square' }),
        shapeItem('g1h-green-triangle-1', { kind: 'shape', color: 'green', shape: 'triangle' }),
        shapeItem('g1h-red-circle-2', { kind: 'shape', color: 'red', shape: 'circle' }),
        shapeItem('g1h-blue-square-2', { kind: 'shape', color: 'blue', shape: 'square' }),
        shapeItem('g1h-green-triangle-2', { kind: 'shape', color: 'green', shape: 'triangle' }),
      ],
    }
  }
  const items = [
    shapeItem('g1-red-circle-1', { kind: 'shape', color: 'red', shape: 'circle' }),
    shapeItem('g1-red-square-1', { kind: 'shape', color: 'red', shape: 'square' }),
    shapeItem('g1-blue-circle-1', { kind: 'shape', color: 'blue', shape: 'circle' }),
    shapeItem('g1-blue-square-1', { kind: 'shape', color: 'blue', shape: 'square' }),
    shapeItem('g1-red-circle-2', { kind: 'shape', color: 'red', shape: 'circle' }),
    shapeItem('g1-red-square-2', { kind: 'shape', color: 'red', shape: difficulty === 'easy' ? 'square' : 'diamond' }),
    shapeItem('g1-blue-circle-2', { kind: 'shape', color: 'blue', shape: 'circle' }),
    shapeItem('g1-blue-square-2', { kind: 'shape', color: 'blue', shape: 'square' }),
    shapeItem('g1-red-circle-3', { kind: 'shape', color: 'red', shape: 'circle' }),
    shapeItem('g1-blue-square-3', { kind: 'shape', color: 'blue', shape: 'diamond' }),
  ]
  return {
    title: 'Фігури на станції',
    instruction: 'Розклади фігури за двома ознаками: колір і форма.',
    axes: [colorAxis, shapeAxis],
    items: difficulty === 'easy' ? items.slice(0, 8) : items,
  }
}

function gradeTwo(difficulty: SortingStationDifficulty): SortingStationSet {
  const items = [
    emojiItem('g2-cat-home', '🐈', 'кіт удома', { life: 'living', place: 'home' }),
    emojiItem('g2-plant-home', '🪴', 'кімнатна рослина', { life: 'living', place: 'home' }),
    emojiItem('g2-key-home', '🔑', 'ключ від дому', { life: 'nonliving', place: 'home' }),
    emojiItem('g2-toy-home', '🧸', 'іграшка вдома', { life: 'nonliving', place: 'home' }),
    emojiItem('g2-plant-school', '🪴', 'рослина у класі', { life: 'living', place: 'school' }),
    emojiItem('g2-fish-school', '🐠', 'рибка в класному акваріумі', { life: 'living', place: 'school' }),
    emojiItem('g2-book-school', '📘', 'підручник у школі', { life: 'nonliving', place: 'school' }),
    emojiItem('g2-pencil-school', '✏️', 'олівець у школі', { life: 'nonliving', place: 'school' }),
    emojiItem('g2-dog-home', '🐕', 'пес удома', { life: 'living', place: 'home' }),
    emojiItem('g2-backpack-school', '🎒', 'рюкзак у школі', { life: 'nonliving', place: 'school' }),
  ]
  if (difficulty !== 'hard') {
    return {
      title: 'Живе, неживе і місце',
      instruction: 'Подумай про дві ознаки: чи це живе, і де воно зараз.',
      axes: [lifeAxis, placeAxis],
      items: difficulty === 'easy' ? items.slice(0, 8) : items,
    }
  }
  return {
    title: 'Живе, неживе і місце',
    instruction: 'Тепер є ще природа. Читай підпис: він уточнює місце.',
    axes: [lifeAxis, placeAxisHard],
    items: [
      ...items,
      emojiItem('g2-tree-nature', '🌳', 'дерево в парку', { life: 'living', place: 'nature' }),
      emojiItem('g2-fish-nature', '🐟', 'риба в річці', { life: 'living', place: 'nature' }),
      emojiItem('g2-sun-nature', '☀️', 'сонце над полем', { life: 'nonliving', place: 'nature' }),
      emojiItem('g2-drop-nature', '💧', 'крапля дощу', { life: 'nonliving', place: 'nature' }),
    ].slice(0, 12),
  }
}

function gradeThree(difficulty: SortingStationDifficulty): SortingStationSet {
  const items = [
    emojiItem('g3-keyboard-text', '⌨️', 'клавіатура вводить текст', { role: 'input', data: 'text' }),
    emojiItem('g3-scanner-image', '📷', 'камера вводить зображення', { role: 'input', data: 'image' }),
    emojiItem('g3-microphone-sound', '🎤', 'мікрофон вводить звук', { role: 'input', data: 'sound' }),
    emojiItem('g3-printer-text', '🖨️', 'принтер виводить текст', { role: 'output', data: 'text' }),
    emojiItem('g3-monitor-image', '🖥️', 'монітор виводить зображення', { role: 'output', data: 'image' }),
    emojiItem('g3-speaker-sound', '🔊', 'колонка виводить звук', { role: 'output', data: 'sound' }),
    emojiItem('g3-touch-text', '⌨️', 'екранна клавіатура вводить текст', { role: 'input', data: 'text' }),
    emojiItem('g3-projector-image', '🖥️', 'проєктор виводить зображення', { role: 'output', data: 'image' }),
    emojiItem('g3-recorder-sound', '🎤', 'дитина записує голос', { role: 'input', data: 'sound' }),
    emojiItem('g3-receipt-text', '🖨️', 'принтер друкує чек', { role: 'output', data: 'text' }),
    emojiItem('g3-camera-image', '📷', 'камера робить фото', { role: 'input', data: 'image' }),
    emojiItem('g3-headphones-sound', '🔊', 'динамік програє музику', { role: 'output', data: 'sound' }),
  ]
  return {
    title: 'Пристрої і дані',
    instruction: difficulty === 'easy'
      ? 'Визнач роль пристрою і тип даних.'
      : 'Думай за дією в підписі: той самий предмет може підказувати різні дані.',
    axes: [roleAxis, dataAxis],
    items: difficulty === 'easy' ? items.slice(0, 8) : difficulty === 'medium' ? items.slice(0, 10) : items,
  }
}

function gradeFour(difficulty: SortingStationDifficulty): SortingStationSet {
  const items = [
    emojiItem('g4-student-types', '⌨️', 'учень вводить відповідь у поле', { role: 'input', data: 'text' }),
    emojiItem('g4-map-screen', '🖥️', 'комп’ютер показує карту маршруту', { role: 'output', data: 'image' }),
    emojiItem('g4-robot-camera', '📷', 'робот бачить перешкоду камерою', { role: 'input', data: 'image' }),
    emojiItem('g4-alert-speaker', '🔊', 'система озвучує попередження', { role: 'output', data: 'sound' }),
    emojiItem('g4-voice-command', '🎤', 'дитина диктує команду голосом', { role: 'input', data: 'sound' }),
    emojiItem('g4-report-printer', '🖨️', 'принтер друкує звіт', { role: 'output', data: 'text' }),
    emojiItem('g4-video-call-camera', '📷', 'камера передає обличчя в дзвінок', { role: 'input', data: 'image' }),
    emojiItem('g4-caption-screen', '🖥️', 'екран показує інструкцію словами', { role: 'output', data: 'text' }),
    emojiItem('g4-music-speaker', '🔊', 'колонка відтворює мелодію', { role: 'output', data: 'sound' }),
    emojiItem('g4-search-keyboard', '⌨️', 'користувач набирає пошуковий запит', { role: 'input', data: 'text' }),
    emojiItem('g4-photo-print', '🖨️', 'принтер друкує фотографію', { role: 'output', data: 'image' }),
    emojiItem('g4-audio-note', '🎤', 'мікрофон записує аудіонотатку', { role: 'input', data: 'sound' }),
  ]
  return {
    title: 'Сортування за ситуацією',
    instruction: difficulty === 'easy'
      ? 'Класифікуй за тим, що відбувається в ситуації.'
      : 'Не дивись лише на іконку: рішення дає дія в описі ситуації.',
    axes: [roleAxis, dataAxis],
    items: difficulty === 'easy' ? items.slice(0, 8) : difficulty === 'medium' ? items.slice(0, 10) : items,
  }
}

export function binIdForItem(set: SortingStationSet, item: SortingStationItem): string {
  return `${item.traits[set.axes[0].id]}:${item.traits[set.axes[1].id]}`
}

export function generateSortingStationSet(
  grade: number,
  difficulty: string | null | undefined = 'easy',
): SortingStationSet {
  const normalizedDifficulty = normalizeDifficulty(difficulty)
  switch (normalizeGrade(grade)) {
    case 1:
      return gradeOne(normalizedDifficulty)
    case 2:
      return gradeTwo(normalizedDifficulty)
    case 3:
      return gradeThree(normalizedDifficulty)
    case 4:
      return gradeFour(normalizedDifficulty)
  }
}
