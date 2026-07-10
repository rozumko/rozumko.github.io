import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { homePathEvents, homePathProgress } from '../db/schema.js'

export interface ClientPathActivityResult {
  activityId: string
  activityVersion: number
  trust: 'client-unverified'
  stars: number
  correct: number
  total: number
  completedAt: string
}

export interface PathCompletionBody {
  pathId: string
  pointId: string
  results: ClientPathActivityResult[]
}

interface CatalogPoint {
  unlockAfter: string[]
  requiredActivities: Record<string, number>
}

interface CatalogPath {
  grade: number
  points: Record<string, CatalogPoint>
}

// Backend allowlist for persisted progress. The browser cannot invent point or
// activity versions. Keep this catalog aligned with features/path/path-data.ts.
export const HOME_PATH_CATALOG: Record<string, CatalogPath> = {
  'grade-2': {
    grade: 2,
    points: {
      'g2-info-start': {
        unlockAfter: [],
        requiredActivities: { 'path:g2-info-start:infosort': 1 },
      },
      'g2-ct-multisort': {
        unlockAfter: ['g2-info-start'],
        requiredActivities: { 'path:g2-ct-multisort:multisort': 1 },
      },
      'g2-fact-opinion': {
        unlockAfter: ['g2-info-start'],
        requiredActivities: { 'path:g2-fact-opinion:fact-opinion-l2': 1 },
      },
      'g2-assembly': {
        unlockAfter: ['g2-info-start'],
        requiredActivities: { 'path:g2-assembly:assembly-hardware': 1 },
      },
      'g2-ct-patterns': {
        unlockAfter: ['g2-ct-multisort'],
        requiredActivities: { 'path:g2-ct-patterns:patterns-puzzles': 1 },
      },
      'g2-ai-perception': {
        unlockAfter: ['g2-fact-opinion'],
        requiredActivities: { 'path:g2-ai-perception:ai-perception-mission': 1 },
      },
      'g2-digital-safety': {
        unlockAfter: ['g2-fact-opinion'],
        requiredActivities: { 'path:g2-digital-safety:digital-safety-mission': 1 },
      },
      'g2-ct-algorithms': {
        unlockAfter: ['g2-ct-patterns'],
        requiredActivities: {
          'path:g2-ct-algorithms:algorithms-mission': 1,
          'path:g2-ct-algorithms:algorithms-puzzles': 1,
        },
      },
      'g2-final': {
        unlockAfter: ['g2-ct-algorithms', 'g2-ai-perception', 'g2-digital-safety'],
        requiredActivities: { 'path:g2-final:final-three-tracks': 1 },
      },
    },
  },
}

export type CompletionValidation =
  | {
      ok: true
      point: CatalogPoint
      eventKey: string
      sessionStars: number
      clientCompletedAt: Date
      results: ClientPathActivityResult[]
    }
  | { ok: false; error: string }

export function validatePathCompletion(
  profileGrade: number,
  body: PathCompletionBody,
  now = new Date(),
): CompletionValidation {
  const path = HOME_PATH_CATALOG[body.pathId]
  if (!path) return { ok: false, error: 'Невідомий навчальний шлях' }
  if (path.grade !== profileGrade) return { ok: false, error: 'Шлях не відповідає класу профілю' }

  const point = path.points[body.pointId]
  if (!point) return { ok: false, error: 'Невідома точка навчального шляху' }
  if (!Array.isArray(body.results) || body.results.length === 0 || body.results.length > 8) {
    return { ok: false, error: 'Некоректний набір результатів активностей' }
  }

  const required = point.requiredActivities
  if (body.results.length !== Object.keys(required).length) {
    return { ok: false, error: 'Не всі обовʼязкові активності завершено' }
  }

  const seen = new Set<string>()
  const normalized: ClientPathActivityResult[] = []
  for (const result of body.results) {
    if (seen.has(result.activityId)) return { ok: false, error: 'Активність повторюється' }
    seen.add(result.activityId)
    if (required[result.activityId] !== result.activityVersion) {
      return { ok: false, error: 'Невідома активність або версія' }
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
  const sessionStars = Math.round(normalized.reduce((sum, result) => sum + result.stars, 0) / normalized.length)
  const eventKey = createHash('sha256')
    .update(JSON.stringify({ pathId: body.pathId, pointId: body.pointId, results: normalized.map(result => ({
      activityId: result.activityId,
      activityVersion: result.activityVersion,
      completedAt: result.completedAt,
    })) }))
    .digest('hex')

  return {
    ok: true,
    point,
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
