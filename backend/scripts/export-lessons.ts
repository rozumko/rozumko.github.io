// Експорт published мікро-уроків у статичний бандл для GitHub Pages.
//
// Запуск:  cd backend && npm run export:lessons   (читає DATABASE_URL з .env)
// Пише:    ../public/lessons/<id>.json            (комітиться в репо)
//
// Джерело правди — БД (адмін-панель, вкладка «Уроки»). Після редагування
// перезапустіть експорт і закомітьте оновлений бандл. Ключі перевірочних
// питань у бандлі — норма: мікро-квіз формувальний і навмисно віддає їх
// у браузер для локального фідбеку (як practice-пул питань).
// A newer draft does not replace the last published snapshot. Archived lessons
// are removed from the output directory on the next export.

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { and, isNotNull, ne } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { microLessons } from '../src/db/schema.js'
import { contentFromPublishedSnapshot } from '../src/routes/lesson-editorial.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../../public/lessons')

const rows = await db
  .select()
  .from(microLessons)
  .where(and(isNotNull(microLessons.publishedVersion), ne(microLessons.status, 'archived')))

if (rows.length === 0) {
  throw new Error('No published lessons: the export role cannot read public.micro_lessons (RLS/GRANT) or published content is gone.')
}
mkdirSync(OUT_DIR, { recursive: true })
const exportedFiles = new Set(rows.map(row => `${row.id}.json`))
for (const file of readdirSync(OUT_DIR)) {
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file) && !exportedFiles.has(file)) {
    unlinkSync(join(OUT_DIR, file))
    console.log(`${file}: removed stale or archived export`)
  }
}
for (const row of rows) {
  // Той самий валідатор, що на вході CRUD: битий рядок у БД валить експорт,
  // а не тихо їде дітям.
  const content = contentFromPublishedSnapshot(row.publishedSnapshot)
  const lesson = {
    id: row.id,
    version: row.publishedVersion,
    title: content.title,
    cards: content.cards,
    ...(content.videoUrl ? { videoUrl: content.videoUrl } : {}),
    check: content.checkQuestions,
  }
  const file = join(OUT_DIR, `${row.id}.json`)
  writeFileSync(file, JSON.stringify(lesson, null, 2) + '\n', 'utf8')
  console.log(`${row.id}.json: v${row.publishedVersion}, карток ${content.cards.length}, питань ${content.checkQuestions.length}`)
}

console.log(`Разом: ${rows.length} уроків експортовано в public/lessons/`)
process.exit(0)
