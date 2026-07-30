import type { FastifyInstance } from 'fastify'
import { eq, desc, count, and, asc, inArray, ilike, or, sql, arrayContains, isNotNull, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, questionRevisions, accessCodes, attempts, attemptQuestions, appUsers, olympiadEvents, eventQuestions, schoolSessions, schoolSessionQuestions, homeLeads, homeEntitlements, homeEntitlementEvents, homeParentAccounts, homePathProgress, missions, missionRevisions, microLessons, microLessonRevisions, pathMapRevisions, pathMaps, contentPublications, homeFunnelCounters, type QuestionChannel, type QuestionTrack } from '../db/schema.js'
import {
  analyzeDemoCoverage,
  createSeededDemoRandom,
  pickDemoQuestionSet,
} from './olympiad-demo-validation.js'
import { normalizeLessonSlug, normalizeLessonStatus, normalizeLessonContent, lessonContentChanged } from './lesson-validation.js'
import { contentFromLessonRevision, lessonPublishedSnapshot, lessonRevisionSnapshot } from './lesson-editorial.js'
import { EDITABLE_MISSION_KINDS, missionPublishedSnapshot, missionSnapshot, normalizeEditableMission, normalizeMissionSlug, normalizeMissionStatus, type NormalizedMissionInput } from './mission-editorial.js'
import { validatePathMapPoints, bumpChangedStepVersions, pathMapLessonIds, pathMapMissionIds, type PathPointInput } from './path-map-validation.js'
import { invalidatePathCatalogCache } from './path-catalog.js'
import { ENTITLEMENT_STATUSES, normalizeEntitlementStatus, applyEntitlementChange } from './home-entitlement.js'
import { summarizeFunnel } from './home-funnel.js'
import { requireAdmin } from '../lib/auth.js'
import { pageInfo, pageRange, paginationProperties, paginationQuerystring } from '../lib/pagination.js'
import { assertQuestionsBelongToGrade, normalizeEventQuestionSelection } from './event-questions-validation.js'
import { validateQuestionShape, type QuestionType } from './question-input-validation.js'
import {
  QUESTION_EDITORIAL_STATUSES,
  normalizeQuestionEditorialStatus,
  normalizeQuestionMedia,
  normalizeOlympiadQuestionMeta,
  questionReadinessIssues,
  questionSnapshot,
  restoredQuestionValues,
} from './question-editorial.js'
import { ALL_TOPICS, normalizeTopic, normalizeConceptKey, normalizeProgressionBand, type ConceptKey, type ProgressionBand } from '../lib/taxonomy.js'
import { QUESTION_CHANNELS, assertQuestionDistribution, normalizeQuestionChannels } from '../lib/question-channels.js'
import {
  EVENT_STATUSES,
  assertEventDateOrder,
  assertEventQuestionSelectionAllowed,
  assertEventRuleChangesAllowed,
  assertEventStatusTransitionAllowed,
  normalizeEventInput,
  normalizeEventPatch,
  shouldValidateEventReadiness,
} from './event-validation.js'
import {
  buildContentPublicationManifest,
  contentManifestSha256,
  dispatchContentPublication,
  summarizeContentDeliveryState,
} from '../lib/content-publication.js'
import { listAdminParents } from './admin-parents.js'
import {
  analyzeOfficialEvent,
  analyzeOlympiadSet,
  type OlympiadEventReadiness,
  type OlympiadQuestionForPolicy,
} from '../lib/olympiad-content-policy.js'

class PathMapConflictError extends Error {}
class QuestionEditConflictError extends Error {}
class LessonEditConflictError extends Error {}
class MissionEditConflictError extends Error {}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

async function officialEventReadiness(
  event: { id: string; timeMinutes: number; questionsCount: number },
): Promise<OlympiadEventReadiness> {
  const rows = await db
    .select({
      id: questions.id,
      q: questions.q,
      code: questions.code,
      type: questions.type,
      options: questions.options,
      grade: questions.grade,
      difficulty: questions.difficulty,
      track: questions.track,
      topic: questions.topic,
      conceptKey: questions.conceptKey,
      progressionBand: questions.progressionBand,
      img: questions.img,
      imageAlt: questions.imageAlt,
      meta: questions.meta,
      isOlympiad: questions.isOlympiad,
      channels: questions.channels,
      editorialStatus: questions.editorialStatus,
    })
    .from(eventQuestions)
    .innerJoin(questions, eq(eventQuestions.questionId, questions.id))
    .where(eq(eventQuestions.eventId, event.id))

  return analyzeOfficialEvent(
    { timeMinutes: event.timeMinutes, questionsCount: event.questionsCount },
    rows as OlympiadQuestionForPolicy[],
  )
}

function snapshotLessonVersions(points: PathPointInput[], versions: ReadonlyMap<string, number>): PathPointInput[] {
  return points.map(point => ({
    ...point,
    activities: point.activities.map(step => step.activity.kind === 'lesson'
      ? {
        ...step,
        activity: { ...step.activity, lessonVersion: versions.get(step.activity.lessonId as string) },
      }
      : step),
  }))
}

function snapshotMissionVersions(points: PathPointInput[], versions: ReadonlyMap<string, number>): PathPointInput[] {
  return points.map(point => ({
    ...point,
    activities: point.activities.map(step => step.activity.kind === 'mission-ref'
      ? {
        ...step,
        activity: { ...step.activity, missionVersion: versions.get(step.activity.missionId as string) },
      }
      : step),
  }))
}

function collectHistoricalStepVersions(pointSets: unknown[][]): Map<string, number> {
  const versions = new Map<string, number>()
  for (const raw of pointSets) {
    let points: PathPointInput[]
    try { points = validatePathMapPoints(raw) } catch { continue }
    for (const point of points) {
      for (const step of point.activities) {
        const key = `${point.id}:${step.id}`
        versions.set(key, Math.max(versions.get(key) ?? 0, step.version))
      }
    }
  }
  return versions
}

function collectHistoricalPointIds(pointSets: unknown[][]): Set<string> {
  const ids = new Set<string>()
  for (const raw of pointSets) {
    try {
      for (const point of validatePathMapPoints(raw)) ids.add(point.id)
    } catch { /* Corrupt history is ignored here and still fails catalog loading. */ }
  }
  return ids
}

const QUESTION_TRACKS = ['informatics', 'computational-thinking', 'ai-basics'] as const

function normalizeQuestionTrack(raw: unknown): QuestionTrack | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string' && (QUESTION_TRACKS as readonly string[]).includes(raw)) return raw as QuestionTrack
  throw new Error('Невідомий напрям питання')
}

// Filters shared by the question bank list and its per-section counters. The
// section itself (isOlympiad / channel / unassigned) is applied by the list
// route only, so the counters can describe every section under the same rest.
const questionBankQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    grade:      { type: 'string', enum: ['1', '2', '3', '4'] },
    type:       { type: 'string', enum: ['choice', 'truefalse', 'input', 'sort', 'sequence', 'match'] },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    track:      { type: 'string', enum: ['informatics', 'computational-thinking', 'ai-basics'] },
    topic:      { type: 'string', enum: ALL_TOPICS as string[] },
    status:     { type: 'string', enum: [...QUESTION_EDITORIAL_STATUSES] },
    search:     { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const

function questionBankFilters(
  query: { grade?: string; type?: string; difficulty?: string; topic?: string; status?: string; search?: string },
  track: QuestionTrack | null,
): SQL[] {
  const { grade, type, difficulty, topic, status, search } = query
  const filters: SQL[] = []
  if (grade)      filters.push(eq(questions.grade,      Number(grade)))
  if (type)       filters.push(eq(questions.type,       type as QuestionType))
  if (difficulty) filters.push(eq(questions.difficulty, difficulty))
  if (track)      filters.push(eq(questions.track,      track))
  if (topic)      filters.push(eq(questions.topic,      topic))
  if (status)     filters.push(eq(questions.editorialStatus, normalizeQuestionEditorialStatus(status)))
  if (search) {
    const pattern = `%${search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    filters.push(or(ilike(questions.q, pattern), sql`${questions.id}::text ILIKE ${pattern}`)!)
  }
  return filters
}

// The delivery section: a channel, the main round, or "delivered nowhere".
// Shared by the bank list and the coverage matrix so both narrow identically.
function applyQuestionSectionFilters(
  filters: SQL[],
  section: { isOlympiad?: string; channel?: string; unassigned?: string },
): void {
  if (section.isOlympiad) filters.push(eq(questions.isOlympiad, section.isOlympiad === 'true'))
  if (section.channel)    filters.push(arrayContains(questions.channels, [section.channel as QuestionChannel]))
  if (section.unassigned === 'true') {
    filters.push(and(eq(questions.isOlympiad, false), sql`cardinality(${questions.channels}) = 0`)!)
  }
}

function normalizePositiveInt(value: unknown, field: string, fallback?: number): number | undefined {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new Error(`${field} має бути цілим числом від 1 до 100`)
  }
  return value as number
}

async function eventRulesAreLocked(eventId: string, status: string): Promise<boolean> {
  if (status === 'active') return true
  const [attempt] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .innerJoin(accessCodes, eq(attempts.codeId, accessCodes.id))
    .where(and(eq(accessCodes.eventId, eventId), eq(attempts.status, 'in_progress')))
    .limit(1)
  return !!attempt
}

async function questionIsLocked(questionId: string): Promise<boolean> {
  const [issued] = await db
    .select({ id: attemptQuestions.id })
    .from(attemptQuestions)
    .where(eq(attemptQuestions.questionId, questionId))
    .limit(1)
  if (issued) return true

  const [selectedForLiveEvent] = await db
    .select({ id: eventQuestions.id })
    .from(eventQuestions)
    .innerJoin(olympiadEvents, eq(eventQuestions.eventId, olympiadEvents.id))
    .where(and(
      eq(eventQuestions.questionId, questionId),
      inArray(olympiadEvents.status, ['published', 'active']),
    ))
    .limit(1)
  if (selectedForLiveEvent) return true

  // School-сесія читає поточний стан questions при join/скорингу, тож редагування
  // питання під час незавершеної гри розсинхронізувало б видане питання і ключ.
  // Finished-сесії не лочать: is_correct уже зафіксовано, ре-скорингу немає.
  const [inLiveSchoolSession] = await db
    .select({ id: schoolSessionQuestions.id })
    .from(schoolSessionQuestions)
    .innerJoin(schoolSessions, eq(schoolSessionQuestions.sessionId, schoolSessions.id))
    .where(and(
      eq(schoolSessionQuestions.questionId, questionId),
      inArray(schoolSessions.status, ['lobby', 'active']),
    ))
    .limit(1)
  return !!inLiveSchoolSession
}

async function questionHasEventReference(questionId: string): Promise<boolean> {
  const [selected] = await db.select({ id: eventQuestions.id }).from(eventQuestions)
    .where(eq(eventQuestions.questionId, questionId)).limit(1)
  return !!selected
}

export async function adminRoutes(app: FastifyInstance) {

  // Static bundles are published through an immutable, audited GitHub Actions job.
  app.get('/content-publications', { preHandler: requireAdmin }, async (_req, reply) => {
    const publications = await db.select().from(contentPublications)
      .orderBy(desc(contentPublications.createdAt)).limit(20)
    const currentManifest = await buildContentPublicationManifest()
    const currentManifestSha256 = contentManifestSha256(currentManifest)
    const [lastSucceeded] = await db.select({
      publishedManifestSha256: contentPublications.publishedManifestSha256,
    }).from(contentPublications).where(and(
      eq(contentPublications.status, 'succeeded'),
      isNotNull(contentPublications.publishedManifestSha256),
      isNotNull(contentPublications.completedAt),
    )).orderBy(desc(contentPublications.completedAt)).limit(1)
    const active = publications.find(item => item.status === 'queued' || item.status === 'running')
    const deliveryState = summarizeContentDeliveryState(
      currentManifestSha256,
      lastSucceeded?.publishedManifestSha256 ?? null,
      active && (active.status === 'queued' || active.status === 'running')
        ? {
            id: active.id,
            status: active.status,
            expectedManifestSha256: active.expectedManifestSha256,
          }
        : null,
    )
    return reply.send({ publications, deliveryState })
  })

  app.post('/content-publications', { preHandler: requireAdmin }, async (req, reply) => {
    const manifest = await buildContentPublicationManifest()
    const expectedManifestSha256 = contentManifestSha256(manifest)
    let publication
    try {
      ;[publication] = await db.insert(contentPublications).values({
        expectedManifest: manifest,
        expectedManifestSha256,
        requestedBy: req.user!.id,
      }).returning()
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Інша публікація вже виконується.' })
      }
      throw err
    }

    try {
      const dispatched = await dispatchContentPublication(publication.id, expectedManifestSha256)
      if (dispatched.workflowRunId || dispatched.workflowUrl) {
        ;[publication] = await db.update(contentPublications).set(dispatched)
          .where(eq(contentPublications.id, publication.id)).returning()
      }
      return reply.code(201).send({ publication })
    } catch (err) {
      await db.update(contentPublications).set({
        status: 'failed',
        failureReason: (err as Error).message.slice(0, 300),
        completedAt: new Date(),
      }).where(eq(contentPublications.id, publication.id))
      req.log.error({ err, publicationId: publication.id }, 'content publication dispatch failed')
      return reply.code(503).send({ error: 'Не вдалося запустити публікацію. Перевір налаштування сервісу.' })
    }
  })

  // GET /api/admin/stats
  app.get('/stats', { preHandler: requireAdmin }, async (_req, reply) => {
    const [[{ teachers }], [{ parents }], [{ codes }], [{ results }], [{ events }]] = await Promise.all([
      db.select({ teachers: count() }).from(appUsers).where(eq(appUsers.role, 'teacher')),
      db.select({ parents: count() }).from(homeParentAccounts),
      db.select({ codes:    count() }).from(accessCodes),
      db.select({ results:  count() }).from(attempts).where(eq(attempts.status, 'finished')),
      db.select({ events:   count() }).from(olympiadEvents).where(eq(olympiadEvents.status, 'active')),
    ])
    return reply.send({ teachers, parents, codes, results, events })
  })

  // GET /api/admin/home-funnel?days=30
  // Знеособлена воронка Home Mode. Читає лише агрегати — індивідуальних рядків
  // у джерелі не існує (див. routes/home-funnel.ts).
  app.get<{ Querystring: { days?: string } }>('/home-funnel', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { days: { type: 'string', pattern: '^(?:[1-9]|[1-8][0-9]|9[0-9]|1[0-7][0-9]|180)$' } },
      },
    },
  }, async (req, reply) => {
    const days = Number(req.query.days ?? '30')
    const rows = await db
      .select({
        step:  homeFunnelCounters.step,
        grade: homeFunnelCounters.grade,
        count: sql<number>`sum(${homeFunnelCounters.count})::int`,
      })
      .from(homeFunnelCounters)
      .where(sql`${homeFunnelCounters.bucketDate} > CURRENT_DATE - ${days}::int`)
      .groupBy(homeFunnelCounters.step, homeFunnelCounters.grade)

    return reply.send({
      days,
      steps: summarizeFunnel(rows.map(r => ({ step: r.step, count: r.count }))),
      byGrade: [1, 2, 3, 4].map(grade => ({
        grade,
        steps: summarizeFunnel(rows.filter(r => r.grade === grade).map(r => ({ step: r.step, count: r.count }))),
      })),
    })
  })

  // GET /api/admin/parents?limit=&offset=
  app.get<{ Querystring: { limit?: number; offset?: number } }>('/parents', {
    preHandler: requireAdmin,
    schema: { querystring: paginationQuerystring },
  }, async (req, reply) => {
    const range = pageRange(req.query)
    const { parents, total } = await listAdminParents(range)
    return reply.send({ parents, page: pageInfo(range, total) })
  })

  // GET /api/admin/teachers?limit=&offset=
  app.get<{ Querystring: { limit?: number; offset?: number } }>('/teachers', {
    preHandler: requireAdmin,
    schema: { querystring: paginationQuerystring },
  }, async (req, reply) => {
    const range = pageRange(req.query)
    const isTeacher = eq(appUsers.role, 'teacher')
    const list = await db
      .select({ id: appUsers.id, email: appUsers.email, name: appUsers.name, status: appUsers.status, createdAt: appUsers.createdAt })
      .from(appUsers)
      .where(isTeacher)
      .orderBy(desc(appUsers.createdAt), asc(appUsers.id))
      .limit(range.limit)
      .offset(range.offset)
    const [totals] = await db.select({ total: count() }).from(appUsers).where(isTeacher)
    return reply.send({ teachers: list, page: pageInfo(range, totals?.total ?? 0) })
  })

  // PUT /api/admin/teachers/:id/status
  app.put<{
    Params: { id: string }
    Body: { status: 'active' | 'blocked' | 'pending' }
  }>('/teachers/:id/status', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['active', 'blocked', 'pending'] } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    const { status } = req.body
    if (!['active', 'blocked', 'pending'].includes(status)) {
      return reply.code(400).send({ error: 'Невірний статус' })
    }
    if (req.user?.id === id) {
      return reply.code(403).send({ error: 'Не можна заблокувати власний акаунт' })
    }
    const [updated] = await db
      .update(appUsers)
      .set({ status })
      // The route manages teachers only: an admin account must not be
      // blockable through it (defence against fat-finger and stolen sessions).
      .where(and(eq(appUsers.id, id), eq(appUsers.role, 'teacher')))
      .returning({ id: appUsers.id, status: appUsers.status })
    if (!updated) return reply.code(404).send({ error: 'Користувача не знайдено' })
    return reply.send({ id: updated.id, status: updated.status })
  })

  // GET /api/admin/events?limit=&offset=
  app.get<{ Querystring: { limit?: number; offset?: number } }>('/events', {
    preHandler: requireAdmin,
    schema: { querystring: paginationQuerystring },
  }, async (req, reply) => {
    const range = pageRange(req.query)
    const list = await db
      .select()
      .from(olympiadEvents)
      .orderBy(desc(olympiadEvents.startsAt), asc(olympiadEvents.id))
      .limit(range.limit)
      .offset(range.offset)
    const [totals] = await db.select({ total: count() }).from(olympiadEvents)
    return reply.send({ events: list, page: pageInfo(range, totals?.total ?? 0) })
  })

  // POST /api/admin/events
  app.post<{
    Body: { title: string; description?: string | null; startsAt: string; endsAt: string; status?: string; timeMinutes?: number; questionsCount?: number }
  }>('/events', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['title', 'startsAt', 'endsAt'],
        properties: {
          title:       { type: 'string', minLength: 1, maxLength: 160 },
          description: { type: 'string' },
          startsAt:    { type: 'string' },
          endsAt:      { type: 'string' },
          // A new event has no reviewed question sets yet, so it can only be
          // created as a draft. Publication goes through the readiness gate.
          status:      { type: 'string', enum: ['draft'] },
          timeMinutes: { type: 'integer', minimum: 1, maximum: 100 },
          questionsCount: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (req, reply) => {
    let eventData
    try {
      eventData = {
        ...normalizeEventInput(req.body),
        timeMinutes: normalizePositiveInt(req.body.timeMinutes, 'timeMinutes', 45),
        questionsCount: normalizePositiveInt(req.body.questionsCount, 'questionsCount', 24),
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [inserted] = await db
      .insert(olympiadEvents)
      .values({ ...eventData, createdBy: req.user!.id })
      .returning()

    return reply.code(201).send({ event: inserted })
  })

  // PUT /api/admin/events/:id
  app.put<{
    Params: { id: string }
    Body: { title?: string; description?: string | null; startsAt?: string; endsAt?: string; status?: string; timeMinutes?: number; questionsCount?: number }
  }>('/events/:id', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          title:       { type: 'string', minLength: 1, maxLength: 160 },
          description: { type: 'string' },
          startsAt:    { type: 'string' },
          endsAt:      { type: 'string' },
          status:      { type: 'string', enum: EVENT_STATUSES },
          timeMinutes: { type: 'integer', minimum: 1, maximum: 100 },
          questionsCount: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (req, reply) => {
    let updates
    try {
      updates = {
        ...normalizeEventPatch(req.body),
        ...(req.body.timeMinutes !== undefined ? { timeMinutes: normalizePositiveInt(req.body.timeMinutes, 'timeMinutes') } : {}),
        ...(req.body.questionsCount !== undefined ? { questionsCount: normalizePositiveInt(req.body.questionsCount, 'questionsCount') } : {}),
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [current] = await db
      .select({
        id: olympiadEvents.id,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
        status: olympiadEvents.status,
        timeMinutes: olympiadEvents.timeMinutes,
        questionsCount: olympiadEvents.questionsCount,
      })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)

    if (!current) return reply.code(404).send({ error: 'Подію не знайдено' })

    try {
      assertEventRuleChangesAllowed(await eventRulesAreLocked(req.params.id, current.status), req.body)
      if (updates.status) assertEventStatusTransitionAllowed(current.status, updates.status)
      assertEventDateOrder(updates.startsAt ?? current.startsAt, updates.endsAt ?? current.endsAt)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    if (shouldValidateEventReadiness(current.status, updates.status)) {
      const readiness = await officialEventReadiness({
        id: current.id,
        timeMinutes: updates.timeMinutes ?? current.timeMinutes,
        questionsCount: updates.questionsCount ?? current.questionsCount,
      })
      if (!readiness.ready) {
        return reply.code(409).send({
          error: 'Подію не можна опублікувати або активувати: виправте блокувальні помилки в перевірці набору.',
          readiness,
        })
      }
    }

    const [updated] = await db
      .update(olympiadEvents)
      .set(updates)
      .where(eq(olympiadEvents.id, req.params.id))
      .returning()

    return reply.send({ event: updated })
  })

  // GET /api/admin/events/:id/readiness
  // Uses the same policy as the publication/activation gate.
  app.get<{ Params: { id: string } }>('/events/:id/readiness', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const [event] = await db
      .select({
        id: olympiadEvents.id,
        timeMinutes: olympiadEvents.timeMinutes,
        questionsCount: olympiadEvents.questionsCount,
      })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)
    if (!event) return reply.code(404).send({ error: 'Подію не знайдено' })
    return reply.send({ readiness: await officialEventReadiness(event) })
  })

  // GET /api/admin/events/:id/questions?grade=1
  app.get<{
    Params: { id: string }
    Querystring: { grade?: string }
  }>('/events/:id/questions', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      querystring: {
        type: 'object',
        additionalProperties: false,
        required: ['grade'],
        properties: { grade: { type: 'string', enum: ['1', '2', '3', '4'] } },
      },
    },
  }, async (req, reply) => {
    const grade = Number(req.query.grade)
    if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
      return reply.code(400).send({ error: 'Клас має бути числом від 1 до 4' })
    }

    const [event] = await db
      .select({ id: olympiadEvents.id, status: olympiadEvents.status })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)

    if (!event) return reply.code(404).send({ error: 'Подію не знайдено' })

    const selected = await db
      .select({
        id:         questions.id,
        q:          questions.q,
        difficulty: questions.difficulty,
        grade:      questions.grade,
        position:   eventQuestions.position,
      })
      .from(eventQuestions)
      .innerJoin(questions, eq(eventQuestions.questionId, questions.id))
      .where(and(eq(eventQuestions.eventId, req.params.id), eq(eventQuestions.grade, grade)))
      .orderBy(asc(eventQuestions.position))

    return reply.send({ questions: selected })
  })

  // PUT /api/admin/events/:id/questions
  app.put<{
    Params: { id: string }
    Body: { grade: number; questionIds: string[] }
  }>('/events/:id/questions', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['grade', 'questionIds'],
        properties: {
          grade:       { type: 'integer', minimum: 1, maximum: 4 },
          questionIds: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 100 },
        },
      },
    },
  }, async (req, reply) => {
    let selection
    try {
      selection = normalizeEventQuestionSelection(req.body)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [event] = await db
      .select({ id: olympiadEvents.id, status: olympiadEvents.status })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)

    if (!event) return reply.code(404).send({ error: 'Подію не знайдено' })

    try {
      assertEventQuestionSelectionAllowed(
        event.status,
        await eventRulesAreLocked(event.id, event.status),
      )
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    const found = selection.questionIds.length
      ? await db
          .select({
            id: questions.id, grade: questions.grade, isOlympiad: questions.isOlympiad,
            type: questions.type, editorialStatus: questions.editorialStatus,
          })
          .from(questions)
          .where(inArray(questions.id, selection.questionIds))
      : []

    try {
      assertQuestionsBelongToGrade(selection.questionIds, found, selection.grade)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const nonOlympiad = found.filter(q => !q.isOlympiad)
    if (nonOlympiad.length) {
      return reply.code(400).send({ error: `Питання ${nonOlympiad.map(q => q.id).join(', ')} не є олімпіадними (isOlympiad=false). До події можна додавати лише олімпіадні питання.` })
    }
    const unpublished = found.filter(q => q.editorialStatus !== 'published')
    if (unpublished.length) {
      return reply.code(400).send({ error: `Питання ${unpublished.map(q => q.id).join(', ')} не опубліковані.` })
    }

    // Усі типи мають серверне оцінювання і санітизацію ключів.
    const OLYMPIAD_ALLOWED_TYPES: string[] = ['choice', 'truefalse', 'sort', 'sequence', 'match', 'input']
    const unsupported = found.filter(q => !OLYMPIAD_ALLOWED_TYPES.includes(q.type ?? 'choice'))
    if (unsupported.length) {
      return reply.code(400).send({ error: `Питання ${unsupported.map(q => q.id).join(', ')} мають тип "${unsupported[0].type}", який не підтримується в олімпіадному режимі. Дозволено: ${OLYMPIAD_ALLOWED_TYPES.join(', ')}.` })
    }

    await db.transaction(async tx => {
      await tx
        .delete(eventQuestions)
        .where(and(eq(eventQuestions.eventId, req.params.id), eq(eventQuestions.grade, selection.grade)))

      if (selection.questionIds.length) {
        await tx.insert(eventQuestions).values(selection.questionIds.map((questionId, position) => ({
          eventId: req.params.id,
          questionId,
          grade: selection.grade,
          position,
        })))
      }
    })

    const [savedEvent] = await db
      .select({
        id: olympiadEvents.id,
        timeMinutes: olympiadEvents.timeMinutes,
        questionsCount: olympiadEvents.questionsCount,
      })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)

    return reply.send({
      saved: true,
      count: selection.questionIds.length,
      readiness: savedEvent ? await officialEventReadiness(savedEvent) : null,
    })
  })

  // GET /api/admin/results?limit=&offset=
  app.get<{ Querystring: { limit?: number; offset?: number } }>('/results', {
    preHandler: requireAdmin,
    schema: { querystring: paginationQuerystring },
  }, async (req, reply) => {
    const range = pageRange(req.query)
    const finished = inArray(attempts.status, ['finished', 'expired'])
    const page = await db
      .select({
        id:         attempts.id,
        grade:      attempts.grade,
        score:      attempts.score,
        totalQ:     attempts.totalQ,
        status:     attempts.status,
        startedAt:  attempts.startedAt,
        finishedAt: attempts.finishedAt,
        code:       accessCodes.code,
        createdBy:  accessCodes.createdBy,
      })
      .from(attempts)
      .leftJoin(accessCodes, eq(attempts.codeId, accessCodes.id))
      .where(finished)
      .orderBy(desc(attempts.finishedAt), asc(attempts.id))
      .limit(range.limit)
      .offset(range.offset)
    const [totals] = await db.select({ total: count() }).from(attempts).where(finished)
    return reply.send({ results: page, page: pageInfo(range, totals?.total ?? 0) })
  })

  // GET /api/admin/questions/counts?grade=&type=&difficulty=&track=&topic=&status=&search=
  // How many questions each delivery section holds under the current filters.
  // Section is NOT accepted here: the counters exist to show what the other
  // sections contain, so they must be built from the same rows minus that one
  // filter. Registered before the parametric question routes.
  app.get<{
    Querystring: { grade?: string; type?: string; difficulty?: string; track?: string; topic?: string; status?: string; search?: string }
  }>('/questions/counts', {
    preHandler: requireAdmin,
    schema: { querystring: { ...questionBankQuerystring } },
  }, async (req, reply) => {
    let track: QuestionTrack | null
    try {
      track = normalizeQuestionTrack(req.query.track)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    const filters = questionBankFilters(req.query, track)

    const [row] = await db
      .select({
        all:                sql<number>`cast(count(*) as int)`,
        class_game:         sql<number>`cast(count(*) filter (where ${arrayContains(questions.channels, ['class_game'])}) as int)`,
        path:               sql<number>`cast(count(*) filter (where ${arrayContains(questions.channels, ['path'])}) as int)`,
        olympiad_training:  sql<number>`cast(count(*) filter (where ${arrayContains(questions.channels, ['olympiad_training'])}) as int)`,
        main_round:         sql<number>`cast(count(*) filter (where ${questions.isOlympiad}) as int)`,
        // Neither a main-round question nor delivered anywhere: invisible to
        // every mode, which is exactly what the editor needs to see.
        unassigned:         sql<number>`cast(count(*) filter (where ${questions.isOlympiad} is not true and cardinality(${questions.channels}) = 0) as int)`,
      })
      .from(questions)
      .where(filters.length ? and(...filters) : undefined)

    return reply.send({
      counts: row ?? { all: 0, class_game: 0, path: 0, olympiad_training: 0, main_round: 0, unassigned: 0 },
    })
  })

  // GET /api/admin/questions/matrix?<shared minus grade/topic>&<section>
  // Coverage of the selected section: how many questions exist per grade and
  // topic. Grade and topic are the axes here, so they are not accepted as
  // filters — the point is to see where the section is empty.
  app.get<{
    Querystring: { type?: string; difficulty?: string; track?: string; status?: string; search?: string; isOlympiad?: string; channel?: string; unassigned?: string }
  }>('/questions/matrix', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type:       questionBankQuerystring.properties.type,
          difficulty: questionBankQuerystring.properties.difficulty,
          track:      questionBankQuerystring.properties.track,
          status:     questionBankQuerystring.properties.status,
          search:     questionBankQuerystring.properties.search,
          isOlympiad: { type: 'string', enum: ['true', 'false'] },
          channel:    { type: 'string', enum: [...QUESTION_CHANNELS] },
          unassigned: { type: 'string', enum: ['true'] },
        },
      },
    },
  }, async (req, reply) => {
    let track: QuestionTrack | null
    try {
      track = normalizeQuestionTrack(req.query.track)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    const filters = questionBankFilters(req.query, track)
    applyQuestionSectionFilters(filters, req.query)

    const cells = await db
      .select({
        grade: questions.grade,
        topic: questions.topic,
        total: sql<number>`cast(count(*) as int)`,
      })
      .from(questions)
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(questions.grade, questions.topic)

    return reply.send({ cells })
  })

  // GET /api/admin/questions/demo-coverage
  // Editorial preflight for the public 12-slot olympiad demo. It intentionally
  // reads only published training content because drafts cannot satisfy a live
  // delivery requirement.
  app.get('/questions/demo-coverage', {
    preHandler: requireAdmin,
  }, async (_req, reply) => {
    const rows = (await db
      .select({
        id: questions.id,
        q: questions.q,
        code: questions.code,
        type: questions.type,
        options: questions.options,
        track: questions.track,
        difficulty: questions.difficulty,
        topic: questions.topic,
        conceptKey: questions.conceptKey,
        progressionBand: questions.progressionBand,
        img: questions.img,
        imageAlt: questions.imageAlt,
        meta: questions.meta,
        grade: questions.grade,
        isOlympiad: questions.isOlympiad,
        channels: questions.channels,
        editorialStatus: questions.editorialStatus,
      })
      .from(questions)
      .where(and(
        eq(questions.isOlympiad, false),
        eq(questions.editorialStatus, 'published'),
        arrayContains(questions.channels, ['olympiad_training']),
      )))
      .sort((left, right) => left.id.localeCompare(right.id))

    const grades = []
    for (const grade of [1, 2, 3, 4]) {
      const candidates = rows.filter(question => question.grade === grade)
      const coverage = analyzeDemoCoverage(grade, candidates)
      let standard = null
      const signatures = new Set<string>()
      let passedSamples = 0
      const samples = 64
      const byId = new Map(candidates.map(question => [question.id, question]))
      for (let seed = 1; seed <= samples; seed++) {
        try {
          const selectedIds = pickDemoQuestionSet(
            grade,
            candidates,
            createSeededDemoRandom(seed),
            selected => analyzeOlympiadSet(
              grade,
              'demo',
              selected as OlympiadQuestionForPolicy[],
            ).ready,
          )
          const result = analyzeOlympiadSet(
            grade,
            'demo',
            selectedIds.map(id => byId.get(id)!) as OlympiadQuestionForPolicy[],
          )
          if (!standard) standard = result
          if (result.ready) passedSamples++
          signatures.add([...selectedIds].sort().join(':'))
        } catch {
          // The audit counters expose composition failures to the editor.
        }
        await yieldToEventLoop()
      }
      grades.push({
        ...coverage,
        ready: coverage.ready && passedSamples === samples && Boolean(standard?.ready),
        standard,
        audit: {
          samples,
          passed: passedSamples,
          uniqueSets: signatures.size,
        },
      })
    }

    return reply.send({ grades })
  })

  // GET /api/admin/questions?grade=&isOlympiad=&type=&channel=&unassigned=&difficulty=&track=&topic=&status=&search=&limit=&offset=
  // One page only: the bank grows without bound, so the full list must never
  // cross the wire. `page.total` counts the whole filtered set.
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; type?: string; channel?: string; unassigned?: string; difficulty?: string; track?: string; topic?: string; status?: string; search?: string; limit?: number; offset?: number }
  }>('/questions', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        ...questionBankQuerystring,
        properties: {
          ...questionBankQuerystring.properties,
          isOlympiad: { type: 'string', enum: ['true', 'false'] },
          channel:    { type: 'string', enum: [...QUESTION_CHANNELS] },
          unassigned: { type: 'string', enum: ['true'] },
          ...paginationProperties,
        },
      },
    },
  }, async (req, reply) => {
    const { isOlympiad, channel, unassigned } = req.query
    let track: QuestionTrack | null
    try {
      track = normalizeQuestionTrack(req.query.track)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    const filters = questionBankFilters(req.query, track)
    applyQuestionSectionFilters(filters, { isOlympiad, channel, unassigned })
    const where = filters.length ? and(...filters) : undefined
    const range = pageRange(req.query)

    // `id` breaks ties: rows sharing a timestamp must not swap places between
    // pages, or paging would show one row twice and skip another.
    const [list, [totals]] = await Promise.all([
      db
        .select()
        .from(questions)
        .where(where)
        .orderBy(desc(questions.updatedAt), desc(questions.createdAt), asc(questions.id))
        .limit(range.limit)
        .offset(range.offset),
      db.select({ total: count() }).from(questions).where(where),
    ])
    return reply.send({ questions: list, page: pageInfo(range, totals?.total ?? 0) })
  })

  // POST /api/admin/questions
  app.post<{
    Body: {
      q: string; grade: number; difficulty: string; track?: QuestionTrack | null; isOlympiad: boolean; channels?: QuestionChannel[]
      topic?: string | null; conceptKey?: string | null; progressionBand?: string | null
      imageRole?: string | null; estimatedSeconds?: number | null; templateId?: string | null
      type?: string; options: string[] | Record<string, unknown>
      correct?: number; explanation?: string; code?: string; img?: string | null; imageAlt?: string | null
    }
  }>('/questions', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['q', 'grade', 'difficulty', 'options'],
        properties: {
          q:           { type: 'string' },
          grade:       { type: 'integer', minimum: 1, maximum: 4 },
          difficulty:  { type: 'string', enum: ['easy', 'medium', 'hard'] },
          track:       { type: ['string', 'null'], enum: ['informatics', 'computational-thinking', 'ai-basics', null] },
          isOlympiad:  { type: 'boolean' },
          channels:    { type: 'array', uniqueItems: true, items: { type: 'string', enum: [...QUESTION_CHANNELS] } },
          topic:           { type: ['string', 'null'], enum: [...(ALL_TOPICS as string[]), null] },
          conceptKey:      { type: ['string', 'null'] },
          progressionBand: { type: ['string', 'null'], enum: ['recognize', 'apply', 'reason', null] },
          imageRole:       { type: ['string', 'null'], enum: ['essential', 'supportive', 'decorative', null] },
          estimatedSeconds:{ type: ['integer', 'null'], minimum: 10, maximum: 600 },
          templateId:      { type: ['string', 'null'], maxLength: 80 },
          type:        { type: 'string', enum: ['choice', 'truefalse', 'input', 'sort', 'sequence', 'match'] },
          options:     {},   // jsonb — будь-яка структура залежно від type
          correct:     { type: ['integer', 'null'], minimum: 0 },
          explanation: { type: 'string' },
          code:        { type: 'string' },
          img:         { type: ['string', 'null'], maxLength: 500 },
          imageAlt:    { type: ['string', 'null'], maxLength: 240 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { q, grade, difficulty, isOlympiad = false, options, correct, explanation, code } = req.body
    const type = (req.body.type ?? 'choice') as QuestionType
    let track: QuestionTrack | null
    let topic: string | null
    let conceptKey: ConceptKey | null
    let progressionBand: ProgressionBand | null
    let media: { img: string | null; imageAlt: string | null }
    let meta: Record<string, unknown>
    let channels: QuestionChannel[]
    try {
      track           = normalizeQuestionTrack(req.body.track)
      topic           = normalizeTopic(req.body.topic, track)
      conceptKey      = normalizeConceptKey(req.body.conceptKey)
      progressionBand = normalizeProgressionBand(req.body.progressionBand)
      media             = normalizeQuestionMedia(req.body.img, req.body.imageAlt)
      meta              = normalizeOlympiadQuestionMeta(null, req.body)
      channels          = normalizeQuestionChannels(req.body.channels ?? [])
      assertQuestionDistribution(isOlympiad, channels)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    // Валідація форми за типом (choice/truefalse/sequence/sort/match/input)
    let shape
    try {
      shape = validateQuestionShape(type, options, correct ?? null)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const inserted = await db.transaction(async tx => {
      const [row] = await tx
        .insert(questions)
        .values({
          q: q.trim(), grade, difficulty, track, topic, conceptKey, progressionBand, isOlympiad, channels,
          meta,
          type, options: shape.options as any, correct: shape.correct,
          explanation: explanation?.trim() || null, code: code?.trim() || null,
          ...media, editorialStatus: 'draft', createdBy: req.user!.id, updatedBy: req.user!.id,
        })
        .returning()
      await tx.insert(questionRevisions).values({
        questionId: row.id,
        editVersion: row.editVersion,
        action: 'create',
        snapshot: questionSnapshot(row),
        changedBy: req.user!.id,
      })
      return row
    })
    return reply.code(201).send({ id: inserted.id })
  })

  // PUT /api/admin/questions/:id
  app.put<{
    Params: { id: string }
    Body: {
      expectedEditVersion: number
      q?: string; grade?: number; difficulty?: string; track?: QuestionTrack | null; isOlympiad?: boolean; channels?: QuestionChannel[]
      topic?: string | null; conceptKey?: string | null; progressionBand?: string | null
      imageRole?: string | null; estimatedSeconds?: number | null; templateId?: string | null
      type?: string; options?: string[] | Record<string, unknown>
      correct?: number | null; explanation?: string; code?: string; img?: string | null; imageAlt?: string | null
    }
  }>('/questions/:id', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['expectedEditVersion'],
        properties: {
          expectedEditVersion: { type: 'integer', minimum: 1 },
          q:           { type: 'string' },
          grade:       { type: 'integer', minimum: 1, maximum: 4 },
          difficulty:  { type: 'string', enum: ['easy', 'medium', 'hard'] },
          track:       { type: ['string', 'null'], enum: ['informatics', 'computational-thinking', 'ai-basics', null] },
          isOlympiad:  { type: 'boolean' },
          channels:    { type: 'array', uniqueItems: true, items: { type: 'string', enum: [...QUESTION_CHANNELS] } },
          topic:           { type: ['string', 'null'], enum: [...(ALL_TOPICS as string[]), null] },
          conceptKey:      { type: ['string', 'null'] },
          progressionBand: { type: ['string', 'null'], enum: ['recognize', 'apply', 'reason', null] },
          imageRole:       { type: ['string', 'null'], enum: ['essential', 'supportive', 'decorative', null] },
          estimatedSeconds:{ type: ['integer', 'null'], minimum: 10, maximum: 600 },
          templateId:      { type: ['string', 'null'], maxLength: 80 },
          type:        { type: 'string', enum: ['choice', 'truefalse', 'input', 'sort', 'sequence', 'match'] },
          options:     {},
          correct:     { type: ['integer', 'null'], minimum: 0 },
          explanation: { type: 'string' },
          code:        { type: 'string' },
          img:         { type: ['string', 'null'], maxLength: 500 },
          imageAlt:    { type: ['string', 'null'], maxLength: 240 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    const b = req.body
    let track: QuestionTrack | null | undefined
    let conceptKey: ConceptKey | null | undefined
    let progressionBand: ProgressionBand | null | undefined
    let channels: QuestionChannel[] | undefined

    const [current] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1)
    if (!current) return reply.code(404).send({ error: 'Питання не знайдено' })
    if (current.editVersion !== b.expectedEditVersion) {
      return reply.code(409).send({ error: 'Питання вже змінив інший редактор. Онови список і повтори правки.' })
    }
    if (current.publishedAt) {
      return reply.code(409).send({ error: 'Опубліковане питання незмінне. Створи з нього нову чернетку, перевір і опублікуй окремо.' })
    }

    let media: { img: string | null; imageAlt: string | null } | undefined
    let meta: Record<string, unknown> | undefined
    try {
      track           = b.track           !== undefined ? normalizeQuestionTrack(b.track) : undefined
      conceptKey      = b.conceptKey      !== undefined ? normalizeConceptKey(b.conceptKey) : undefined
      progressionBand = b.progressionBand !== undefined ? normalizeProgressionBand(b.progressionBand) : undefined
      channels        = b.channels !== undefined ? normalizeQuestionChannels(b.channels) : undefined
      if (b.img !== undefined || b.imageAlt !== undefined) {
        media = normalizeQuestionMedia(
          b.img !== undefined ? b.img : current.img,
          b.imageAlt !== undefined ? b.imageAlt : current.imageAlt,
        )
      }
      if (b.imageRole !== undefined || b.estimatedSeconds !== undefined || b.templateId !== undefined) {
        meta = normalizeOlympiadQuestionMeta(current.meta, b)
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const nextIsOlympiad = b.isOlympiad !== undefined ? b.isOlympiad : Boolean(current.isOlympiad)
    const nextChannels = channels !== undefined ? channels : current.channels
    try {
      assertQuestionDistribution(nextIsOlympiad, nextChannels)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    // Пара track+topic валідується у майбутньому (merged) стані: зміна track
    // без topic не може лишити тему чужого напряму
    const nextTrack = track !== undefined ? track : current.track
    const nextTopicRaw = b.topic !== undefined ? b.topic : current.topic
    let topic: string | null | undefined
    try {
      const validated = normalizeTopic(nextTopicRaw, nextTrack)
      topic = (b.topic !== undefined || validated !== current.topic) ? validated : undefined
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    if (await questionIsLocked(id)) {
      return reply.code(409).send({ error: 'Не можна редагувати питання активної олімпіади або питання, яке вже було видане учню' })
    }

    // Змерджити поточний стан з body → next — повна майбутня форма питання
    const next = {
      type:    (b.type    ?? current.type)    as QuestionType,
      correct: b.correct  !== undefined ? b.correct  : current.correct,
      options: b.options  !== undefined ? b.options  : current.options,
    }

    // Валідація повної майбутньої форми за типом
    let shape
    try {
      shape = validateQuestionShape(next.type, next.options, next.correct ?? null)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: req.user!.id }
    if (current.editorialStatus === 'review' || current.editorialStatus === 'archived') {
      updates.editorialStatus = 'draft'
    }
    if (b.q           !== undefined) updates.q           = b.q.trim()
    if (b.grade       !== undefined) updates.grade       = b.grade
    if (b.difficulty  !== undefined) updates.difficulty  = b.difficulty
    if (track         !== undefined) updates.track       = track
    if (topic         !== undefined) updates.topic       = topic
    if (conceptKey      !== undefined) updates.conceptKey      = conceptKey
    if (progressionBand !== undefined) updates.progressionBand = progressionBand
    if (meta !== undefined) updates.meta = meta
    if (b.isOlympiad  !== undefined) updates.isOlympiad  = b.isOlympiad
    if (channels      !== undefined) updates.channels    = channels
    if (b.type        !== undefined) updates.type        = b.type
    // options/correct беремо з провалідованої форми (нормалізовані)
    if (b.options !== undefined || b.type !== undefined) updates.options = shape.options
    if (b.correct !== undefined || b.type !== undefined) updates.correct = shape.correct  // null очищає
    if (b.explanation !== undefined) updates.explanation = b.explanation.trim() || null
    if (b.code        !== undefined) updates.code        = b.code.trim() || null
    if (media) {
      updates.img = media.img
      updates.imageAlt = media.imageAlt
    }

    const contentFields = [
      'q', 'options', 'correct', 'type', 'explanation', 'code', 'img', 'imageAlt',
      'grade', 'difficulty', 'track', 'topic', 'conceptKey', 'progressionBand', 'isOlympiad', 'channels',
      'imageRole', 'estimatedSeconds', 'templateId',
    ] as const
    if (contentFields.some(field => Object.prototype.hasOwnProperty.call(b, field))) {
      updates.version = current.version + 1
    }
    updates.editVersion = current.editVersion + 1

    try {
      const updated = await db.transaction(async tx => {
        const [row] = await tx
          .update(questions)
          .set(updates)
          .where(and(eq(questions.id, id), eq(questions.editVersion, b.expectedEditVersion)))
          .returning()
        if (!row) throw new QuestionEditConflictError()
        await tx.insert(questionRevisions).values({
          questionId: row.id,
          editVersion: row.editVersion,
          action: 'update',
          snapshot: questionSnapshot(row),
          changedBy: req.user!.id,
        })
        return row
      })
      return reply.send({ id: updated.id, version: updated.version, editVersion: updated.editVersion })
    } catch (err) {
      if (err instanceof QuestionEditConflictError) {
        return reply.code(409).send({ error: 'Питання вже змінив інший редактор. Онови список і повтори правки.' })
      }
      throw err
    }
  })

  // POST /api/admin/questions/channels — bulk delivery change for a selection.
  // A channel is DELIVERY, not authored content: the question text, the answer
  // key and the taxonomy stay exactly as published, only the set of modes that
  // may serve it changes. That is why this route may touch published rows where
  // the content edit route fails closed — and why it is deliberately narrow:
  // one channel, add or remove, nothing else (docs/security-model.md).
  app.post<{ Body: { ids: string[]; channel: QuestionChannel; action: 'add' | 'remove' } }>('/questions/channels', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['ids', 'channel', 'action'],
        additionalProperties: false,
        properties: {
          ids:     { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
          channel: { type: 'string', enum: [...QUESTION_CHANNELS] },
          action:  { type: 'string', enum: ['add', 'remove'] },
        },
      },
    },
  }, async (req, reply) => {
    const { ids, channel, action } = req.body
    const rows = await db.select().from(questions).where(inArray(questions.id, ids))

    const skipped: { id: string; reason: string }[] = []
    const planned: { row: typeof rows[number]; next: QuestionChannel[] }[] = []
    let unchanged = 0

    for (const id of ids) {
      if (!rows.some(row => row.id === id)) skipped.push({ id, reason: 'питання не знайдено' })
    }
    for (const row of rows) {
      // Main-round questions carry no training channels at all — the same rule
      // the editor enforces (assertQuestionDistribution).
      if (row.isOlympiad) {
        skipped.push({ id: row.id, reason: 'питання основного туру не має розділів' })
        continue
      }
      const current = row.channels ?? []
      const next = action === 'add'
        ? normalizeQuestionChannels([...current, channel])
        : current.filter(item => item !== channel)
      if (next.length === current.length && next.every((item, index) => item === current[index])) {
        unchanged++
        continue
      }
      // Fail closed: a published question with no section is served nowhere and
      // would silently disappear from the site on the next export.
      if (!next.length && row.editorialStatus === 'published') {
        skipped.push({ id: row.id, reason: 'опубліковане питання не може лишитися без розділу' })
        continue
      }
      planned.push({ row, next })
    }

    const now = new Date()
    const updated: string[] = []
    await db.transaction(async tx => {
      for (const { row, next } of planned) {
        const [saved] = await tx
          .update(questions)
          .set({
            channels: next,
            version: row.version + 1,
            editVersion: row.editVersion + 1,
            updatedAt: now,
            updatedBy: req.user!.id,
          })
          .where(and(eq(questions.id, row.id), eq(questions.editVersion, row.editVersion)))
          .returning()
        if (!saved) {
          skipped.push({ id: row.id, reason: 'питання щойно змінив інший редактор' })
          continue
        }
        await tx.insert(questionRevisions).values({
          questionId: saved.id,
          editVersion: saved.editVersion,
          action: 'channels',
          snapshot: questionSnapshot(saved),
          changedBy: req.user!.id,
        })
        updated.push(saved.id)
      }
    })

    return reply.send({ updated: updated.length, unchanged, skipped })
  })

  // POST /api/admin/questions/status — the same editorial transition as the
  // single-question route, applied across a selection. Every guard from that
  // route is repeated per row and a blocked row is skipped with its reason
  // rather than failing the batch: reviewing a bank of drafts one modal at a
  // time is the slow path this exists to remove.
  app.post<{ Body: { ids: string[]; status: string } }>('/questions/status', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['ids', 'status'],
        additionalProperties: false,
        properties: {
          ids:    { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
          status: { type: 'string', enum: [...QUESTION_EDITORIAL_STATUSES] },
        },
      },
    },
  }, async (req, reply) => {
    const { ids } = req.body
    let status
    try { status = normalizeQuestionEditorialStatus(req.body.status) } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const rows = await db.select().from(questions).where(inArray(questions.id, ids))
    const skipped: { id: string; reason: string }[] = []
    const planned: typeof rows = []
    let unchanged = 0

    for (const id of ids) {
      if (!rows.some(row => row.id === id)) skipped.push({ id, reason: 'питання не знайдено' })
    }
    for (const row of rows) {
      if (row.editorialStatus === status) { unchanged++; continue }
      if (row.publishedAt && !['published', 'archived'].includes(status)) {
        skipped.push({ id: row.id, reason: 'опубліковану редакцію можна лише архівувати або опублікувати знову' })
        continue
      }
      if (status === 'review' || status === 'published') {
        const issues = questionReadinessIssues(row)
        if (issues.length) { skipped.push({ id: row.id, reason: `не готове: ${issues.join('; ')}` }); continue }
      }
      if (row.editorialStatus === 'published' && status !== 'published'
        && (await questionIsLocked(row.id) || await questionHasEventReference(row.id))) {
        skipped.push({ id: row.id, reason: 'опубліковане питання вже використовується' })
        continue
      }
      planned.push(row)
    }

    const now = new Date()
    const updated: string[] = []
    await db.transaction(async tx => {
      for (const row of planned) {
        const values: Record<string, unknown> = {
          editorialStatus: status,
          editVersion: row.editVersion + 1,
          updatedAt: now,
          updatedBy: req.user!.id,
        }
        if (status === 'published') {
          values.reviewedAt = now
          values.reviewedBy = req.user!.id
          values.publishedAt = now
          values.publishedBy = req.user!.id
        }
        const [saved] = await tx.update(questions).set(values)
          .where(and(eq(questions.id, row.id), eq(questions.editVersion, row.editVersion)))
          .returning()
        if (!saved) { skipped.push({ id: row.id, reason: 'питання щойно змінив інший редактор' }); continue }
        await tx.insert(questionRevisions).values({
          questionId: saved.id, editVersion: saved.editVersion, action: 'status',
          snapshot: questionSnapshot(saved), changedBy: req.user!.id,
        })
        updated.push(saved.id)
      }
    })

    return reply.send({ updated: updated.length, unchanged, skipped })
  })

  // POST /api/admin/questions/delete — bulk delete, drafts only, mirroring the
  // single-question rules. Deliberately a POST: the body carries the selection,
  // and a bodiless DELETE cannot.
  app.post<{ Body: { ids: string[] } }>('/questions/delete', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
          ids: { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
        },
      },
    },
  }, async (req, reply) => {
    const { ids } = req.body
    const rows = await db.select({
      id: questions.id, status: questions.editorialStatus,
    }).from(questions).where(inArray(questions.id, ids))

    const skipped: { id: string; reason: string }[] = []
    let deleted = 0

    for (const id of ids) {
      if (!rows.some(row => row.id === id)) skipped.push({ id, reason: 'питання не знайдено' })
    }
    for (const row of rows) {
      if (row.status !== 'draft') {
        skipped.push({ id: row.id, reason: 'видаляти можна лише чернетки — решту архівуй' })
        continue
      }
      if (await questionIsLocked(row.id)) {
        skipped.push({ id: row.id, reason: 'питання вже було видане учню' })
        continue
      }
      try {
        const [gone] = await db.delete(questions).where(eq(questions.id, row.id)).returning({ id: questions.id })
        if (gone) deleted++
      } catch (e) {
        // 23503: still referenced by history (e.g. a finished class game).
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23503') {
          skipped.push({ id: row.id, reason: 'питання використовується в історії ігор' })
          continue
        }
        throw e
      }
    }

    return reply.send({ deleted, skipped })
  })

  // PUT /api/admin/questions/:id/status — explicit editorial transition.
  app.put<{ Params: { id: string }; Body: { status: string; expectedEditVersion: number } }>(
    '/questions/:id/status',
    {
      preHandler: requireAdmin,
      schema: {
        params: {
          type: 'object', required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object', required: ['status', 'expectedEditVersion'], additionalProperties: false,
          properties: {
            status: { type: 'string', enum: [...QUESTION_EDITORIAL_STATUSES] },
            expectedEditVersion: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      let status
      try { status = normalizeQuestionEditorialStatus(req.body.status) } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
      const [current] = await db.select().from(questions).where(eq(questions.id, req.params.id)).limit(1)
      if (!current) return reply.code(404).send({ error: 'Питання не знайдено' })
      if (current.editVersion !== req.body.expectedEditVersion) {
        return reply.code(409).send({ error: 'Питання вже змінив інший редактор. Онови список і повтори дію.' })
      }
      if (status === current.editorialStatus) return reply.send({ question: current })
      if (current.publishedAt && !['published', 'archived'].includes(status)) {
        return reply.code(400).send({ error: 'Опубліковану редакцію можна лише архівувати або опублікувати знову' })
      }
      if (status === 'review' || status === 'published') {
        const issues = questionReadinessIssues(current)
        if (issues.length) return reply.code(400).send({ error: `Контент не готовий: ${issues.join('; ')}` })
      }
      if (current.editorialStatus === 'published' && status !== 'published'
        && (await questionIsLocked(current.id) || await questionHasEventReference(current.id))) {
        return reply.code(409).send({ error: 'Опубліковане питання вже використовується — його не можна зняти з публікації' })
      }

      const now = new Date()
      const updates: Record<string, unknown> = {
        editorialStatus: status,
        editVersion: current.editVersion + 1,
        updatedAt: now,
        updatedBy: req.user!.id,
      }
      if (status === 'published') {
        updates.reviewedAt = now
        updates.reviewedBy = req.user!.id
        updates.publishedAt = now
        updates.publishedBy = req.user!.id
      }

      try {
        const updated = await db.transaction(async tx => {
          const [row] = await tx.update(questions).set(updates).where(and(
            eq(questions.id, current.id),
            eq(questions.editVersion, req.body.expectedEditVersion),
          )).returning()
          if (!row) throw new QuestionEditConflictError()
          await tx.insert(questionRevisions).values({
            questionId: row.id, editVersion: row.editVersion, action: 'status',
            snapshot: questionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        return reply.send({ question: updated })
      } catch (err) {
        if (err instanceof QuestionEditConflictError) {
          return reply.code(409).send({ error: 'Питання вже змінив інший редактор. Онови список і повтори дію.' })
        }
        throw err
      }
    },
  )

  // GET /api/admin/questions/:id/revisions — immutable editorial history.
  app.get<{ Params: { id: string } }>('/questions/:id/revisions', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object', required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const revisions = await db.select().from(questionRevisions)
      .where(eq(questionRevisions.questionId, req.params.id))
      .orderBy(desc(questionRevisions.editVersion))
    return reply.send({ revisions })
  })

  // POST /api/admin/questions/:id/restore — restore content as a new draft.
  app.post<{ Params: { id: string }; Body: { revisionEditVersion: number; expectedEditVersion: number } }>(
    '/questions/:id/restore',
    {
      preHandler: requireAdmin,
      schema: {
        params: {
          type: 'object', required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object', required: ['revisionEditVersion', 'expectedEditVersion'], additionalProperties: false,
          properties: {
            revisionEditVersion: { type: 'integer', minimum: 1 },
            expectedEditVersion: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const [current] = await db.select().from(questions).where(eq(questions.id, req.params.id)).limit(1)
      if (!current) return reply.code(404).send({ error: 'Питання не знайдено' })
      if (current.editVersion !== req.body.expectedEditVersion) {
        return reply.code(409).send({ error: 'Питання вже змінив інший редактор. Онови список і повтори дію.' })
      }
      if (current.publishedAt) {
        return reply.code(409).send({ error: 'Опубліковане питання незмінне. Віднови потрібну редакцію через нову чернетку.' })
      }
      if (await questionIsLocked(current.id)) {
        return reply.code(409).send({ error: 'Питання вже використовується — відновлення змісту заблоковано' })
      }
      const [revision] = await db.select().from(questionRevisions).where(and(
        eq(questionRevisions.questionId, current.id),
        eq(questionRevisions.editVersion, req.body.revisionEditVersion),
      )).limit(1)
      if (!revision) return reply.code(404).send({ error: 'Ревізію не знайдено' })

      const restored = restoredQuestionValues(revision.snapshot)
      try {
        validateQuestionShape(restored.type as QuestionType, restored.options, restored.correct as number | null)
        normalizeQuestionTrack(restored.track)
        normalizeTopic(restored.topic, restored.track as QuestionTrack | null)
        normalizeQuestionMedia(restored.img, restored.imageAlt)
        const restoredChannels = normalizeQuestionChannels(restored.channels ?? current.channels)
        const restoredIsOlympiad = restored.isOlympiad !== undefined
          ? Boolean(restored.isOlympiad)
          : Boolean(current.isOlympiad)
        assertQuestionDistribution(restoredIsOlympiad, restoredChannels)
        restored.channels = restoredChannels
      } catch (err) {
        return reply.code(400).send({ error: `Ревізію неможливо відновити: ${(err as Error).message}` })
      }

      try {
        const updated = await db.transaction(async tx => {
          const [row] = await tx.update(questions).set({
            ...restored,
            version: current.version + 1,
            editVersion: current.editVersion + 1,
            editorialStatus: 'draft',
            updatedAt: new Date(),
            updatedBy: req.user!.id,
          }).where(and(
            eq(questions.id, current.id),
            eq(questions.editVersion, req.body.expectedEditVersion),
          )).returning()
          if (!row) throw new QuestionEditConflictError()
          await tx.insert(questionRevisions).values({
            questionId: row.id, editVersion: row.editVersion, action: 'restore',
            snapshot: questionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        return reply.send({ question: updated })
      } catch (err) {
        if (err instanceof QuestionEditConflictError) {
          return reply.code(409).send({ error: 'Питання вже змінив інший редактор. Онови список і повтори дію.' })
        }
        throw err
      }
    },
  )

  // DELETE /api/admin/questions/:id
  app.delete<{ Params: { id: string } }>(
    '/questions/:id',
    {
      preHandler: requireAdmin,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params
      const [current] = await db.select({ status: questions.editorialStatus })
        .from(questions).where(eq(questions.id, id)).limit(1)
      if (!current) return reply.code(404).send({ error: 'Питання не знайдено' })
      if (current.status !== 'draft') {
        return reply.code(409).send({ error: 'Видаляти можна лише чернетки. Інший контент архівуй через зміну статусу.' })
      }
      if (await questionIsLocked(id)) {
        return reply.code(409).send({ error: 'Не можна видаляти питання активної олімпіади або питання, яке вже було видане учню' })
      }
      let deleted
      try {
        [deleted] = await db
          .delete(questions)
          .where(eq(questions.id, id))
          .returning({ id: questions.id })
      } catch (e) {
        // FK 23503: питання ще згадується історією (напр. завершеною класною грою).
        // Чесний 409 замість 500 — редагувати такі питання можна, видаляти ні.
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23503') {
          return reply.code(409).send({ error: 'Питання використовується в історії ігор — видалити не можна' })
        }
        throw e
      }
      if (!deleted) return reply.code(404).send({ error: 'Питання не знайдено' })
      return reply.code(204).send()
    }
  )

  // ── Home entitlements: ручне керування доступом (до платіжного провайдера) ─
  // Кожна зміна статусу пише audit-подію. Entitlement відкриває доступ, але
  // ніколи не змінює скоринг чи відповіді (docs/security-model.md).

  const leadUuidParam = {
    type: 'object',
    required: ['leadId'],
    properties: { leadId: { type: 'string', format: 'uuid' } },
  } as const

  // GET /api/admin/home-entitlements/:leadId — стан + журнал змін
  app.get<{ Params: { leadId: string } }>('/home-entitlements/:leadId', {
    preHandler: requireAdmin,
    schema: { params: leadUuidParam },
  }, async (req, reply) => {
    const [ent] = await db.select().from(homeEntitlements)
      .where(eq(homeEntitlements.leadId, req.params.leadId)).limit(1)
    if (!ent) return reply.code(404).send({ error: 'Entitlement не знайдено' })

    const events = await db.select().from(homeEntitlementEvents)
      .where(eq(homeEntitlementEvents.entitlementId, ent.id))
      .orderBy(desc(homeEntitlementEvents.createdAt))
      .limit(20)

    return reply.send({ entitlement: ent, events })
  })

  // PUT /api/admin/home-entitlements/:leadId — grant/зміна статусу (upsert)
  app.put<{ Params: { leadId: string }; Body: { status: string; currentPeriodEnd?: string; reason?: string } }>('/home-entitlements/:leadId', {
    preHandler: requireAdmin,
    schema: {
      params: leadUuidParam,
      body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: {
          status:           { type: 'string', enum: [...ENTITLEMENT_STATUSES] },
          currentPeriodEnd: { type: 'string', format: 'date-time' },
          reason:           { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (req, reply) => {
    const [lead] = await db.select({ id: homeLeads.id }).from(homeLeads)
      .where(eq(homeLeads.id, req.params.leadId)).limit(1)
    if (!lead) return reply.code(404).send({ error: 'Лід не знайдено' })

    const periodEnd = req.body.currentPeriodEnd ? new Date(req.body.currentPeriodEnd) : null
    if (periodEnd && Number.isNaN(periodEnd.getTime())) {
      return reply.code(400).send({ error: 'Невірна дата кінця періоду' })
    }

    try {
      const result = await applyEntitlementChange(db, lead.id, {
        status: normalizeEntitlementStatus(req.body.status),
        currentPeriodEnd: periodEnd,
        reason: req.body.reason ?? null,
      }, 'admin')
      return reply.send({ entitlement: result })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // GET /api/admin/missions — registry plus editorial state.
  app.get('/missions', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = await db
      .select()
      .from(missions)
      .orderBy(asc(missions.track), asc(missions.grade), asc(missions.id))
    return reply.send({ missions: list })
  })

  app.post<{ Body: Record<string, unknown> }>('/missions', { preHandler: requireAdmin }, async (req, reply) => {
    let input: NormalizedMissionInput
    try { input = normalizeEditableMission(req.body) } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    const [exists] = await db.select({ id: missions.id }).from(missions).where(eq(missions.id, input.id)).limit(1)
    if (exists) return reply.code(409).send({ error: 'Місія з таким id вже існує' })
    const created = await db.transaction(async tx => {
      const [row] = await tx.insert(missions).values({
        ...input, config: { ...input.config }, status: 'draft', createdBy: req.user!.id, updatedBy: req.user!.id,
      }).returning()
      await tx.insert(missionRevisions).values({
        missionId: row.id, editVersion: row.editVersion, action: 'create',
        snapshot: missionSnapshot(row), changedBy: req.user!.id,
      })
      return row
    })
    return reply.code(201).send({ mission: created })
  })

  app.put<{ Params: { id: string }; Body: Record<string, unknown> & { expectedEditVersion?: number } }>(
    '/missions/:id', { preHandler: requireAdmin }, async (req, reply) => {
      let input: NormalizedMissionInput
      try { input = normalizeEditableMission({ ...req.body, id: req.params.id }) } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
      const [current] = await db.select().from(missions).where(eq(missions.id, input.id)).limit(1)
      if (!current) return reply.code(404).send({ error: 'Місію не знайдено' })
      if (!(EDITABLE_MISSION_KINDS as readonly string[]).includes(current.kind)) return reply.code(409).send({ error: 'Цей тип місії поки доступний лише для перегляду' })
      if (!Number.isInteger(req.body.expectedEditVersion) || current.editVersion !== req.body.expectedEditVersion) {
        return reply.code(409).send({ error: 'Місію вже змінив інший редактор. Онови список і повтори правки.' })
      }
      try {
        const updated = await db.transaction(async tx => {
          const [row] = await tx.update(missions).set({
            title: input.title, track: input.track, grade: input.grade, config: { ...input.config },
            version: current.version + 1, editVersion: current.editVersion + 1,
            status: 'draft', updatedAt: new Date(), updatedBy: req.user!.id,
          }).where(and(eq(missions.id, input.id), eq(missions.editVersion, current.editVersion))).returning()
          if (!row) throw new MissionEditConflictError()
          await tx.insert(missionRevisions).values({
            missionId: row.id, editVersion: row.editVersion, action: 'update',
            snapshot: missionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        return reply.send({ mission: updated })
      } catch (err) {
        if (err instanceof MissionEditConflictError) return reply.code(409).send({ error: 'Місію вже змінив інший редактор.' })
        throw err
      }
    },
  )

  app.put<{ Params: { id: string }; Body: { status?: string; expectedEditVersion?: number } }>(
    '/missions/:id/status', { preHandler: requireAdmin }, async (req, reply) => {
      let status
      let missionId
      try {
        status = normalizeMissionStatus(req.body.status)
        missionId = normalizeMissionSlug(req.params.id)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
      try {
        const updated = await db.transaction(async tx => {
          const [current] = await tx.select().from(missions).where(eq(missions.id, missionId)).limit(1).for('update')
          if (!current) return null
          if (!(EDITABLE_MISSION_KINDS as readonly string[]).includes(current.kind)) throw new Error('Цей тип місії поки доступний лише для перегляду')
          if (!Number.isInteger(req.body.expectedEditVersion) || current.editVersion !== req.body.expectedEditVersion) {
            throw new MissionEditConflictError()
          }
          const input = normalizeEditableMission({
            id: current.id, title: current.title, kind: current.kind,
            track: current.track, grade: current.grade, config: current.config,
          })
          if ((status === 'review' || status === 'published') && input.kind === 'question-set') {
            const questionIds = input.config.questionSets.flatMap(set => set.questionIds)
            const selected = await tx.select({
              id: questions.id, grade: questions.grade, track: questions.track,
              status: questions.editorialStatus,
            }).from(questions).where(inArray(questions.id, questionIds)).for('share')
            if (selected.length !== questionIds.length) throw new Error('Один або кілька questionId не існують')
            const invalid = selected.filter(question => question.status !== 'published'
              || question.grade !== input.grade || question.track !== input.track)
            if (invalid.length) throw new Error(`Питання не опубліковані або не відповідають класу/напряму: ${invalid.map(q => q.id).join(', ')}`)
          }
          const now = new Date()
          const updates: Record<string, unknown> = {
            status, editVersion: current.editVersion + 1, updatedAt: now, updatedBy: req.user!.id,
          }
          if (status === 'review') { updates.reviewedAt = now; updates.reviewedBy = req.user!.id }
          if (status === 'published') {
            updates.publishedVersion = current.version
            updates.publishedSnapshot = missionPublishedSnapshot(input, current.version)
            updates.publishedAt = now
            updates.publishedBy = req.user!.id
          }
          const [row] = await tx.update(missions).set(updates).where(and(
            eq(missions.id, current.id), eq(missions.editVersion, current.editVersion),
          )).returning()
          if (!row) throw new MissionEditConflictError()
          await tx.insert(missionRevisions).values({
            missionId: row.id, editVersion: row.editVersion, action: 'status',
            snapshot: missionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        if (!updated) return reply.code(404).send({ error: 'Місію не знайдено' })
        return reply.send({ mission: updated })
      } catch (err) {
        if (err instanceof MissionEditConflictError) return reply.code(409).send({ error: 'Місію вже змінив інший редактор.' })
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  app.get<{ Params: { id: string } }>('/missions/:id/revisions', { preHandler: requireAdmin }, async (req, reply) => {
    let missionId
    try { missionId = normalizeMissionSlug(req.params.id) } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    const revisions = await db.select().from(missionRevisions)
      .where(eq(missionRevisions.missionId, missionId)).orderBy(desc(missionRevisions.editVersion))
    return reply.send({ revisions })
  })

  app.post<{ Params: { id: string }; Body: { revisionEditVersion?: number; expectedEditVersion?: number } }>(
    '/missions/:id/restore', { preHandler: requireAdmin }, async (req, reply) => {
      let missionId
      try { missionId = normalizeMissionSlug(req.params.id) } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
      if (!Number.isInteger(req.body.revisionEditVersion) || !Number.isInteger(req.body.expectedEditVersion)) {
        return reply.code(400).send({ error: 'Потрібні коректні версії редакції' })
      }
      try {
        const updated = await db.transaction(async tx => {
          const [current] = await tx.select().from(missions).where(eq(missions.id, missionId)).limit(1).for('update')
          if (!current) return null
          if (!(EDITABLE_MISSION_KINDS as readonly string[]).includes(current.kind)) throw new Error('Цей тип місії не відновлюється цим редактором')
          if (current.editVersion !== req.body.expectedEditVersion) throw new MissionEditConflictError()
          const [revision] = await tx.select().from(missionRevisions).where(and(
            eq(missionRevisions.missionId, current.id),
            eq(missionRevisions.editVersion, req.body.revisionEditVersion!),
          )).limit(1)
          if (!revision) throw new Error('Ревізію не знайдено')
          const snapshot = revision.snapshot
          const input = normalizeEditableMission({
            id: current.id, title: snapshot.title, kind: snapshot.kind,
            track: snapshot.track, grade: snapshot.grade, config: snapshot.config,
          })
          const [row] = await tx.update(missions).set({
            title: input.title, track: input.track, grade: input.grade, config: { ...input.config },
            version: current.version + 1, editVersion: current.editVersion + 1,
            status: 'draft', updatedAt: new Date(), updatedBy: req.user!.id,
          }).where(and(eq(missions.id, current.id), eq(missions.editVersion, current.editVersion))).returning()
          if (!row) throw new MissionEditConflictError()
          await tx.insert(missionRevisions).values({
            missionId: row.id, editVersion: row.editVersion, action: 'restore',
            snapshot: missionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        if (!updated) return reply.code(404).send({ error: 'Місію не знайдено' })
        return reply.send({ mission: updated })
      } catch (err) {
        if (err instanceof MissionEditConflictError) return reply.code(409).send({ error: 'Місію вже змінив інший редактор.' })
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  // ── Мікро-уроки (0032): авторинг теорії для карти шляху ────────────────────
  // Дітям контент їде статичним бандлом (npm run export:lessons), тому CRUD
  // не має рантайм-впливу на дитячі сторінки до наступного експорту.

  // GET /api/admin/lessons
  app.get('/lessons', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = await db.select().from(microLessons).orderBy(asc(microLessons.id))
    return reply.send({ lessons: list })
  })

  // POST /api/admin/lessons — створення з явним slug
  app.post<{ Body: { id: string } & Record<string, unknown> }>(
    '/lessons',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const id = normalizeLessonSlug(req.body?.id)
        const content = normalizeLessonContent(req.body)
        const [existing] = await db.select({ id: microLessons.id })
          .from(microLessons).where(eq(microLessons.id, id)).limit(1)
        if (existing) return reply.code(409).send({ error: 'Урок з таким id вже існує' })
        const created = await db.transaction(async tx => {
          const [row] = await tx.insert(microLessons).values({
            id, title: content.title, cards: content.cards, videoUrl: content.videoUrl,
            checkQuestions: content.checkQuestions, createdBy: req.user!.id, updatedBy: req.user!.id,
          }).returning()
          await tx.insert(microLessonRevisions).values({
            lessonId: row.id, editVersion: row.editVersion, action: 'create',
            snapshot: lessonRevisionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        return reply.code(201).send({ lesson: created })
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  // PUT /api/admin/lessons/:id — оновлення контенту; зміна контенту піднімає version
  app.put<{ Params: { id: string }; Body: { expectedEditVersion?: number } & Record<string, unknown> }>(
    '/lessons/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const id = normalizeLessonSlug(req.params.id)
        const content = normalizeLessonContent(req.body)
        const [existing] = await db.select().from(microLessons)
          .where(eq(microLessons.id, id)).limit(1)
        if (!existing) return reply.code(404).send({ error: 'Урок не знайдено' })
        if (!Number.isInteger(req.body.expectedEditVersion) || req.body.expectedEditVersion !== existing.editVersion) {
          return reply.code(409).send({ error: 'Урок уже змінив інший редактор. Онови список і повтори правки.' })
        }

        const prev = normalizeLessonContent({
          title: existing.title,
          cards: existing.cards,
          videoUrl: existing.videoUrl,
          checkQuestions: existing.checkQuestions,
        })
        const bump = lessonContentChanged(prev, content)
        const updated = await db.transaction(async tx => {
          const [row] = await tx.update(microLessons).set({
            title: content.title, cards: content.cards, videoUrl: content.videoUrl,
            checkQuestions: content.checkQuestions,
            version: bump ? existing.version + 1 : existing.version,
            editVersion: existing.editVersion + 1,
            status: bump ? 'draft' : existing.status,
            updatedAt: new Date(), updatedBy: req.user!.id,
          }).where(and(
            eq(microLessons.id, id), eq(microLessons.editVersion, existing.editVersion),
          )).returning()
          if (!row) throw new LessonEditConflictError()
          await tx.insert(microLessonRevisions).values({
            lessonId: row.id, editVersion: row.editVersion, action: 'update',
            snapshot: lessonRevisionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        return reply.send({ lesson: updated, versionBumped: bump })
      } catch (err) {
        if (err instanceof LessonEditConflictError) {
          return reply.code(409).send({ error: 'Урок уже змінив інший редактор. Онови список і повтори правки.' })
        }
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  app.get<{ Params: { id: string } }>('/lessons/:id/revisions', {
    preHandler: requireAdmin,
  }, async (req, reply) => {
    let id: string
    try { id = normalizeLessonSlug(req.params.id) } catch (err) { return reply.code(400).send({ error: (err as Error).message }) }
    const revisions = await db.select().from(microLessonRevisions)
      .where(eq(microLessonRevisions.lessonId, id)).orderBy(desc(microLessonRevisions.editVersion))
    return reply.send({ revisions })
  })

  app.post<{ Params: { id: string }; Body: { revisionEditVersion?: number; expectedEditVersion?: number } }>(
    '/lessons/:id/restore', { preHandler: requireAdmin }, async (req, reply) => {
      try {
        const id = normalizeLessonSlug(req.params.id)
        if (!Number.isInteger(req.body.revisionEditVersion) || !Number.isInteger(req.body.expectedEditVersion)) {
          return reply.code(400).send({ error: 'Потрібні коректні версії редакції' })
        }
        const [current] = await db.select().from(microLessons).where(eq(microLessons.id, id)).limit(1)
        if (!current) return reply.code(404).send({ error: 'Урок не знайдено' })
        if (current.editVersion !== req.body.expectedEditVersion) {
          return reply.code(409).send({ error: 'Урок уже змінив інший редактор. Онови список і повтори дію.' })
        }
        const [revision] = await db.select().from(microLessonRevisions).where(and(
          eq(microLessonRevisions.lessonId, id),
          eq(microLessonRevisions.editVersion, req.body.revisionEditVersion!),
        )).limit(1)
        if (!revision) return reply.code(404).send({ error: 'Ревізію не знайдено' })
        const content = contentFromLessonRevision(revision.snapshot)
        const updated = await db.transaction(async tx => {
          const [row] = await tx.update(microLessons).set({
            title: content.title, cards: content.cards, videoUrl: content.videoUrl,
            checkQuestions: content.checkQuestions, version: current.version + 1,
            editVersion: current.editVersion + 1, status: 'draft',
            updatedAt: new Date(), updatedBy: req.user!.id,
          }).where(and(eq(microLessons.id, id), eq(microLessons.editVersion, current.editVersion))).returning()
          if (!row) throw new LessonEditConflictError()
          await tx.insert(microLessonRevisions).values({
            lessonId: row.id, editVersion: row.editVersion, action: 'restore',
            snapshot: lessonRevisionSnapshot(row), changedBy: req.user!.id,
          })
          return row
        })
        return reply.send({ lesson: updated })
      } catch (err) {
        if (err instanceof LessonEditConflictError) return reply.code(409).send({ error: 'Урок уже змінив інший редактор.' })
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  // ── Карти шляху (0033): редагування структури з адмінки ───────────────────
  // Дітям структура їде статичним бандлом (npm run export:path); валідація
  // path-progress читає БД напряму (TTL-кеш скидається при збереженні).

  // GET /api/admin/path-maps
  app.get('/path-maps', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = await db.select().from(pathMaps).orderBy(asc(pathMaps.grade))
    return reply.send({ maps: list })
  })

  // PUT /api/admin/path-maps/:pathId — заміна точок карти цілком.
  // Зміна активності/required/назви кроку автоматично піднімає його version.
  app.put<{ Params: { pathId: string }; Body: { expectedVersion?: number; title?: string; points: unknown } }>(
    '/path-maps/:pathId',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const pathId = req.params.pathId
        if (!/^grade-[1-4]$/.test(pathId)) return reply.code(400).send({ error: 'Невідомий шлях' })
        if (!Number.isInteger(req.body?.expectedVersion) || (req.body.expectedVersion as number) < 1) {
          return reply.code(400).send({ error: 'Потрібна актуальна expectedVersion карти' })
        }

        const saved = await db.transaction(async tx => {
          const [existing] = await tx.select().from(pathMaps)
            .where(eq(pathMaps.pathId, pathId)).limit(1).for('update')
          if (!existing) return null
          if (existing.version !== req.body.expectedVersion) throw new PathMapConflictError()

          const grade = existing.grade
          let nextPoints = validatePathMapPoints(req.body.points)
          for (const point of nextPoints) {
            if (!point.id.startsWith(`g${grade}-`)) {
              throw new Error(`${point.id}: id точки має починатися з g${grade}-`)
            }
          }

          const lessonIds = pathMapLessonIds(nextPoints)
          const lessons = lessonIds.length
            ? await tx.select({
              id: microLessons.id, version: microLessons.version,
              publishedVersion: microLessons.publishedVersion, status: microLessons.status,
            })
              .from(microLessons).where(inArray(microLessons.id, lessonIds)).for('share')
            : []
          const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]))
          for (const lessonId of lessonIds) {
            const lesson = lessonById.get(lessonId)
            if (!lesson) throw new Error(`Урок «${lessonId}» не існує`)
            if (existing.status === 'published' && (!lesson.publishedVersion || lesson.status === 'archived')) {
              throw new Error(`Урок «${lessonId}» не опублікований`)
            }
          }
          nextPoints = snapshotLessonVersions(nextPoints,
            new Map(lessons.map(lesson => [lesson.id, lesson.publishedVersion ?? lesson.version])))

          const missionIds = pathMapMissionIds(nextPoints)
          const missionRows = missionIds.length
            ? await tx.select({
              id: missions.id, kind: missions.kind, title: missions.title, track: missions.track, grade: missions.grade,
              version: missions.version, publishedVersion: missions.publishedVersion, status: missions.status,
              config: missions.config, publishedSnapshot: missions.publishedSnapshot,
            })
              .from(missions).where(inArray(missions.id, missionIds)).for('share')
            : []
          const missionById = new Map(missionRows.map(mission => [mission.id, mission]))
          for (const missionId of missionIds) {
            const mission = missionById.get(missionId)
            if (!mission) throw new Error(`Місію «${missionId}» не знайдено`)
            if (existing.status === 'published' && (!mission.publishedVersion || mission.status === 'archived')) {
              throw new Error(`Місія «${missionId}» не опублікована`)
            }
            const source = mission.publishedSnapshot ?? {
              id: mission.id, title: mission.title, kind: mission.kind,
              track: mission.track, grade: mission.grade, config: mission.config,
            }
            const snapshot = normalizeEditableMission(source)
            if (snapshot.grade !== grade) throw new Error(`Місія «${missionId}» належить до ${snapshot.grade} класу, а карта — до ${grade}`)
            for (const point of nextPoints) {
              for (const step of point.activities) {
                if (step.activity.kind !== 'mission-ref' || step.activity.missionId !== missionId) continue
                if (step.activity.missionKind !== snapshot.kind) throw new Error(`${point.id}/${step.id}: тип місії «${missionId}» змінився`)
                if (snapshot.kind === 'simulator-game') {
                  if (step.activity.scenarioKey !== snapshot.config.scenarioKey) {
                    throw new Error(`${point.id}/${step.id}: scenarioKey місії «${missionId}» не збігається`)
                  }
                } else if (!('gameKey' in snapshot.config) || step.activity.gameKey !== snapshot.config.gameKey) {
                  throw new Error(`${point.id}/${step.id}: gameKey місії «${missionId}» не збігається`)
                }
              }
            }
          }
          nextPoints = snapshotMissionVersions(nextPoints,
            new Map(missionRows.map(mission => [mission.id, mission.publishedVersion ?? mission.version])))

          const prevPoints = validatePathMapPoints(existing.points)
          const revisions = await tx.select({ points: pathMapRevisions.points })
            .from(pathMapRevisions).where(eq(pathMapRevisions.pathId, pathId))
          const historicalVersions = collectHistoricalStepVersions([
            existing.points,
            ...revisions.map(revision => revision.points),
          ])
          const historicalPointIds = collectHistoricalPointIds(revisions.map(revision => revision.points))
          const previousPointIds = new Set(prevPoints.map(point => point.id))
          for (const point of nextPoints) {
            if (!previousPointIds.has(point.id) && historicalPointIds.has(point.id)) {
              throw new Error(`${point.id}: видалений id точки не можна використовувати повторно`)
            }
          }
          const nextPointIds = new Set(nextPoints.map(point => point.id))
          const removedPointIds = prevPoints.map(point => point.id).filter(id => !nextPointIds.has(id))
          if (removedPointIds.length) {
            const [usedPoint] = await tx.select({ pointId: homePathProgress.pointId })
              .from(homePathProgress).where(and(
                eq(homePathProgress.pathId, pathId),
                inArray(homePathProgress.pointId, removedPointIds),
              )).limit(1)
            if (usedPoint) throw new Error(`Точку «${usedPoint.pointId}» не можна видалити: для неї вже є прогрес`)
          }
          const { points, bumped } = bumpChangedStepVersions(prevPoints, nextPoints, historicalVersions)
          const requestedTitle = typeof req.body.title === 'string' ? req.body.title.trim() : ''
          if (requestedTitle.length > 160) throw new Error('Назва карти має містити не більше 160 символів')
          const title = requestedTitle || existing.title
          const nextVersion = existing.version + 1

          await tx.insert(pathMapRevisions).values({
            pathId: existing.pathId,
            version: existing.version,
            grade: existing.grade,
            title: existing.title,
            points: existing.points,
          }).onConflictDoNothing()

          const [updated] = await tx.update(pathMaps).set({
            title,
            points,
            version: nextVersion,
            updatedAt: new Date(),
          }).where(and(
            eq(pathMaps.pathId, pathId),
            eq(pathMaps.version, req.body.expectedVersion),
          )).returning()
          if (!updated) throw new PathMapConflictError()

          await tx.insert(pathMapRevisions).values({
            pathId: updated.pathId,
            version: updated.version,
            grade: updated.grade,
            title: updated.title,
            points: updated.points,
          })
          return { updated, bumped }
        })
        if (!saved) return reply.code(404).send({ error: 'Карту не знайдено' })
        invalidatePathCatalogCache()
        return reply.send({ map: saved.updated, bumpedSteps: saved.bumped })
      } catch (err) {
        if (err instanceof PathMapConflictError) {
          return reply.code(409).send({ error: 'Карту вже змінив інший редактор. Онови вкладку й повтори правки.' })
        }
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  // PUT /api/admin/lessons/:id/status — draft | review | published | archived
  app.put<{ Params: { id: string }; Body: { status: string; expectedEditVersion?: number } }>(
    '/lessons/:id/status',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const id = normalizeLessonSlug(req.params.id)
        const status = normalizeLessonStatus(req.body?.status)
        const outcome = await db.transaction(async tx => {
          if (status === 'archived') {
            // Lock maps before the lesson row. Path saves use the same order,
            // preventing an archive/save race from creating a broken reference.
            const publishedMaps = await tx.select({ pathId: pathMaps.pathId, points: pathMaps.points })
              .from(pathMaps).where(eq(pathMaps.status, 'published')).for('share')
            const referencedBy = publishedMaps
              .filter(map => {
                try { return pathMapLessonIds(validatePathMapPoints(map.points)).includes(id) } catch { return false }
              })
              .map(map => map.pathId)
            if (referencedBy.length) return { referencedBy, updated: null }
          }
          const [current] = await tx.select().from(microLessons).where(eq(microLessons.id, id)).limit(1).for('update')
          if (!current) return { referencedBy: [] as string[], updated: null }
          if (!Number.isInteger(req.body.expectedEditVersion) || current.editVersion !== req.body.expectedEditVersion) {
            throw new LessonEditConflictError()
          }
          const content = normalizeLessonContent({
            title: current.title, cards: current.cards, videoUrl: current.videoUrl,
            checkQuestions: current.checkQuestions,
          })
          const now = new Date()
          const updates: Record<string, unknown> = {
            status, editVersion: current.editVersion + 1, updatedAt: now, updatedBy: req.user!.id,
          }
          if (status === 'review') {
            updates.reviewedAt = now
            updates.reviewedBy = req.user!.id
          }
          if (status === 'published') {
            updates.publishedVersion = current.version
            updates.publishedSnapshot = lessonPublishedSnapshot(id, current.version, content)
            updates.publishedAt = now
            updates.publishedBy = req.user!.id
          }
          const [updated] = await tx.update(microLessons)
            .set(updates)
            .where(and(eq(microLessons.id, id), eq(microLessons.editVersion, current.editVersion)))
            .returning()
          if (!updated) throw new LessonEditConflictError()
          await tx.insert(microLessonRevisions).values({
            lessonId: updated.id, editVersion: updated.editVersion, action: 'status',
            snapshot: lessonRevisionSnapshot(updated), changedBy: req.user!.id,
          })
          return { referencedBy: [] as string[], updated: updated ?? null }
        })
        if (outcome.referencedBy.length) {
          return reply.code(409).send({
            error: `Урок використовується в опублікованих картах: ${outcome.referencedBy.join(', ')}`,
          })
        }
        if (!outcome.updated) return reply.code(404).send({ error: 'Урок не знайдено' })
        return reply.send({ lesson: outcome.updated })
      } catch (err) {
        if (err instanceof LessonEditConflictError) {
          return reply.code(409).send({ error: 'Урок уже змінив інший редактор. Онови список і повтори дію.' })
        }
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )
}
