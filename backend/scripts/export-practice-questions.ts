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

import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { and, eq, arrayContains } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { questions } from '../src/db/schema.js'
import { sanitizeForStaticBundle, groupByGrade } from '../src/lib/practice-export.js'

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
  })
  .from(questions)
  .where(and(
    eq(questions.isOlympiad, false),
    eq(questions.editorialStatus, 'published'),
    arrayContains(questions.channels, ['olympiad_training']),
  ))

if (rows.length === 0) {
  throw new Error('No published practice questions: the export role cannot read public.questions (RLS/GRANT) or published content is gone.')
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
