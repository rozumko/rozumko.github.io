// Генератори логічних головоломок (порт temp/math_quiz, адаптований під стек).
// Чиста логіка без DOM — рендерить puzzle-engine.ts. 5 типів під концепти ЦТ:
//   sequence → patterns · machine → algorithms · balance → logic
//   magic/latin → logic · symbols → abstraction
// 1 клас: емодзі + тап (магічний → латинський квадрат, символи → емодзі);
// 2+ клас: числа. Складність квадрата — розмір 3×3 / 4×4.

export type PuzzleConcept = 'patterns' | 'algorithms' | 'logic' | 'abstraction'
export type PuzzleType = 'sequence' | 'machine' | 'balance' | 'symbols' | 'magic' | 'latin'

// Токен рядка/клітинки: готове значення, числове поле, або вибір із варіантів (тап).
export type Token =
  | { t: 'val'; text: string }
  | { t: 'input'; id: string }
  | { t: 'choice'; id: string; options: string[] }

export interface PuzzleLine { tokens: Token[] }
export interface GridSpec { size: number; cells: Token[] }   // row-major

export interface Puzzle {
  id: string
  type: PuzzleType
  title: string
  concept: PuzzleConcept
  instruction: string
  lines?: PuzzleLine[]
  grid?: GridSpec
  answers: Record<string, string>   // answerId → правильне значення (рядок)
  hint: string       // одна коротка підказка (не розкриває відповідь)
  solution: string   // повний розв'язок — показується лише в самому кінці
}

interface Profile {
  grade: number
  seqLen: number; seqStepMin: number; seqStepMax: number; seqHidden: number; seqMax: number
  balanceMax: number; choiceSpread: number
  symbolMax: number; symbolCount: number
  magicSize: number; magicHidden: number
  machineMax: number; machineSteps: number
  operations: Array<'add' | 'subtract' | 'multiply-small'>
  emoji: boolean   // 1 клас — образна форма замість чисел
}

const PROFILES: Record<number, Profile> = {
  1: { grade: 1, seqLen: 5, seqStepMin: 1, seqStepMax: 2, seqHidden: 1, seqMax: 20,
       balanceMax: 12, choiceSpread: 4, symbolMax: 5, symbolCount: 2,
       magicSize: 3, magicHidden: 3, machineMax: 20, machineSteps: 1,
       operations: ['add', 'subtract'], emoji: true },
  2: { grade: 2, seqLen: 5, seqStepMin: 2, seqStepMax: 6, seqHidden: 2, seqMax: 60,
       balanceMax: 40, choiceSpread: 8, symbolMax: 10, symbolCount: 2,
       magicSize: 3, magicHidden: 3, machineMax: 60, machineSteps: 1,
       operations: ['add', 'subtract'], emoji: false },
  3: { grade: 3, seqLen: 6, seqStepMin: 2, seqStepMax: 9, seqHidden: 2, seqMax: 100,
       balanceMax: 80, choiceSpread: 10, symbolMax: 14, symbolCount: 3,
       magicSize: 3, magicHidden: 4, machineMax: 100, machineSteps: 2,
       operations: ['add', 'subtract', 'multiply-small'], emoji: false },
  4: { grade: 4, seqLen: 6, seqStepMin: 3, seqStepMax: 12, seqHidden: 3, seqMax: 150,
       balanceMax: 120, choiceSpread: 14, symbolMax: 18, symbolCount: 3,
       magicSize: 4, magicHidden: 4, machineMax: 150, machineSteps: 2,
       operations: ['add', 'subtract', 'multiply-small'], emoji: false },
}

const SYMBOL_EMOJI = ['🍎', '🍌', '🍇', '🍊']
const LATIN_EMOJI = ['🐶', '🐱', '🐰', '🦊']

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const val = (text: string | number): Token => ({ t: 'val', text: String(text) })
const arrow = (): Token => ({ t: 'val', text: '→' })

// Набір із 4 варіантів навколо правильного значення (для тап-вибору чисел).
function numberOptions(answer: number, spread: number, max: number): string[] {
  const set = new Set<number>([answer])
  let guard = 0
  while (set.size < 4 && guard++ < 100) {
    const c = answer + randomInt(-spread, spread)
    if (c > 0 && c <= max) set.add(c)
  }
  let fb = 1
  while (set.size < 4) { if (fb !== answer) set.add(fb); fb++ }
  return shuffle([...set]).map(String)
}

// ── sequence → patterns ──────────────────────────────────────────────────────
function createSequence(i: number, p: Profile): Puzzle {
  const step = randomInt(p.seqStepMin, p.seqStepMax)
  const descending = p.grade >= 3 && Math.random() > 0.65
  const startMin = descending ? step * (p.seqLen - 1) + 2 : 2
  const startMax = descending ? p.seqMax : Math.max(startMin, p.seqMax - step * (p.seqLen - 1))
  const start = randomInt(startMin, startMax)
  const seq = Array.from({ length: p.seqLen }, (_, k) => start + (descending ? -1 : 1) * k * step)
  const hiddenPos = shuffle(Array.from({ length: p.seqLen }, (_, k) => k)).slice(0, p.seqHidden)
  const answers: Record<string, string> = {}
  const tokens: Token[] = []
  seq.forEach((v, pos) => {
    if (pos > 0) tokens.push(arrow())
    if (hiddenPos.includes(pos)) {
      const id = `seq-${i}-${pos}`
      answers[id] = String(v)
      tokens.push({ t: 'input', id })
    } else tokens.push(val(v))
  })
  return {
    id: `sequence-${i}`, type: 'sequence', title: 'Числовий ланцюжок', concept: 'patterns',
    instruction: 'Знайди правило й заповни пропуски.',
    lines: [{ tokens }], answers,
    hint: 'Порівняй два сусідні відомі числа — на скільки вони змінюються щоразу?',
    solution: `Правило: щоразу ${descending ? 'віднімаємо' : 'додаємо'} ${step}. Ланцюжок: ${seq.join(' → ')}.`,
  }
}

// ── machine → algorithms ─────────────────────────────────────────────────────
function machineStep(current: number, p: Profile): { label: string; result: number } {
  const op = shuffle(p.operations)[0]
  if (op === 'subtract' && current > 3) {
    const n = randomInt(1, Math.min(current - 1, p.seqStepMax + 4))
    return { label: `− ${n}`, result: current - n }
  }
  if (op === 'multiply-small') {
    const n = randomInt(2, p.grade <= 2 ? 4 : 6)
    if (current * n <= p.machineMax) return { label: `× ${n}`, result: current * n }
  }
  const maxN = Math.max(1, Math.min(p.seqStepMax + 6, p.machineMax - current))
  const n = randomInt(1, maxN || 1)
  return { label: `+ ${n}`, result: current + n }
}
function createMachine(i: number, p: Profile): Puzzle {
  const start = randomInt(2, Math.max(3, Math.floor(p.machineMax / (p.grade >= 3 ? 5 : 3))))
  const steps: Array<{ label: string; result: number }> = []
  let result = start
  for (let s = 0; s < p.machineSteps; s++) { const st = machineStep(result, p); steps.push(st); result = st.result }
  const id = `machine-${i}`
  const tokens: Token[] = [val(start)]
  steps.forEach(st => { tokens.push(arrow()); tokens.push(val(st.label)) })
  tokens.push(arrow(), { t: 'input', id })
  return {
    id: `machine-${i}`, type: 'machine', title: 'Математична машина', concept: 'algorithms',
    instruction: 'Виконай дії машини зліва направо й запиши результат.',
    lines: [{ tokens }], answers: { [id]: String(result) },
    hint: `Виконуй дії по черзі. Почни з числа ${start}.`,
    solution: `Починаємо з ${start}: ${steps.map(s => s.label).join(' → ')}. Результат: ${result}.`,
  }
}

// ── balance → logic (тап) ────────────────────────────────────────────────────
function createBalance(i: number, p: Profile): Puzzle {
  let leftKnown: number, unknown: number, rightA: number, rightB: number
  do {
    leftKnown = randomInt(3, p.balanceMax); unknown = randomInt(3, p.balanceMax)
    rightA = randomInt(3, p.balanceMax); rightB = leftKnown + unknown - rightA
  } while (rightB <= 0 || rightB > p.balanceMax)
  const id = `balance-${i}`
  const options = numberOptions(unknown, p.choiceSpread, p.balanceMax)
  return {
    id: `balance-${i}`, type: 'balance', title: 'Рівність на терезах', concept: 'logic',
    instruction: 'Обери число, щоб ліва і права частини стали рівними.',
    lines: [{ tokens: [val(leftKnown), val('+'), { t: 'choice', id, options }, val('='), val(rightA), val('+'), val(rightB)] }],
    answers: { [id]: String(unknown) },
    hint: `Спочатку порахуй праву частину: ${rightA} + ${rightB}.`,
    solution: `Права частина: ${rightA} + ${rightB} = ${rightA + rightB}. Тому невідоме: ${rightA + rightB} − ${leftKnown} = ${unknown}.`,
  }
}

// ── symbols → abstraction (1 кл. — емодзі+тап; 2+ — числа+ввід) ───────────────
function createSymbols(i: number, p: Profile): Puzzle {
  const glyphs = (p.emoji ? SYMBOL_EMOJI : ['●', '▲', '■', '◆']).slice(0, p.symbolCount)
  const values = glyphs.map(() => randomInt(1, p.symbolMax))
  const single = p.symbolCount === 2
  const answer = single ? values[1] : values.reduce((a, b) => a + b, 0)
  const id = `symbols-${i}`
  const lines: PuzzleLine[] = [
    { tokens: [val(`${glyphs[0]} + ${glyphs[0]}`), val('='), val(values[0] * 2)] },
    ...glyphs.slice(1).map((g, pos) => ({ tokens: [val(`${glyphs[pos]} + ${g}`), val('='), val(values[pos] + values[pos + 1])] })),
  ]
  const targetExpr = single ? glyphs[1] : glyphs.join(' + ')
  const answerToken: Token = p.emoji
    ? { t: 'choice', id, options: numberOptions(answer, 3, p.symbolMax + 4) }
    : { t: 'input', id }
  lines.push({ tokens: [val(targetExpr), val('='), answerToken] })
  return {
    id: `symbols-${i}`, type: 'symbols', title: 'Символьна логіка', concept: 'abstraction',
    instruction: 'Знайди, що означає кожен символ, і розвʼяжи останній приклад.',
    lines, answers: { [id]: String(answer) },
    hint: `Почни з першого рядка: два однакові ${glyphs[0]} дають відому суму.`,
    solution: single
      ? `${glyphs[0]} = ${values[0]}, тому ${glyphs[1]} = ${values[1]}.`
      : `${glyphs.map((g, k) => `${g} = ${values[k]}`).join(', ')}. Сума = ${answer}.`,
  }
}

// ── magic square → logic (числа, 2+ клас) ────────────────────────────────────
const MAGIC_3 = [[8, 1, 6], [3, 5, 7], [4, 9, 2]]
const MAGIC_4 = [[1, 15, 14, 4], [12, 6, 7, 9], [8, 10, 11, 5], [13, 3, 2, 16]]
function rotate(sq: number[][]): number[][] {
  const n = sq.length
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => sq[n - 1 - c][r]))
}
function magicLines(size: number): string[][] {
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => `${r},${c}`))
  const cols = Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => `${r},${c}`))
  const d1 = Array.from({ length: size }, (_, k) => `${k},${k}`)
  const d2 = Array.from({ length: size }, (_, k) => `${k},${size - 1 - k}`)
  return [...rows, ...cols, d1, d2]
}
// Приховані клітинки — так, щоб задача розв'язувалась по одній невідомій у лінії.
function solvableHidden(size: number, count: number): Array<[number, number]> {
  const all = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => `${r},${c}`)).flat()
  const lines = magicLines(size)
  for (let attempt = 0; attempt < 120; attempt++) {
    const hidden: string[] = []
    for (const key of shuffle(all)) {
      if (hidden.length >= count) break
      const cand = new Set([...hidden, key])
      const unresolved = new Set(cand)
      let ok = true
      while (unresolved.size) {
        const line = lines.find(l => l.filter(k => unresolved.has(k)).length === 1)
        if (!line) { ok = false; break }
        unresolved.delete(line.find(k => unresolved.has(k))!)
      }
      if (ok) hidden.push(key)
    }
    if (hidden.length === count) return hidden.map(k => k.split(',').map(Number) as [number, number])
  }
  return shuffle(all).slice(0, count).map(k => k.split(',').map(Number) as [number, number])
}
function createMagic(i: number, p: Profile): Puzzle {
  const size = p.magicSize
  const shift = randomInt(1, p.grade === 2 ? 4 : p.grade === 3 ? 8 : 12)
  let square = (size === 4 ? MAGIC_4 : MAGIC_3).map(row => row.map(v => v + shift))
  const target = (size === 4 ? 34 : 15) + shift * size
  for (let r = randomInt(0, 3); r > 0; r--) square = rotate(square)
  if (Math.random() > 0.5) square = square.map(row => [...row].reverse())
  const hidden = new Map(solvableHidden(size, p.magicHidden).map(([r, c], k) => [`${r},${c}`, `magic-${i}-${k}`]))
  const answers: Record<string, string> = {}
  const cells: Token[] = []
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const key = `${r},${c}`
    if (hidden.has(key)) { const id = hidden.get(key)!; answers[id] = String(square[r][c]); cells.push({ t: 'input', id }) }
    else cells.push(val(square[r][c]))
  }
  return {
    id: `magic-${i}`, type: 'magic', title: 'Магічний квадрат', concept: 'logic',
    instruction: `Заповни клітинки так, щоб у кожному рядку, стовпчику й діагоналі сума була ${target}.`,
    grid: { size, cells }, answers,
    hint: `Знайди рядок або стовпчик, де невідоме лише одне число. Від суми ${target} відніми відомі.`,
    solution: `Магічна сума — ${target}. Повний квадрат: ${square.map(r => r.join(', ')).join(' / ')}.`,
  }
}

// ── latin square → logic (1 клас, емодзі+тап, без арифметики) ────────────────
function createLatin(i: number, p: Profile): Puzzle {
  const size = 3
  const emoji = shuffle(LATIN_EMOJI).slice(0, size)
  // Латинський квадрат: зсув рядків. base[r][c] = emoji[(c + r) % size]
  let grid = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => emoji[(c + r) % size]))
  if (Math.random() > 0.5) grid = grid.map(row => [...row].reverse())
  const positions = shuffle(Array.from({ length: size * size }, (_, k) => k)).slice(0, p.magicHidden)
  const answers: Record<string, string> = {}
  const cells: Token[] = []
  for (let idx = 0; idx < size * size; idx++) {
    const r = Math.floor(idx / size), c = idx % size
    if (positions.includes(idx)) {
      const id = `latin-${i}-${idx}`
      answers[id] = grid[r][c]
      cells.push({ t: 'choice', id, options: [...emoji] })
    } else cells.push(val(grid[r][c]))
  }
  return {
    id: `latin-${i}`, type: 'latin', title: 'Квадрат-загадка', concept: 'logic',
    instruction: 'Постав картинки так, щоб у кожному рядку й стовпчику всі були різні.',
    grid: { size, cells }, answers,
    hint: 'У кожному рядку й стовпчику кожна картинка трапляється лише раз.',
    solution: `Правильний квадрат: ${grid.map(r => r.join(' ')).join(' / ')}.`,
  }
}

// ── Набір головоломок для класу ──────────────────────────────────────────────
export function generatePuzzleSet(grade: number, count = 5): Puzzle[] {
  const p = PROFILES[grade] ?? PROFILES[1]
  const gens: Array<(i: number, p: Profile) => Puzzle> = [
    createSequence, createMachine, createBalance, createSymbols,
    p.emoji ? createLatin : createMagic,
  ]
  const out: Puzzle[] = []
  const order = shuffle(gens)
  for (let i = 0; i < count; i++) out.push(order[i % order.length](i, p))
  return out
}
