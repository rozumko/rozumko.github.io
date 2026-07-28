export type MessageCodingDifficulty = 'easy' | 'medium' | 'hard'
export type MessageCodingTaskType = 'symbols' | 'alphabet' | 'binary' | 'pixels' | 'coordinates'

export interface MessageCodingLegendItem {
  code: string
  label: string
}

export type MessageCodingDisplay =
  | { kind: 'text'; value: string }
  | { kind: 'chips'; chips: string[] }
  | { kind: 'binary'; bits: string; weights: number[] }
  | { kind: 'pixels'; rows: string[] }
  | { kind: 'coordinates'; size: number; points: readonly [number, number][] }

export interface MessageCodingTask {
  id: string
  type: MessageCodingTaskType
  mode: 'encode' | 'decode'
  title: string
  prompt: string
  display: MessageCodingDisplay
  legend: MessageCodingLegendItem[]
  options: readonly string[]
  answerIndex: number
}

const UKRAINIAN_ALPHABET = 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ'.split('')

function normalizeGrade(grade: number): 1 | 2 | 3 | 4 {
  return grade === 2 || grade === 3 || grade === 4 ? grade : 1
}

function normalizeDifficulty(difficulty: string | null | undefined): MessageCodingDifficulty {
  return difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy'
}

function symbolTask(
  id: string,
  mode: MessageCodingTask['mode'],
  prompt: string,
  chips: string[],
  options: readonly string[],
  answerIndex: number,
  legend: MessageCodingLegendItem[],
): MessageCodingTask {
  return {
    id,
    type: 'symbols',
    mode,
    title: mode === 'decode' ? 'Розкодуй повідомлення' : 'Закодуй повідомлення',
    prompt,
    display: { kind: 'chips', chips },
    legend,
    options,
    answerIndex,
  }
}

function alphabetCode(word: string): string {
  return word
    .split('')
    .map(letter => String(UKRAINIAN_ALPHABET.indexOf(letter) + 1))
    .join('-')
}

function alphabetTask(
  id: string,
  mode: MessageCodingTask['mode'],
  word: string,
  options: readonly string[],
  answerIndex: number,
): MessageCodingTask {
  const code = alphabetCode(word)
  return {
    id,
    type: 'alphabet',
    mode,
    title: mode === 'decode' ? 'Числа замість літер' : 'Літери у числа',
    prompt: mode === 'decode' ? 'Яке слово сховане в коді?' : `Який код має слово "${word}"?`,
    display: { kind: 'text', value: mode === 'decode' ? code : word },
    legend: UKRAINIAN_ALPHABET.slice(0, 24).map((letter, index) => ({ code: letter, label: String(index + 1) })),
    options,
    answerIndex,
  }
}

function binaryTask(
  id: string,
  mode: MessageCodingTask['mode'],
  bits: string,
  prompt: string,
  options: readonly string[],
  answerIndex: number,
): MessageCodingTask {
  const weights = bits.length === 5 ? [16, 8, 4, 2, 1] : [8, 4, 2, 1]
  return {
    id,
    type: 'binary',
    mode,
    title: 'Двійкові лампочки',
    prompt,
    display: { kind: 'binary', bits, weights },
    legend: [
      { code: '1', label: 'лампочка світиться' },
      { code: '0', label: 'лампочка вимкнена' },
    ],
    options,
    answerIndex,
  }
}

function pixelTask(
  id: string,
  rows: string[],
  prompt: string,
  options: readonly string[],
  answerIndex: number,
): MessageCodingTask {
  return {
    id,
    type: 'pixels',
    mode: 'decode',
    title: 'Піксельна картинка',
    prompt,
    display: { kind: 'pixels', rows },
    legend: [
      { code: '1', label: 'зафарбований піксель' },
      { code: '0', label: 'порожній піксель' },
    ],
    options,
    answerIndex,
  }
}

function coordinateTask(
  id: string,
  size: number,
  points: readonly [number, number][],
  prompt: string,
  options: readonly string[],
  answerIndex: number,
): MessageCodingTask {
  return {
    id,
    type: 'coordinates',
    mode: 'decode',
    title: 'Координати',
    prompt,
    display: { kind: 'coordinates', size, points },
    legend: [
      { code: '(x, y)', label: 'спочатку стовпчик, потім рядок' },
    ],
    options,
    answerIndex,
  }
}

function gradeOneTasks(difficulty: MessageCodingDifficulty): MessageCodingTask[] {
  const base = [
    { code: '☀️', label: 'сонце' },
    { code: '🏠', label: 'дім' },
    { code: '🌳', label: 'дерево' },
    { code: '🐱', label: 'кіт' },
    { code: '⚽', label: 'м’яч' },
  ]
  if (difficulty === 'easy') {
    return [
      symbolTask('g1-e-1', 'decode', 'Що означає код?', ['☀️'], ['сонце', 'дім', 'дерево'], 0, base.slice(0, 3)),
      symbolTask('g1-e-2', 'decode', 'Що означає код?', ['🏠'], ['м’яч', 'дім', 'кіт'], 1, base),
      symbolTask('g1-e-3', 'encode', 'Обери код для слова "дерево".', ['?'], ['☀️', '🌳', '🏠'], 1, base.slice(0, 3)),
      symbolTask('g1-e-4', 'decode', 'Що означає повідомлення?', ['🐱', '⚽'], ['кіт і м’яч', 'дім і дерево', 'сонце і кіт'], 0, base),
      symbolTask('g1-e-5', 'encode', 'Обери код для повідомлення "сонце і дім".', ['?'], ['🏠 ☀️', '☀️ 🏠', '🌳 🏠'], 1, base.slice(0, 3)),
    ]
  }
  if (difficulty === 'medium') {
    return [
      symbolTask('g1-m-1', 'decode', 'Що означає повідомлення?', ['☀️', '🌳'], ['сонце і дерево', 'кіт і дім', 'м’яч і дерево'], 0, base),
      symbolTask('g1-m-2', 'encode', 'Обери код для повідомлення "кіт і дім".', ['?'], ['🐱 🏠', '🏠 🐱', '⚽ 🏠'], 0, base),
      symbolTask('g1-m-3', 'decode', 'Що означає повідомлення?', ['🏠', '🌳'], ['дім і дерево', 'дерево і дім', 'сонце і дерево'], 0, base),
      symbolTask('g1-m-4', 'encode', 'Обери код для повідомлення "м’яч і сонце".', ['?'], ['⚽ ☀️', '☀️ ⚽', '🐱 ☀️'], 0, base),
      symbolTask('g1-m-5', 'decode', 'Що означає повідомлення?', ['🐱', '🏠', '🌳'], ['кіт, дім, дерево', 'дім, кіт, дерево', 'кіт, дерево, дім'], 0, base),
    ]
  }
  return [
    symbolTask('g1-h-1', 'decode', 'Порядок важливий. Що означає повідомлення?', ['☀️', '🏠', '🌳'], ['сонце, дім, дерево', 'дім, сонце, дерево', 'сонце, дерево, дім'], 0, base),
    symbolTask('g1-h-2', 'encode', 'Обери код для повідомлення "кіт, м’яч, дім".', ['?'], ['🐱 ⚽ 🏠', '⚽ 🐱 🏠', '🐱 🏠 ⚽'], 0, base),
    symbolTask('g1-h-3', 'decode', 'Що означає повідомлення?', ['🌳', '☀️', '⚽'], ['дерево, сонце, м’яч', 'сонце, дерево, м’яч', 'дерево, м’яч, сонце'], 0, base),
    symbolTask('g1-h-4', 'encode', 'Обери код для повідомлення "дім, дерево, кіт".', ['?'], ['🏠 🌳 🐱', '🌳 🏠 🐱', '🏠 🐱 🌳'], 0, base),
    symbolTask('g1-h-5', 'decode', 'Що означає повідомлення?', ['⚽', '🐱', '☀️'], ['м’яч, кіт, сонце', 'кіт, м’яч, сонце', 'м’яч, сонце, кіт'], 0, base),
  ]
}

function gradeTwoTasks(difficulty: MessageCodingDifficulty): MessageCodingTask[] {
  const easy = [
    alphabetTask('g2-e-1', 'decode', 'КІТ', ['КІТ', 'ДІМ', 'МАК'], 0),
    alphabetTask('g2-e-2', 'decode', 'ДІМ', ['ДІМ', 'СОН', 'КОД'], 0),
    alphabetTask('g2-e-3', 'encode', 'МАК', [alphabetCode('МАМ'), alphabetCode('МАК'), alphabetCode('РАК')], 1),
    alphabetTask('g2-e-4', 'decode', 'СОН', ['СОМ', 'СОН', 'СИР'], 1),
    alphabetTask('g2-e-5', 'encode', 'КОД', [alphabetCode('КОД'), alphabetCode('КІТ'), alphabetCode('ДІМ')], 0),
  ]
  if (difficulty === 'easy') return easy
  if (difficulty === 'medium') {
    return [
      alphabetTask('g2-m-1', 'decode', 'РОБОТ', ['РОБОТ', 'КОМП', 'КОДЕР'], 0),
      alphabetTask('g2-m-2', 'encode', 'ЕКРАН', [alphabetCode('ЕКРАН'), alphabetCode('КРАН'), alphabetCode('КЛАС')], 0),
      alphabetTask('g2-m-3', 'decode', 'КЛАС', ['КЛАС', 'КОД', 'ЛИСТ'], 0),
      alphabetTask('g2-m-4', 'encode', 'ЛИСТ', [alphabetCode('ЛІС'), alphabetCode('ЛИСТ'), alphabetCode('МІСТ')], 1),
      alphabetTask('g2-m-5', 'decode', 'ДАНІ', ['ДІМ', 'ДАНІ', 'ДЕНЬ'], 1),
    ]
  }
  return [
    alphabetTask('g2-h-1', 'decode', 'АЛГОРИТМ', ['АЛГОРИТМ', 'КОМАНДА', 'ПРИКЛАД'], 0),
    alphabetTask('g2-h-2', 'encode', 'КОМАНДА', [alphabetCode('КОМАНДА'), alphabetCode('КАРТА'), alphabetCode('КОМПАС')], 0),
    alphabetTask('g2-h-3', 'decode', 'ПІКСЕЛЬ', ['ПІКСЕЛЬ', 'ПАЗЛ', 'ПАМ’ЯТЬ'], 0),
    alphabetTask('g2-h-4', 'encode', 'СИГНАЛ', [alphabetCode('СИМВОЛ'), alphabetCode('СИГНАЛ'), alphabetCode('СХЕМА')], 1),
    alphabetTask('g2-h-5', 'decode', 'ІНФО', ['ІНФО', 'ІМ’Я', 'ІГРА'], 0),
  ]
}

function gradeThreeTasks(difficulty: MessageCodingDifficulty): MessageCodingTask[] {
  const easy = [
    binaryTask('g3-e-1', 'decode', '0101', 'Яке число показують лампочки?', ['3', '5', '9'], 1),
    binaryTask('g3-e-2', 'encode', '0110', 'Який код відповідає числу 6?', ['0101', '0110', '1001'], 1),
    pixelTask('g3-e-3', ['010', '111', '010'], 'Яка картинка схована в пікселях?', ['хрестик', 'рамка', 'стрілка'], 0),
    pixelTask('g3-e-4', ['100', '110', '111'], 'Яка форма вийде?', ['сходинка', 'хрестик', 'крапка'], 0),
    binaryTask('g3-e-5', 'decode', '1001', 'Яке число показують лампочки?', ['7', '8', '9'], 2),
  ]
  if (difficulty === 'easy') return easy
  if (difficulty === 'medium') {
    return [
      binaryTask('g3-m-1', 'decode', '1010', 'Яке число показують лампочки?', ['10', '12', '6'], 0),
      pixelTask('g3-m-2', ['111', '101', '111'], 'Що закодовано пікселями?', ['рамка', 'сходинка', 'лінія'], 0),
      coordinateTask('g3-m-3', 3, [[2, 1], [2, 2], [2, 3]], 'Яку форму задають координати?', ['горизонтальна лінія', 'вертикальна лінія', 'кут'], 1),
      binaryTask('g3-m-4', 'encode', '1100', 'Який код відповідає числу 12?', ['1100', '1010', '0110'], 0),
      pixelTask('g3-m-5', ['010', '010', '111'], 'Яка форма вийде?', ['стрілка вниз', 'літера Т', 'рамка'], 1),
    ]
  }
  return [
    binaryTask('g3-h-1', 'decode', '1110', 'Яке число показують лампочки?', ['11', '14', '15'], 1),
    coordinateTask('g3-h-2', 4, [[1, 1], [2, 2], [3, 3], [4, 4]], 'Яку лінію задають координати?', ['діагональ', 'рядок', 'стовпчик'], 0),
    pixelTask('g3-h-3', ['0110', '1001', '1001', '0110'], 'Що схоже на цю піксельну картинку?', ['коло', 'стрілка', 'сходи'], 0),
    binaryTask('g3-h-4', 'encode', '1011', 'Який код відповідає числу 11?', ['1011', '1101', '0111'], 0),
    coordinateTask('g3-h-5', 4, [[1, 4], [2, 3], [3, 2], [4, 1]], 'Яку лінію задають координати?', ['діагональ угору', 'стовпчик', 'рамка'], 0),
  ]
}

function gradeFourTasks(difficulty: MessageCodingDifficulty): MessageCodingTask[] {
  if (difficulty === 'easy') {
    return [
      binaryTask('g4-e-1', 'decode', '1011', 'Яке число показують лампочки?', ['9', '11', '13'], 1),
      pixelTask('g4-e-2', ['0100', '1110', '0100', '0100'], 'Який знак схований у пікселях?', ['стрілка', 'рамка', 'сходинка'], 0),
      coordinateTask('g4-e-3', 4, [[1, 2], [2, 2], [3, 2], [4, 2]], 'Яку форму задають координати?', ['горизонтальна лінія', 'вертикальна лінія', 'діагональ'], 0),
      binaryTask('g4-e-4', 'encode', '1101', 'Який код відповідає числу 13?', ['1101', '1011', '1110'], 0),
      pixelTask('g4-e-5', ['1111', '0001', '0001', '1111'], 'Яка форма вийде?', ['кутова рамка', 'хрестик', 'крапка'], 0),
    ]
  }
  if (difficulty === 'medium') {
    return [
      binaryTask('g4-m-1', 'decode', '10011', 'Яке число показують п’ять лампочок?', ['17', '19', '21'], 1),
      coordinateTask('g4-m-2', 5, [[1, 1], [2, 1], [3, 1], [1, 2], [1, 3]], 'Яку форму задають координати?', ['кут', 'діагональ', 'стовпчик'], 0),
      pixelTask('g4-m-3', ['00100', '01110', '11111', '00100', '00100'], 'Який знак схований у пікселях?', ['стрілка вгору', 'рамка', 'діагональ'], 0),
      binaryTask('g4-m-4', 'encode', '10101', 'Який код відповідає числу 21?', ['10101', '10011', '11001'], 0),
      coordinateTask('g4-m-5', 5, [[2, 2], [3, 2], [4, 2], [3, 3], [3, 4]], 'Яка форма вийде?', ['літера Т', 'рамка', 'діагональ'], 0),
    ]
  }
  return [
    binaryTask('g4-h-1', 'decode', '11001', 'Яке число показують п’ять лампочок?', ['21', '24', '25'], 2),
    coordinateTask('g4-h-2', 5, [[1, 1], [5, 1], [2, 2], [4, 2], [3, 3], [2, 4], [4, 4], [1, 5], [5, 5]], 'Який знак задають координати?', ['ікс', 'рамка', 'стрілка'], 0),
    pixelTask('g4-h-3', ['10001', '01010', '00100', '01010', '10001'], 'Що закодовано пікселями?', ['ікс', 'плюс', 'рамка'], 0),
    binaryTask('g4-h-4', 'encode', '11110', 'Який код відповідає числу 30?', ['11101', '11110', '11011'], 1),
    coordinateTask('g4-h-5', 5, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [3, 2], [3, 3], [3, 4], [3, 5]], 'Яка форма вийде?', ['плюс', 'літера Т', 'діагональ'], 1),
  ]
}

export function generateMessageCodingSet(
  grade: number,
  difficulty: string | null | undefined = 'easy',
): MessageCodingTask[] {
  const normalizedDifficulty = normalizeDifficulty(difficulty)
  switch (normalizeGrade(grade)) {
    case 1:
      return gradeOneTasks(normalizedDifficulty)
    case 2:
      return gradeTwoTasks(normalizedDifficulty)
    case 3:
      return gradeThreeTasks(normalizedDifficulty)
    case 4:
      return gradeFourTasks(normalizedDifficulty)
  }
}
