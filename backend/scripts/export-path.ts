// Export authored learning-path revisions as static GitHub Pages bundles.
//
// Run:    cd backend && npm run export:path   (reads DATABASE_URL from .env)
// Writes: ../public/path/<pathId>.json        (committed to the repository)
//
// path_maps is the authored source of truth. Only published maps with valid,
// published lesson references are exported. Invalid data fails the whole
// export instead of reaching children; the browser keeps a built-in fallback.

import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { microLessons, missions, pathMaps } from '../src/db/schema.js'
import { catalogFromPoints } from '../src/routes/path-catalog.js'
import { pathMapLessonIds, pathMapMissionIds, validatePathMapPoints } from '../src/routes/path-map-validation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../../public/path')

const rows = await db.select().from(pathMaps).where(eq(pathMaps.status, 'published'))
if (rows.length === 0) {
  throw new Error('No published path maps: the export role cannot read public.path_maps (RLS/GRANT) or published content is gone.')
}
const publishedLessons = new Set((await db.select({ id: microLessons.id }).from(microLessons)
  .where(and(isNotNull(microLessons.publishedVersion), ne(microLessons.status, 'archived')))).map(lesson => lesson.id))
const publishedMissions = new Set((await db.select({ id: missions.id }).from(missions)
  .where(and(isNotNull(missions.publishedVersion), ne(missions.status, 'archived')))).map(mission => mission.id))

mkdirSync(OUT_DIR, { recursive: true })
for (const row of rows) {
  const points = validatePathMapPoints(row.points)
  if (!catalogFromPoints(row.grade, points, row.version)) {
    throw new Error(`Path ${row.pathId} failed runtime conversion; export stopped`)
  }
  for (const lessonId of pathMapLessonIds(points)) {
    if (!publishedLessons.has(lessonId)) {
      throw new Error(`Path ${row.pathId} references unpublished lesson ${lessonId}`)
    }
  }
  for (const missionId of pathMapMissionIds(points)) {
    if (!publishedMissions.has(missionId)) {
      throw new Error(`Path ${row.pathId} references unpublished mission ${missionId}`)
    }
  }
  const bundle = {
    pathId: row.pathId,
    grade: row.grade,
    title: row.title,
    version: row.version,
    points,
  }
  writeFileSync(join(OUT_DIR, `${row.pathId}.json`), JSON.stringify(bundle, null, 1) + '\n', 'utf8')
  console.log(`${row.pathId}.json: v${row.version}, ${(row.points as unknown[]).length} points`)
}

console.log(`Exported ${rows.length} maps to public/path/`)
process.exit(0)
