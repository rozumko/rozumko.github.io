import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pathMaps } from '../db/schema.js'

// Каталог навчальних шляхів для валідації path-progress. З 0033 джерело
// правди — таблиця path_maps: ручне дзеркалення фронтового path-data.ts
// у код бекенду більше не потрібне (цей клас дрейфу двічі ловив CI).
// Fail-closed: битий рядок або помилка БД → каталог відсутній → сабміт
// відхиляється, нічого не пишеться.

export interface CatalogPoint {
  unlockAfter: string[]
  requiredActivities: Record<string, number>
}

export interface CatalogPath {
  grade: number
  points: Record<string, CatalogPoint>
}

/** Pure-конвертація points jsonb → каталог; null для битої структури. */
export function catalogFromPoints(grade: number, rawPoints: unknown): CatalogPath | null {
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
    for (const rawStep of point.activities) {
      if (typeof rawStep !== 'object' || rawStep === null) return null
      const step = rawStep as Record<string, unknown>
      if (step.required !== true) continue
      const stepId = typeof step.id === 'string' ? step.id : ''
      const version = Number.isInteger(step.version) && (step.version as number) >= 1
        ? (step.version as number) : 0
      if (!stepId || !version) return null
      requiredActivities[`path:${id}:${stepId}`] = version
    }
    if (!Object.keys(requiredActivities).length) return null

    points[id] = { unlockAfter, requiredActivities }
  }

  // Кожен unlockAfter має резолвитись у точку цієї ж карти.
  for (const point of Object.values(points)) {
    if (!point.unlockAfter.every(dep => points[dep])) return null
  }
  return { grade, points }
}

export type PathCatalogLoader = (pathId: string) => Promise<CatalogPath | null>

// Короткий TTL-кеш: зміни з адмінки підхоплюються без рестарту, а сабміти
// класу за одним NAT не перетворюються на шторм однакових SELECT.
const CACHE_TTL_MS = 60_000
const catalogCache = new Map<string, { catalog: CatalogPath | null; expiresAt: number }>()

export const loadPathCatalog: PathCatalogLoader = async (pathId) => {
  if (typeof pathId !== 'string' || !/^grade-[1-4]$/.test(pathId)) return null

  const cached = catalogCache.get(pathId)
  if (cached && cached.expiresAt > Date.now()) return cached.catalog

  let catalog: CatalogPath | null = null
  try {
    const [row] = await db.select().from(pathMaps).where(eq(pathMaps.pathId, pathId)).limit(1)
    if (row && row.status === 'published') {
      catalog = catalogFromPoints(row.grade, row.points)
    }
  } catch {
    // Помилка БД: не кешуємо, наступний сабміт спробує знову.
    return null
  }
  catalogCache.set(pathId, { catalog, expiresAt: Date.now() + CACHE_TTL_MS })
  return catalog
}

/** Скидання кешу після редагування карти в адмінці (зріз 4b). */
export function invalidatePathCatalogCache() {
  catalogCache.clear()
}
