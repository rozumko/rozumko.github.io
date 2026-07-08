// Лінт practice-бандла public/questions/grade-*.json (без БД).
//
// Перевіряє:
//   - дублікати стемів (q+code) у межах класу та між класами
//   - topic заповнений і належить track (fail-closed таксономія)
//   - choice/truefalse: correct у межах options; інші типи — коректні структури
//   - артефакти генерації в поясненнях («... ні, ...», «Стоп:», обірвані думки)
//   - мовні маркери («Рівлик», «адрес» як русизм, варіант «Не знаю»)
//   - розподіл позиції правильної відповіді (перекіс > 40% — попередження)
//   - покриття: кожна пара track/topic × grade має ≥ MIN_PER_CELL питань
//
// Запуск:  cd backend && npx tsx scripts/lint-question-bank.ts

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { TOPICS_BY_TRACK } from '../src/lib/taxonomy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIN_PER_CELL = 6

interface BundleQ {
  id: string; q: string; code: string | null; type: string
  options: unknown; correct: number | null; explanation: string | null
  difficulty: string | null; track: string; topic: string | null; grade: number
}

const errors: string[] = []
const warns: string[] = []
const all: BundleQ[] = []
for (const g of [1, 2, 3, 4]) {
  const list = JSON.parse(readFileSync(join(__dirname, `../../public/questions/grade-${g}.json`), 'utf8')) as BundleQ[]
  for (const q of list) {
    if (q.grade !== g) errors.push(`grade-${g}: питання ${q.id} має grade=${q.grade}`)
    all.push(q)
  }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

// Дублікати
const seen = new Map<string, BundleQ>()
for (const q of all) {
  // Для нетекстових типів зміст живе в options (given/items/pairs) — включаємо їх у ключ
  const extra = q.type === 'choice' || q.type === 'truefalse' ? '' : JSON.stringify(q.options)
  const key = `${norm(q.q)}||${norm(q.code ?? '')}||${extra}`
  const prev = seen.get(key)
  if (prev) {
    const kind = prev.grade === q.grade ? `дубль у ${q.grade} кл.` : `крос-дубль (${prev.grade}/${q.grade} кл.)`
    ;(prev.grade === q.grade ? errors : warns).push(`${kind}: ${q.q.slice(0, 70)}`)
  } else {
    seen.set(key, q)
  }
}

// Таксономія + структури + мова
const ARTIFACT_RE = /(\.\.\.\s*ні,|…\s*ні,|Стоп:|— окре\b)/
const LANG_RE = /(Рівлик|домашній адрес)/
for (const q of all) {
  const where = `${q.grade} кл. «${q.q.slice(0, 50)}»`
  const validTopics = TOPICS_BY_TRACK[q.track as keyof typeof TOPICS_BY_TRACK]
  if (!validTopics) errors.push(`${where}: невідомий track «${q.track}»`)
  else if (!q.topic) errors.push(`${where}: topic не заповнено`)
  else if (!validTopics.includes(q.topic)) errors.push(`${where}: topic «${q.topic}» не належить track «${q.track}»`)

  if (q.type === 'choice' || q.type === 'truefalse') {
    if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${where}: options не масив ≥2`)
    else {
      if (q.correct == null || q.correct < 0 || q.correct >= q.options.length)
        errors.push(`${where}: correct=${q.correct} поза межами options`)
      const texts = (q.options as string[]).map(norm)
      if (new Set(texts).size !== texts.length) errors.push(`${where}: однакові варіанти відповіді`)
      if (texts.some(t => t === 'не знаю')) warns.push(`${where}: варіант «Не знаю»`)
    }
  }
  const blob = `${q.q} ${(Array.isArray(q.options) ? (q.options as string[]).join(' ') : '')} ${q.explanation ?? ''}`
  if (ARTIFACT_RE.test(q.explanation ?? '')) errors.push(`${where}: схоже на артефакт генерації в поясненні`)
  if (LANG_RE.test(blob)) errors.push(`${where}: мовний маркер (Рівлик/русизм)`)
  if (!q.explanation || q.explanation.trim().length < 10) warns.push(`${where}: немає пояснення`)
}

// Перекіс позиції правильної відповіді (choice)
const pos = new Map<number, number>()
let choiceCount = 0
for (const q of all) {
  if (q.type !== 'choice' || q.correct == null) continue
  choiceCount++
  pos.set(q.correct, (pos.get(q.correct) ?? 0) + 1)
}
for (const [p, n] of pos) {
  if (n / choiceCount > 0.4) warns.push(`позиція ${p} містить ${Math.round(n / choiceCount * 100)}% правильних відповідей — перекіс`)
}

// Покриття track/topic × grade
const matrix = new Map<string, number[]>()
for (const q of all) {
  const key = `${q.track}/${q.topic}`
  const arr = matrix.get(key) ?? [0, 0, 0, 0]
  arr[q.grade - 1]++
  matrix.set(key, arr)
}
console.log(`Питань: ${all.length}. Покриття (grade 1..4, мінімум ${MIN_PER_CELL}):`)
for (const [key, arr] of [...matrix.entries()].sort()) {
  const bad = arr.some(n => n < MIN_PER_CELL)
  console.log(`  ${bad ? '✗' : '✓'} ${key.padEnd(45)} ${arr.map(n => String(n).padStart(3)).join(' ')}`)
  if (bad) warns.push(`покриття ${key}: [${arr.join(', ')}] — є клітинки < ${MIN_PER_CELL}`)
}

const types = new Map<string, number>()
for (const q of all) types.set(q.type, (types.get(q.type) ?? 0) + 1)
console.log('Типи:', [...types.entries()].map(([t, n]) => `${t}=${n}`).join(', '))
console.log('Позиції правильних відповідей (choice):', [...pos.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}:${n}`).join(' '))

if (warns.length) { console.log(`\nПопередження (${warns.length}):`); for (const w of warns) console.log('  ⚠ ' + w) }
if (errors.length) { console.log(`\nПомилки (${errors.length}):`); for (const e of errors) console.log('  ✗ ' + e); process.exit(1) }
console.log('\nЛінт пройдено без помилок.')
