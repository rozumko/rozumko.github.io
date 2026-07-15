import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pathMapRevisions, pathMaps } from '../db/schema.js'

// Каталог навчальних шляхів для валідації path-progress. З 0033 джерело
// правди — таблиця path_maps: ручне дзеркалення фронтового path-data.ts
// у код бекенду більше не потрібне (цей клас дрейфу двічі ловив CI).
// Fail-closed: битий рядок або помилка БД → каталог відсутній → сабміт
// відхиляється, нічого не пишеться.

export interface CatalogPoint {
  unlockAfter: string[]
  requiredActivities: Record<string, number>
  /** Бонусні кроки (required: false): приймаються ДОДАТКОВО до required. */
  optionalActivities: Record<string, number>
  contentVersionActivities: string[]
}

export interface CatalogPath {
  grade: number
  version: number
  points: Record<string, CatalogPoint>
}

/** Pure-конвертація points jsonb → каталог; null для битої структури. */
export function catalogFromPoints(grade: number, rawPoints: unknown, version = 1): CatalogPath | null {
  if (!Number.isInteger(version) || version < 1) return null
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return null
  const points: Record<string, CatalogPoint> = {}

  for (const raw of rawPoints) {
    if (typeof raw !== 'object' || raw === null) return null
    const point = raw as Record<string, unknown>
    const id = typeof point.id === 'string' ? point.id : ''
    if (!id || points[id]) return null

    const unlockAfter = Array.isArray(point.unlockAfter) ? point.unlockAfter : null
    if (!unlockAfter || !unlockAfter.every((dep): dep is string => typeof dep === 'string')) return null

    if (!Array.isArray(point.activities)) return null
    const requiredActivities: Record<string, number> = {}
    const optionalActivities: Record<string, number> = {}
    const contentVersionActivities: string[] = []
    for (const rawStep of point.activities) {
      if (typeof rawStep !== 'object' || rawStep === null) return null
      const step = rawStep as Record<string, unknown>
      if (typeof step.required !== 'boolean') return null
      const stepId = typeof step.id === 'string' ? step.id : ''
      const version = Number.isInteger(step.version) && (step.version as number) >= 1
        ? (step.version as number) : 0
      if (!stepId || !version) return null
      const activityId = `path:${id}:${stepId}`
      ;(step.required ? requiredActivities : optionalActivities)[activityId] = version
      if (typeof step.activity === 'object' && step.activity !== null
        && (step.activity as Record<string, unknown>).kind === 'lesson') {
        contentVersionActivities.push(activityId)
      }
    }
    if (!Object.keys(requiredActivities).length) return null

    points[id] = { unlockAfter, requiredActivities, optionalActivities, contentVersionActivities }
  }

  // Кожен unlockAfter має резолвитись у точку цієї ж карти.
  for (const point of Object.values(points)) {
    if (!point.unlockAfter.every(dep => points[dep])) return null
  }
  return { grade, version, points }
}

export type PathCatalogLoader = (pathId: string, version?: number) => Promise<CatalogPath | null>
export type PathCatalogCandidatesLoader = (pathId: string) => Promise<CatalogPath[]>

// Короткий TTL-кеш: зміни з адмінки підхоплюються без рестарту, а сабміти
// класу за одним NAT не перетворюються на шторм однакових SELECT.
const CACHE_TTL_MS = 60_000
const catalogCache = new Map<string, { catalog: CatalogPath | null; expiresAt: number }>()

export const loadPathCatalog: PathCatalogLoader = async (pathId, version) => {
  if (typeof pathId !== 'string' || !/^grade-[1-4]$/.test(pathId)) return null
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) return null

  const cacheKey = `${pathId}@${version ?? 'current'}`
  const cached = catalogCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.catalog

  let catalog: CatalogPath | null = null
  try {
    const [row] = await db.select().from(pathMaps).where(eq(pathMaps.pathId, pathId)).limit(1)
    if (row && row.status === 'published') {
      if (version === undefined || version === row.version) {
        catalog = catalogFromPoints(row.grade, row.points, row.version)
      } else {
        const [revision] = await db.select({
          grade: pathMapRevisions.grade,
          version: pathMapRevisions.version,
          points: pathMapRevisions.points,
        }).from(pathMapRevisions).where(and(
          eq(pathMapRevisions.pathId, pathId),
          eq(pathMapRevisions.version, version),
        )).limit(1)
        if (revision) catalog = catalogFromPoints(revision.grade, revision.points, revision.version)
      }
    }
  } catch {
    // Помилка БД: не кешуємо, наступний сабміт спробує знову.
    return null
  }
  catalogCache.set(cacheKey, { catalog, expiresAt: Date.now() + CACHE_TTL_MS })
  return catalog
}

/** Legacy-client fallback: try every immutable revision when pathVersion is absent. */
export const loadPathCatalogCandidates: PathCatalogCandidatesLoader = async (pathId) => {
  if (typeof pathId !== 'string' || !/^grade-[1-4]$/.test(pathId)) return []
  try {
    const [row] = await db.select().from(pathMaps).where(eq(pathMaps.pathId, pathId)).limit(1)
    if (!row || row.status !== 'published') return []
    const revisions = await db.select({
      grade: pathMapRevisions.grade,
      version: pathMapRevisions.version,
      points: pathMapRevisions.points,
    }).from(pathMapRevisions)
      .where(eq(pathMapRevisions.pathId, pathId))
      .orderBy(desc(pathMapRevisions.version))

    const seen = new Set<number>()
    const candidates: CatalogPath[] = []
    for (const source of [{ grade: row.grade, version: row.version, points: row.points }, ...revisions]) {
      if (seen.has(source.version)) continue
      seen.add(source.version)
      const catalog = catalogFromPoints(source.grade, source.points, source.version)
      if (catalog) candidates.push(catalog)
    }
    return candidates
  } catch {
    return []
  }
}

/** Скидання кешу після редагування карти в адмінці (зріз 4b). */
export function invalidatePathCatalogCache() {
  catalogCache.clear()
}
