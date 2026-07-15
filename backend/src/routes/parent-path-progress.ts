import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { homePathEvents, homePathProgress } from '../db/schema.js'
import type { CatalogPath, CatalogPoint } from './path-catalog.js'

export interface ClientPathActivityResult {
  activityId: string
  activityVersion: number
  /** Exact external content revision (for example micro_lesson.version). */
  contentVersion?: number
  trust: 'client-unverified'
  stars: number
  correct: number
  total: number
  completedAt: string
}

export interface PathCompletionBody {
  pathId: string
  /** Static bundle revision. Optional only for legacy clients deployed before 0034. */
  pathVersion?: number
  pointId: string
  results: ClientPathActivityResult[]
}

// З 0033 каталог шляхів живе в БД (path_maps, seed — features/path/path-data.ts)
// і завантажується через ./path-catalog.js. Ручного дзеркала фронтового
// path-data.ts у коді бекенду більше немає — цей клас дрейфу двічі ловив CI.

export type CompletionValidation =
  | {
      ok: true
      point: CatalogPoint
      pathVersion: number
      eventKey: string
      sessionStars: number
      clientCompletedAt: Date
      results: ClientPathActivityResult[]
    }
  | { ok: false; error: string }

export function validatePathCompletion(
  path: CatalogPath | null,
  profileGrade: number,
  body: PathCompletionBody,
  now = new Date(),
): CompletionValidation {
  if (!path) return { ok: false, error: 'Невідомий навчальний шлях' }
  if (path.grade !== profileGrade) return { ok: false, error: 'Шлях не відповідає класу профілю' }
  if (body.pathVersion !== undefined && body.pathVersion !== path.version) {
    return { ok: false, error: 'Версія навчального шляху не збігається' }
  }

  const point = path.points[body.pointId]
  if (!point) return { ok: false, error: 'Невідома точка навчального шляху' }
  if (!Array.isArray(body.results) || body.results.length === 0 || body.results.length > 8) {
    return { ok: false, error: 'Некоректний набір результатів активностей' }
  }

  // Батч = усі required + будь-яка підмножина бонусних (required: false).
  const required = point.requiredActivities
  const optional = point.optionalActivities
  const submitted = new Set(body.results.map(result => result.activityId))
  if (Object.keys(required).some(activityId => !submitted.has(activityId))) {
    return { ok: false, error: 'Не всі обовʼязкові активності завершено' }
  }

  const seen = new Set<string>()
  const normalized: ClientPathActivityResult[] = []
  for (const result of body.results) {
    if (seen.has(result.activityId)) return { ok: false, error: 'Активність повторюється' }
    seen.add(result.activityId)
    const expectedVersion = required[result.activityId] ?? optional[result.activityId]
    if (expectedVersion !== result.activityVersion) {
      return { ok: false, error: 'Невідома активність або версія' }
    }
    if (point.contentVersionActivities.includes(result.activityId)
      && result.contentVersion === undefined) {
      return { ok: false, error: 'Для уроку потрібна версія контенту' }
    }
    if (result.contentVersion !== undefined
      && (!Number.isInteger(result.contentVersion) || result.contentVersion < 1 || result.contentVersion > 1_000_000)) {
      return { ok: false, error: 'Некоректна версія контенту' }
    }
    if (result.trust !== 'client-unverified') {
      return { ok: false, error: 'Недопустима межа довіри результату' }
    }
    if (!Number.isInteger(result.stars) || result.stars < 0 || result.stars > 3) {
      return { ok: false, error: 'Некоректна кількість зірок' }
    }
    if (!Number.isInteger(result.correct) || !Number.isInteger(result.total)
      || result.correct < 0 || result.total < 0 || result.correct > result.total) {
      return { ok: false, error: 'Некоректний підсумок активності' }
    }
    const completedAt = new Date(result.completedAt)
    if (!Number.isFinite(completedAt.getTime()) || completedAt.getTime() > now.getTime() + 10 * 60_000) {
      return { ok: false, error: 'Некоректний час завершення' }
    }
    normalized.push({ ...result, completedAt: completedAt.toISOString() })
  }

  normalized.sort((a, b) => a.activityId.localeCompare(b.activityId))
  const latest = normalized.reduce((a, b) => a.completedAt >= b.completedAt ? a : b)
  // Зірки точки — лише з обовʼязкових кроків: бонус «за бажанням» не має
  // ані знижувати результат за спробу, ані бути обхідним шляхом до зірок.
  const requiredResults = normalized.filter(result => required[result.activityId] !== undefined)
  const sessionStars = Math.round(requiredResults.reduce((sum, result) => sum + result.stars, 0) / requiredResults.length)
  const eventKey = createHash('sha256')
    .update(JSON.stringify({ pathId: body.pathId, pathVersion: path.version, pointId: body.pointId, results: normalized.map(result => ({
      activityId: result.activityId,
      activityVersion: result.activityVersion,
      contentVersion: result.contentVersion,
      completedAt: result.completedAt,
    })) }))
    .digest('hex')

  return {
    ok: true,
    point,
    pathVersion: path.version,
    eventKey,
    sessionStars,
    clientCompletedAt: new Date(latest.completedAt),
    results: normalized,
  }
}

export function hasPathPrerequisites(point: CatalogPoint, completedPointIds: Iterable<string>): boolean {
  const completed = new Set(completedPointIds)
  return point.unlockAfter.every(pointId => completed.has(pointId))
}

export interface PathProgressView {
  pointId: string
  status: 'completed'
  bestStars: number
  attempts: number
  updatedAt: Date
}

export interface PathProgressStore {
  list(childProfileId: string, pathId: string): Promise<PathProgressView[]>
  save(input: {
    childProfileId: string
    pathId: string
    pathVersion: number
    pointId: string
    eventKey: string
    sessionStars: number
    clientCompletedAt: Date
    results: ClientPathActivityResult[]
  }): Promise<{ progress: PathProgressView; duplicate: boolean }>
}

const progressProjection = {
  pointId: homePathProgress.pointId,
  status: homePathProgress.status,
  bestStars: homePathProgress.bestStars,
  attempts: homePathProgress.attempts,
  updatedAt: homePathProgress.updatedAt,
}

export const drizzlePathProgressStore: PathProgressStore = {
  async list(childProfileId, pathId) {
    return db.select(progressProjection).from(homePathProgress)
      .where(and(eq(homePathProgress.childProfileId, childProfileId), eq(homePathProgress.pathId, pathId)))
  },

  async save(input) {
    return db.transaction(async tx => {
      const now = new Date()
      const inserted = await tx.insert(homePathEvents).values({
        childProfileId: input.childProfileId,
        eventKey: input.eventKey,
        pathId: input.pathId,
        pathVersion: input.pathVersion,
        pointId: input.pointId,
        activityResults: input.results,
        trust: 'client-unverified',
        clientCompletedAt: input.clientCompletedAt,
      }).onConflictDoNothing({
        target: [homePathEvents.childProfileId, homePathEvents.eventKey],
      }).returning({ id: homePathEvents.id })

      if (!inserted.length) {
        const [progress] = await tx.select(progressProjection).from(homePathProgress).where(and(
          eq(homePathProgress.childProfileId, input.childProfileId),
          eq(homePathProgress.pathId, input.pathId),
          eq(homePathProgress.pointId, input.pointId),
        )).limit(1)
        if (!progress) throw new Error('Idempotent path event exists without progress aggregate')
        return { progress, duplicate: true }
      }

      const [progress] = await tx.insert(homePathProgress).values({
        childProfileId: input.childProfileId,
        pathId: input.pathId,
        pointId: input.pointId,
        bestStars: input.sessionStars,
        attempts: 1,
        lastCompletedAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [homePathProgress.childProfileId, homePathProgress.pathId, homePathProgress.pointId],
        set: {
          bestStars: sql`GREATEST(${homePathProgress.bestStars}, ${input.sessionStars})`,
          attempts: sql`${homePathProgress.attempts} + 1`,
          lastCompletedAt: now,
          updatedAt: now,
        },
      }).returning(progressProjection)

      return { progress, duplicate: false }
    })
  },
}
