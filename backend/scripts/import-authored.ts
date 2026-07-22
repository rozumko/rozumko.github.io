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
import { loadFiles, validateAuthored, toNewQuestion } from './authored-questions.js'
import type { NewQuestion } from '../src/db/schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = join(__dirname, '../../temp/authored')

const DRY_RUN = process.argv.includes('--dry-run')
const targets = process.argv.slice(2).filter(a => a !== '--dry-run')
const { loaded, errors: structural } = loadFiles(targets.length ? targets : [DEFAULT_DIR])

// 1. Validate everything up front — fail-closed.
const errors = [...structural]
for (const { file, index, q } of loaded) errors.push(...validateAuthored(file, index, q))
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

// 3. Dedup against existing non-olympiad questions, then insert.
const { db } = await import('../src/db/index.js')
const { questions } = await import('../src/db/schema.js')
const { eq } = await import('drizzle-orm')

const existing = await db
  .select({ q: questions.q, grade: questions.grade })
  .from(questions)
  .where(eq(questions.isOlympiad, false))
const seen = new Set(existing.map(r => `${r.grade}::${r.q.trim()}`))

let inserted = 0
let skipped = 0
for (const row of rows) {
  const key = `${row.grade}::${(row.q as string).trim()}`
  if (seen.has(key)) { skipped++; continue }
  await db.insert(questions).values(row)
  seen.add(key)
  inserted++
}

console.log(`\nВставлено: ${inserted}, пропущено (вже існують): ${skipped}`)
process.exit(0)
