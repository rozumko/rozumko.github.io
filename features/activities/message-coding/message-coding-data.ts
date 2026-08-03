export type MessageCodingDifficulty = 'easy' | 'medium' | 'hard'
export type MessageCodingTaskType = 'symbols' | 'alphabet' | 'binary' | 'pixels' | 'cipher' | 'key'

export interface MessageCodingLegendItem {
  code: string
  label: string
}

export interface MessageCodingKeyExample {
  tokens: string[]
  plain: string
}

export type MessageCodingDisplay =
  | { kind: 'text'; value: string }
  | { kind: 'chips'; chips: string[] }
  | { kind: 'cipher'; tokens: string[] }
  | { kind: 'key'; examples: MessageCodingKeyExample[]; challenge: string[] }
  | { kind: 'binary'; bits: string; weights: number[] }
  | { kind: 'pixels'; rows: string[] }

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
    // The whole alphabet, not a prefix of it: a shortened legend left tasks
    // whose words reach past it (Ф is 25, Х is 26) impossible to check.
    legend: UKRAINIAN_ALPHABET.map((letter, index) => ({ code: letter, label: String(index + 1) })),
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

const SHAPE_CIPHER: Record<string, string> = {
  А: '△',
  Б: '⌜',
  В: '◇',
  Г: '┬',
  Д: '●',
  Е: '⌟',
  И: '✕',
  І: '□',
  К: '◆',
  Л: '⊣',
  М: '○',
  Н: '⊢',
  О: '▲',
  П: '⌝',
  Р: '▽',
  С: '✚',
  Т: '■',
  У: '◁',
  Ь: '⊔',
  Я: '▷',
}

const DOT_DASH_CIPHER: Record<string, string> = {
  А: '.-',
  Б: '-...',
  В: '.--',
  Г: '--.',
  Д: '-..',
  Е: '.',
  И: '..-.',
  І: '..',
  К: '-.-',
  Л: '.-..',
  М: '--',
  Н: '-.',
  О: '---',
  П: '.--.',
  Р: '.-.',
  С: '...',
  Т: '-',
  У: '..-',
  Ь: '-..-',
  Я: '.-.-',
}

function cipherTask(
  id: string,
  cipher: Record<string, string>,
  message: string,
  prompt: string,
  options: readonly string[],
  answerIndex: number,
  title = 'Шифр знаків',
): MessageCodingTask {
  const letters = [...message.replace(/\s+/g, '')]
  // The legend must not hint at the answer. Built from the message alone it
  // did both: its order spelled the hidden word, and its letters covered only
  // that word, so the other options could be ruled out without decoding
  // anything. It now follows the cipher's own (alphabetical) order and covers
  // every option, which is also what a child needs to check their guess.
  const needed = new Set([...letters, ...options.flatMap(option => [...option.replace(/\s+/g, '')])])
  const legend = Object.keys(cipher)
    .filter(letter => needed.has(letter))
    .map(letter => ({ code: cipher[letter] ?? '?', label: letter }))

  return {
    id,
    type: 'cipher',
    mode: 'decode',
    title,
    prompt,
    display: { kind: 'cipher', tokens: letters.map(letter => cipher[letter] ?? '?') },
    legend,
    options,
    answerIndex,
  }
}

function keyTask(
  id: string,
  cipher: Record<string, string>,
  examples: readonly string[],
  message: string,
  options: readonly string[],
  answerIndex: number,
): MessageCodingTask {
  const encode = (value: string) => [...value].map(letter => cipher[letter] ?? '?')

  return {
    id,
    type: 'key',
    mode: 'decode',
    title: 'Знайди ключ',
    prompt: 'Розглянь приклади, віднови відповідність знаків і розшифруй останнє слово.',
    display: {
      kind: 'key',
      examples: examples.map(plain => ({ tokens: encode(plain), plain })),
      challenge: encode(message),
    },
    legend: [{ code: 'Підказка:', label: 'однакові знаки означають однакові літери' }],
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
      keyTask('g2-m-3', SHAPE_CIPHER, ['КІТ', 'СОН', 'ДІМ'], 'КОД', ['КОД', 'КІТ', 'ДІМ'], 0),
      alphabetTask('g2-m-4', 'encode', 'ЛИСТ', [alphabetCode('ЛІС'), alphabetCode('ЛИСТ'), alphabetCode('МІСТ')], 1),
      alphabetTask('g2-m-5', 'decode', 'ДАНІ', ['ДІМ', 'ДАНІ', 'ДЕНЬ'], 1),
    ]
  }
  return [
    alphabetTask('g2-h-1', 'decode', 'АЛГОРИТМ', ['АЛГОРИТМ', 'КОМАНДА', 'ПРИКЛАД'], 0),
    alphabetTask('g2-h-2', 'encode', 'КОМАНДА', [alphabetCode('КОМАНДА'), alphabetCode('КАРТА'), alphabetCode('КОМПАС')], 0),
    keyTask('g2-h-3', SHAPE_CIPHER, ['ЛІС', 'КІТ', 'МИР'], 'ЛИСТ', ['ЛИСТ', 'ЛІС', 'МІСТ'], 0),
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
      keyTask('g3-m-3', SHAPE_CIPHER, ['КІТ', 'СОН', 'ДІМ'], 'КОД', ['КОД', 'ДІМ', 'КІТ'], 0),
      binaryTask('g3-m-4', 'encode', '1100', 'Який код відповідає числу 12?', ['1100', '1010', '0110'], 0),
      pixelTask('g3-m-5', ['010', '010', '111'], 'Яка форма вийде?', ['стрілка вниз', 'літера Т', 'рамка'], 1),
    ]
  }
  return [
    binaryTask('g3-h-1', 'decode', '1110', 'Яке число показують лампочки?', ['11', '14', '15'], 1),
    cipherTask('g3-h-2', DOT_DASH_CIPHER, 'СИГНАЛ', 'Розшифруй повідомлення з крапок і рисок.', ['СИГНАЛ', 'СНІГ', 'ЛИСТ'], 0, 'Крапки й риски'),
    pixelTask('g3-h-3', ['0110', '1001', '1001', '0110'], 'Що схоже на цю піксельну картинку?', ['коло', 'стрілка', 'сходи'], 0),
    binaryTask('g3-h-4', 'encode', '1011', 'Який код відповідає числу 11?', ['1011', '1101', '0111'], 0),
    keyTask('g3-h-5', SHAPE_CIPHER, ['РОТА', 'БОБ'], 'РОБОТ', ['РОБОТ', 'РОТА', 'БОБЕР'], 0),
  ]
}

function gradeFourTasks(difficulty: MessageCodingDifficulty): MessageCodingTask[] {
  if (difficulty === 'easy') {
    return [
      binaryTask('g4-e-1', 'decode', '1011', 'Яке число показують лампочки?', ['9', '11', '13'], 1),
      pixelTask('g4-e-2', ['0100', '1110', '0100', '0100'], 'Який знак схований у пікселях?', ['стрілка', 'рамка', 'сходинка'], 0),
      cipherTask('g4-e-3', SHAPE_CIPHER, 'ДАНІ', 'Яке слово сховане в шифрі?', ['ДАНІ', 'ДІМ', 'ДЕНЬ'], 0),
      binaryTask('g4-e-4', 'encode', '1101', 'Який код відповідає числу 13?', ['1101', '1011', '1110'], 0),
      pixelTask('g4-e-5', ['1111', '0001', '0001', '1111'], 'Яка форма вийде?', ['кутова рамка', 'хрестик', 'крапка'], 0),
    ]
  }
  if (difficulty === 'medium') {
    return [
      binaryTask('g4-m-1', 'decode', '10011', 'Яке число показують п’ять лампочок?', ['17', '19', '21'], 1),
      cipherTask('g4-m-2', DOT_DASH_CIPHER, 'ПАРОЛЬ', 'Розшифруй слово з крапок і рисок.', ['ПАРОЛЬ', 'ПАПКА', 'ПОШТА'], 0, 'Крапки й риски'),
      pixelTask('g4-m-3', ['00100', '01110', '11111', '00100', '00100'], 'Який знак схований у пікселях?', ['стрілка вгору', 'рамка', 'діагональ'], 0),
      binaryTask('g4-m-4', 'encode', '10101', 'Який код відповідає числу 21?', ['10101', '10011', '11001'], 0),
      keyTask('g4-m-5', DOT_DASH_CIPHER, ['ПАРА', 'СОЛЬ'], 'ПАРОЛЬ', ['ПАРОЛЬ', 'ПАПКА', 'ПОШТА'], 0),
    ]
  }
  return [
    binaryTask('g4-h-1', 'decode', '11001', 'Яке число показують п’ять лампочок?', ['21', '24', '25'], 2),
    keyTask('g4-h-2', SHAPE_CIPHER, ['ГРА', 'ЛІТО', 'МИР'], 'АЛГОРИТМ', ['АЛГОРИТМ', 'АЛФАВІТ', 'КОМПАС'], 0),
    pixelTask('g4-h-3', ['10001', '01010', '00100', '01010', '10001'], 'Що закодовано пікселями?', ['ікс', 'плюс', 'рамка'], 0),
    binaryTask('g4-h-4', 'encode', '11110', 'Який код відповідає числу 30?', ['11101', '11110', '11011'], 1),
    cipherTask('g4-h-5', DOT_DASH_CIPHER, 'КОМАНДА', 'Розшифруй командне слово.', ['КОМАНДА', 'КОЛОНКА', 'КАРТА'], 0, 'Крапки й риски'),
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
