// Imports authored micro-lesson JSON (temp/authored-lessons) into micro_lessons.
//
//   cd backend
//   npx tsx scripts/import-authored-lessons.ts --dry-run     # validate + summary, no DB
//   npx tsx scripts/import-authored-lessons.ts               # writes drafts
//   npx tsx scripts/import-authored-lessons.ts ../temp/authored-lessons/info-g2.json
//
// Fail-closed: if ANY lesson is invalid, nothing is written. Every lesson lands
// as an editorial draft (child-invisible until admin publish + export:lessons).
// Idempotent: existing lesson ids are skipped, never overwritten.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadLessonFiles, validateAuthoredLesson, duplicateIds, toLessonRow } from './authored-lessons.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = join(__dirname, '../../temp/authored-lessons')

const DRY_RUN = process.argv.includes('--dry-run')
const targets = process.argv.slice(2).filter(a => a !== '--dry-run')
const { loaded, errors: structural } = loadLessonFiles(targets.length ? targets : [DEFAULT_DIR])

// 1. Validate everything up front — fail-closed.
const errors = [...structural]
for (const { file, index, lesson } of loaded) errors.push(...validateAuthoredLesson(file, index, lesson))
for (const id of duplicateIds(loaded)) errors.push(`повторюваний id уроку: «${id}»`)
if (errors.length) {
  console.error(`\n${errors.length} помилок — імпорт скасовано, у БД нічого не записано:\n`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
if (loaded.length === 0) { console.error('Не знайдено жодного уроку'); process.exit(1) }

// 2. Build rows and print a summary.
const rows = loaded.map(({ lesson }) => toLessonRow(lesson))
console.log(`Готово до імпорту: ${rows.length} уроків`)
for (const { id, content } of rows)
  console.log(`  ${id}: карток ${content.cards.length}, питань ${content.checkQuestions.length}`)

if (DRY_RUN) { console.log('\n--dry-run: у БД нічого не записано.'); process.exit(0) }

// 3. Skip existing ids, insert the rest as drafts + create-revision.
const { db } = await import('../src/db/index.js')
const { microLessons, microLessonRevisions } = await import('../src/db/schema.js')
const { lessonRevisionSnapshot } = await import('../src/routes/lesson-editorial.js')
const { inArray } = await import('drizzle-orm')

const existing = new Set((await db.select({ id: microLessons.id }).from(microLessons)
  .where(inArray(microLessons.id, rows.map(r => r.id)))).map(r => r.id))

let imported = 0
let skipped = 0
await db.transaction(async tx => {
  for (const { id, content } of rows) {
    if (existing.has(id)) { console.log(`${id}: вже існує — пропущено`); skipped++; continue }
    const [row] = await tx.insert(microLessons).values({
      id,
      title: content.title,
      cards: content.cards,
      videoUrl: content.videoUrl ?? null,
      checkQuestions: content.checkQuestions,
      status: 'draft',
      createdBy: 'import-authored-lessons',
      updatedBy: 'import-authored-lessons',
    }).returning()
    await tx.insert(microLessonRevisions).values({
      lessonId: row.id, editVersion: row.editVersion, action: 'create',
      snapshot: lessonRevisionSnapshot(row), changedBy: 'import-authored-lessons',
    })
    existing.add(id)
    imported++
  }
})

console.log(`\nІмпортовано чернеток: ${imported}; пропущено існуючих: ${skipped}.`)
process.exit(0)
