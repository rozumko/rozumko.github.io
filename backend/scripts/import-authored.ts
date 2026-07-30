// Imports authored question JSON (temp/authored) into the question bank.
//
//   cd backend
//   npx tsx scripts/import-authored.ts --dry-run     # validate + summary, no DB
//   npx tsx scripts/import-authored.ts               # writes to DB
//   npx tsx scripts/import-authored.ts ../temp/authored/information-g1.json
//
// Fail-closed: if ANY question is invalid, nothing is written. All rows land as
// isOlympiad=false, channels=[class_game,path,olympiad_training], editorial
// status=draft (default) — children see them only after admin publish.
// Idempotent: dedup by exact grade+q among non-olympiad questions.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadFiles, validateAuthored, validateAuthoredDemoPackage, toNewQuestion } from './authored-questions.js'
import type { NewQuestion } from '../src/db/schema.js'
import { olympiadQuestionFingerprint } from '../src/lib/olympiad-content-policy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = join(__dirname, '../../temp/authored')

const DRY_RUN = process.argv.includes('--dry-run')
const targets = process.argv.slice(2).filter(a => a !== '--dry-run')
const { loaded, errors: structural } = loadFiles(targets.length ? targets : [DEFAULT_DIR])

// 1. Validate everything up front — fail-closed.
const errors = [...structural]
for (const { file, index, q } of loaded) errors.push(...validateAuthored(file, index, q))
errors.push(...validateAuthoredDemoPackage(loaded))
if (errors.length) {
  console.error(`\n${errors.length} помилок — імпорт скасовано, у БД нічого не записано:\n`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
if (loaded.length === 0) { console.error('Не знайдено жодного питання'); process.exit(1) }

// 2. Build rows and print a per-track/topic summary.
const rows: NewQuestion[] = loaded.map(({ q, file }) => toNewQuestion(q, file))
const byTopic = new Map<string, number>()
for (const r of rows) {
  const key = `${r.track}/${r.topic ?? '∅'} · кл.${r.grade}`
  byTopic.set(key, (byTopic.get(key) ?? 0) + 1)
}
console.log(`Готово до імпорту: ${rows.length} питань`)
for (const [key, n] of [...byTopic.entries()].sort()) console.log(`  ${key}: ${n}`)

if (DRY_RUN) { console.log('\n--dry-run: у БД нічого не записано.'); process.exit(0) }

// 3. Deduplicate by the full public stimulus. Equal stems with different code,
// options or images are valid variants; equal stimuli with different keys are
// a blocking editorial conflict.
const { db } = await import('../src/db/index.js')
const { questions } = await import('../src/db/schema.js')
const { eq } = await import('drizzle-orm')

const existing = await db
  .select({
    id: questions.id,
    q: questions.q,
    code: questions.code,
    type: questions.type,
    options: questions.options,
    img: questions.img,
    correct: questions.correct,
    grade: questions.grade,
    meta: questions.meta,
  })
  .from(questions)
  .where(eq(questions.isOlympiad, false))
function answerKey(row: Pick<NewQuestion, 'type' | 'options' | 'correct'>): string {
  const options = row.options && typeof row.options === 'object'
    ? row.options as Record<string, unknown>
    : {}
  return JSON.stringify({
    type: row.type,
    correct: row.correct,
    answer: options.answer,
    correctAnswers: options.correctAnswers,
    correctOrder: options.correctOrder,
    pairs: options.pairs,
  })
}

function stimulusKey(row: {
  id?: string
  grade?: number | null
  q?: string | null
  code?: string | null
  type?: NewQuestion['type']
  options?: unknown
  img?: string | null
  meta?: Record<string, unknown> | null
}): string {
  const purpose = row.meta?.purpose === 'olympiad-demo' ? 'olympiad-demo' : 'general'
  return `${purpose}::${row.grade ?? 'no-grade'}::${olympiadQuestionFingerprint({
    id: row.id ?? 'authored',
    q: row.q ?? '',
    code: row.code,
    type: (row.type ?? 'choice') as NonNullable<NewQuestion['type']>,
    options: row.options,
    img: row.img,
  })}`
}

const seen = new Map(existing.map(row => [stimulusKey(row), answerKey(row)]))
const pending: NewQuestion[] = []
let skipped = 0
const conflicts: string[] = []
for (const row of rows) {
  const key = stimulusKey(row)
  const existingKey = seen.get(key)
  const nextKey = answerKey(row)
  if (existingKey === undefined) {
    pending.push(row)
    seen.set(key, nextKey)
  } else if (existingKey === nextKey) {
    skipped++
  } else {
    conflicts.push(`${row.grade} клас: "${String(row.q).slice(0, 100)}"`)
  }
}
if (conflicts.length) {
  console.error('\nImport cancelled: identical public stimuli have conflicting answer keys:')
  for (const conflict of conflicts) console.error(`  - ${conflict}`)
  process.exit(1)
}

let inserted = 0
for (const row of pending) {
  await db.insert(questions).values(row)
  inserted++
}

console.log(`\nВставлено: ${inserted}, пропущено (вже існують): ${skipped}`)
process.exit(0)
