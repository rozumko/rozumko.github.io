// Експорт practice-пулу в статичний бандл для GitHub Pages.
//
// Запуск:  cd backend && npm run export:questions   (читає DATABASE_URL з .env)
// Пише:    ../public/questions/grade-{1..4}.json    (комітиться в репо)
//
// Джерело правди — БД (адмін-панель). Після редагування контенту перезапустіть
// експорт і закомітьте оновлений бандл. Ключі відповідей у бандлі — норма:
// practice-пул і так навмисно віддає їх у браузер для локального фідбеку.
// Олімпіадні питання сюди потрапити не можуть: WHERE isOlympiad=false у запиті
// + fail-closed guard у sanitizeForStaticBundle (див. lib/practice-export.ts).
// Так само не потрапляє серверно-оцінюваний демо-пакет (meta.purpose):
// він ділить канал olympiad_training, але його ключі мають лишатися приватними.

import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { and, count, eq, arrayContains, sql } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { questions } from '../src/db/schema.js'
import { assertQuestionsTableReadable, sanitizeForStaticBundle, groupByGrade } from '../src/lib/practice-export.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../../public/questions')

const rows = await db
  .select({
    id:          questions.id,
    q:           questions.q,
    code:        questions.code,
    type:        questions.type,
    options:     questions.options,
    correct:     questions.correct,
    explanation: questions.explanation,
    img:         questions.img,
    imageAlt:    questions.imageAlt,
    difficulty:  questions.difficulty,
    track:       questions.track,
    topic:       questions.topic,
    conceptKey:  questions.conceptKey,
    progressionBand: questions.progressionBand,
    version:     questions.version,
    grade:       questions.grade,
    isOlympiad:  questions.isOlympiad,
    channels:    questions.channels,
    meta:        questions.meta,
  })
  .from(questions)
  .where(and(
    eq(questions.isOlympiad, false),
    eq(questions.editorialStatus, 'published'),
    arrayContains(questions.channels, ['olympiad_training']),
    // The server-scored demo package shares this channel but must never reach
    // a static file: its answer keys are the whole point of scoring on the server.
    sql`${questions.meta}->>'purpose' IS DISTINCT FROM 'olympiad-demo'`,
  ))

if (rows.length === 0) {
  // Refilling a delivery channel is a legitimate editorial state, so an empty
  // result only fails the export when the role cannot see the table at all.
  const [visible] = await db.select({ total: count() }).from(questions)
  assertQuestionsTableReadable(visible?.total ?? 0)
  console.warn('No published practice questions in the olympiad_training channel — writing empty bundles.')
}
const bundle = sanitizeForStaticBundle(rows)
const grouped = groupByGrade(bundle)

mkdirSync(OUT_DIR, { recursive: true })
for (const [grade, list] of grouped) {
  const file = join(OUT_DIR, `grade-${grade}.json`)
  writeFileSync(file, JSON.stringify(list, null, 1) + '\n', 'utf8')
  console.log(`grade-${grade}.json: ${list.length} питань`)
}

console.log(`Разом: ${bundle.length} practice-питань експортовано в public/questions/`)
process.exit(0)
