// Експорт published мікро-уроків у статичний бандл для GitHub Pages.
//
// Запуск:  cd backend && npm run export:lessons   (читає DATABASE_URL з .env)
// Пише:    ../public/lessons/<id>.json            (комітиться в репо)
//
// Джерело правди — БД (адмін-панель, вкладка «Уроки»). Після редагування
// перезапустіть експорт і закомітьте оновлений бандл. Ключі перевірочних
// питань у бандлі — норма: мікро-квіз формувальний і навмисно віддає їх
// у браузер для локального фідбеку (як practice-пул питань).
// Draft/archived уроки в бандл не потрапляють: WHERE status='published'.

import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { microLessons } from '../src/db/schema.js'
import { normalizeLessonContent } from '../src/routes/lesson-validation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../../public/lessons')

const rows = await db
  .select()
  .from(microLessons)
  .where(eq(microLessons.status, 'published'))

mkdirSync(OUT_DIR, { recursive: true })
for (const row of rows) {
  // Той самий валідатор, що на вході CRUD: битий рядок у БД валить експорт,
  // а не тихо їде дітям.
  const content = normalizeLessonContent({
    title: row.title,
    cards: row.cards,
    videoUrl: row.videoUrl,
    checkQuestions: row.checkQuestions,
  })
  const lesson = {
    id: row.id,
    version: row.version,
    title: content.title,
    cards: content.cards,
    ...(content.videoUrl ? { videoUrl: content.videoUrl } : {}),
    check: content.checkQuestions,
  }
  const file = join(OUT_DIR, `${row.id}.json`)
  writeFileSync(file, JSON.stringify(lesson, null, 2) + '\n', 'utf8')
  console.log(`${row.id}.json: v${row.version}, карток ${content.cards.length}, питань ${content.checkQuestions.length}`)
}

console.log(`Разом: ${rows.length} уроків експортовано в public/lessons/`)
process.exit(0)
