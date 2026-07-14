// Експорт структури навчальних шляхів у статичний бандл для GitHub Pages.
//
// Запуск:  cd backend && npm run export:path   (читає DATABASE_URL з .env)
// Пише:    ../public/path/<pathId>.json        (комітиться в репо)
//
// Джерело правди — path_maps у БД (0033; редактор в адмінці — зріз 4b).
// Дитячі сторінки читатимуть бандл (зріз 4b) з фолбеком на вбудовану копію
// features/path/path-data.ts. Експортуються лише published-карти.
// Битий рядок валить експорт (той самий catalogFromPoints, що на валідації),
// а не тихо їде дітям.

import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { pathMaps } from '../src/db/schema.js'
import { catalogFromPoints } from '../src/routes/path-catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../../public/path')

const rows = await db.select().from(pathMaps).where(eq(pathMaps.status, 'published'))

mkdirSync(OUT_DIR, { recursive: true })
for (const row of rows) {
  if (!catalogFromPoints(row.grade, row.points)) {
    throw new Error(`Карта ${row.pathId} не проходить структурну валідацію — експорт зупинено`)
  }
  const bundle = {
    pathId: row.pathId,
    grade: row.grade,
    title: row.title,
    version: row.version,
    points: row.points,
  }
  writeFileSync(join(OUT_DIR, `${row.pathId}.json`), JSON.stringify(bundle, null, 1) + '\n', 'utf8')
  console.log(`${row.pathId}.json: v${row.version}, точок ${(row.points as unknown[]).length}`)
}

console.log(`Разом: ${rows.length} карт експортовано в public/path/`)
process.exit(0)
