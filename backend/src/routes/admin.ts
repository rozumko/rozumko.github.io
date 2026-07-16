import type { FastifyInstance } from 'fastify'
import { eq, desc, count, and, asc, inArray, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, questionRevisions, accessCodes, attempts, attemptQuestions, appUsers, olympiadEvents, eventQuestions, schoolSessions, schoolSessionQuestions, homeLeads, homeEntitlements, homeEntitlementEvents, homePathProgress, missions, missionRevisions, microLessons, microLessonRevisions, pathMapRevisions, pathMaps, contentPublications, type QuestionTrack } from '../db/schema.js'
import { normalizeLessonSlug, normalizeLessonStatus, normalizeLessonContent, lessonContentChanged } from './lesson-validation.js'
import { contentFromLessonRevision, lessonPublishedSnapshot, lessonRevisionSnapshot } from './lesson-editorial.js'
import { EDITABLE_MISSION_KINDS, missionPublishedSnapshot, missionSnapshot, normalizeEditableMission, normalizeMissionSlug, normalizeMissionStatus, type NormalizedMissionInput } from './mission-editorial.js'
import { validatePathMapPoints, bumpChangedStepVersions, pathMapLessonIds, type PathPointInput } from './path-map-validation.js'
import { invalidatePathCatalogCache } from './path-catalog.js'
import { ENTITLEMENT_STATUSES, normalizeEntitlementStatus, applyEntitlementChange } from './home-entitlement.js'
import { requireAdmin } from '../lib/auth.js'
import { assertQuestionsBelongToGrade, normalizeEventQuestionSelection } from './event-questions-validation.js'
import { validateQuestionShape, type QuestionType } from './question-input-validation.js'
import {
  QUESTION_EDITORIAL_STATUSES,
  normalizeQuestionEditorialStatus,
  normalizeQuestionMedia,
  questionReadinessIssues,
  questionSnapshot,
  restoredQuestionValues,
} from './question-editorial.js'
import { ALL_TOPICS, normalizeTopic, normalizeConceptKey, normalizeProgressionBand, type ConceptKey, type ProgressionBand } from '../lib/taxonomy.js'
import {
  EVENT_STATUSES,
  assertEventDateOrder,
  assertEventQuestionSelectionAllowed,
  assertEventRuleChangesAllowed,
  normalizeEventInput,
  normalizeEventPatch,
} from './event-validation.js'
import {
  buildContentPublicationManifest,
  contentManifestSha256,
  dispatchContentPublication,
} from '../lib/content-publication.js'

class PathMapConflictError extends Error {}
class QuestionEditConflictError extends Error {}
class LessonEditConflictError extends Error {}
class MissionEditConflictError extends Error {}

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
    return reply.send({ publications })
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
    const [[{ teachers }], [{ codes }], [{ results }], [{ events }]] = await Promise.all([
      db.select({ teachers: count() }).from(appUsers).where(eq(appUsers.role, 'teacher')),
      db.select({ codes:    count() }).from(accessCodes),
      db.select({ results:  count() }).from(attempts).where(eq(attempts.status, 'finished')),
      db.select({ events:   count() }).from(olympiadEvents).where(eq(olympiadEvents.status, 'active')),
    ])
    return reply.send({ teachers, codes, results, events })
  })

  // GET /api/admin/teachers
  app.get('/teachers', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = await db
      .select({ id: appUsers.id, email: appUsers.email, name: appUsers.name, status: appUsers.status, createdAt: appUsers.createdAt })
      .from(appUsers)
      .where(eq(appUsers.role, 'teacher'))
      .orderBy(desc(appUsers.createdAt))
    return reply.send({ teachers: list })
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
      .where(eq(appUsers.id, id))
      .returning({ id: appUsers.id, status: appUsers.status })
    if (!updated) return reply.code(404).send({ error: 'Користувача не знайдено' })
    return reply.send({ id: updated.id, status: updated.status })
  })

  // GET /api/admin/events
  app.get('/events', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = await db
      .select()
      .from(olympiadEvents)
      .orderBy(desc(olympiadEvents.startsAt))
    return reply.send({ events: list })
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
          status:      { type: 'string', enum: EVENT_STATUSES },
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
        timeMinutes: normalizePositiveInt(req.body.timeMinutes, 'timeMinutes', 15),
        questionsCount: normalizePositiveInt(req.body.questionsCount, 'questionsCount', 10),
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
      .select({ startsAt: olympiadEvents.startsAt, endsAt: olympiadEvents.endsAt, status: olympiadEvents.status })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)

    if (!current) return reply.code(404).send({ error: 'Подію не знайдено' })

    try {
      assertEventRuleChangesAllowed(await eventRulesAreLocked(req.params.id, current.status), req.body)
      assertEventDateOrder(updates.startsAt ?? current.startsAt, updates.endsAt ?? current.endsAt)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [updated] = await db
      .update(olympiadEvents)
      .set(updates)
      .where(eq(olympiadEvents.id, req.params.id))
      .returning()

    return reply.send({ event: updated })
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

    try {
      assertEventQuestionSelectionAllowed(await eventRulesAreLocked(event.id, event.status))
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

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
      .select({ id: olympiadEvents.id })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, req.params.id))
      .limit(1)

    if (!event) return reply.code(404).send({ error: 'Подію не знайдено' })

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

    return reply.send({ saved: true, count: selection.questionIds.length })
  })

  // GET /api/admin/results
  app.get('/results', { preHandler: requireAdmin }, async (_req, reply) => {
    const allAttempts = await db
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
      .where(inArray(attempts.status, ['finished', 'expired']))
      .orderBy(desc(attempts.finishedAt))
    return reply.send({ results: allAttempts })
  })

  // GET /api/admin/questions?grade=&isOlympiad=&difficulty=&track=&topic=&status=&search=
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; difficulty?: string; track?: string; topic?: string; status?: string; search?: string }
  }>('/questions', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          grade:      { type: 'string', enum: ['1', '2', '3', '4'] },
          isOlympiad: { type: 'string', enum: ['true', 'false'] },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          track:      { type: 'string', enum: ['informatics', 'computational-thinking', 'ai-basics'] },
          topic:      { type: 'string', enum: ALL_TOPICS as string[] },
          status:     { type: 'string', enum: [...QUESTION_EDITORIAL_STATUSES] },
          search:     { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
    },
  }, async (req, reply) => {
    const { grade, isOlympiad, difficulty, topic, status, search } = req.query
    let track: QuestionTrack | null
    try {
      track = normalizeQuestionTrack(req.query.track)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
    const filters = []
    if (grade)      filters.push(eq(questions.grade,      Number(grade)))
    if (isOlympiad) filters.push(eq(questions.isOlympiad, isOlympiad === 'true'))
    if (difficulty) filters.push(eq(questions.difficulty, difficulty))
    if (track)      filters.push(eq(questions.track,      track))
    if (topic)      filters.push(eq(questions.topic,      topic))
    if (status)     filters.push(eq(questions.editorialStatus, normalizeQuestionEditorialStatus(status)))
    if (search) {
      const pattern = `%${search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
      filters.push(or(ilike(questions.q, pattern), sql`${questions.id}::text ILIKE ${pattern}`)!)
    }

    const list = await db
      .select()
      .from(questions)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(questions.updatedAt), desc(questions.createdAt))
    return reply.send({ questions: list })
  })

  // POST /api/admin/questions
  app.post<{
    Body: {
      q: string; grade: number; difficulty: string; track?: QuestionTrack | null; isOlympiad: boolean
      topic?: string | null; conceptKey?: string | null; progressionBand?: string | null
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
          track:       { oneOf: [{ type: 'string', enum: ['informatics', 'computational-thinking', 'ai-basics'] }, { type: 'null' }] },
          isOlympiad:  { type: 'boolean' },
          topic:           { oneOf: [{ type: 'string', enum: ALL_TOPICS as string[] }, { type: 'null' }] },
          conceptKey:      { oneOf: [{ type: 'string' }, { type: 'null' }] },
          progressionBand: { oneOf: [{ type: 'string', enum: ['recognize', 'apply', 'reason'] }, { type: 'null' }] },
          type:        { type: 'string', enum: ['choice', 'truefalse', 'input', 'sort', 'sequence', 'match'] },
          options:     {},   // jsonb — будь-яка структура залежно від type
          correct:     { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          explanation: { type: 'string' },
          code:        { type: 'string' },
          img:         { oneOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          imageAlt:    { oneOf: [{ type: 'string', maxLength: 240 }, { type: 'null' }] },
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
    try {
      track           = normalizeQuestionTrack(req.body.track)
      topic           = normalizeTopic(req.body.topic, track)
      conceptKey      = normalizeConceptKey(req.body.conceptKey)
      progressionBand = normalizeProgressionBand(req.body.progressionBand)
      media             = normalizeQuestionMedia(req.body.img, req.body.imageAlt)
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
          q: q.trim(), grade, difficulty, track, topic, conceptKey, progressionBand, isOlympiad,
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
      q?: string; grade?: number; difficulty?: string; track?: QuestionTrack | null; isOlympiad?: boolean
      topic?: string | null; conceptKey?: string | null; progressionBand?: string | null
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
          track:       { oneOf: [{ type: 'string', enum: ['informatics', 'computational-thinking', 'ai-basics'] }, { type: 'null' }] },
          isOlympiad:  { type: 'boolean' },
          topic:           { oneOf: [{ type: 'string', enum: ALL_TOPICS as string[] }, { type: 'null' }] },
          conceptKey:      { oneOf: [{ type: 'string' }, { type: 'null' }] },
          progressionBand: { oneOf: [{ type: 'string', enum: ['recognize', 'apply', 'reason'] }, { type: 'null' }] },
          type:        { type: 'string', enum: ['choice', 'truefalse', 'input', 'sort', 'sequence', 'match'] },
          options:     {},
          correct:     { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          explanation: { type: 'string' },
          code:        { type: 'string' },
          img:         { oneOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          imageAlt:    { oneOf: [{ type: 'string', maxLength: 240 }, { type: 'null' }] },
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
    try {
      track           = b.track           !== undefined ? normalizeQuestionTrack(b.track) : undefined
      conceptKey      = b.conceptKey      !== undefined ? normalizeConceptKey(b.conceptKey) : undefined
      progressionBand = b.progressionBand !== undefined ? normalizeProgressionBand(b.progressionBand) : undefined
      if (b.img !== undefined || b.imageAlt !== undefined) {
        media = normalizeQuestionMedia(
          b.img !== undefined ? b.img : current.img,
          b.imageAlt !== undefined ? b.imageAlt : current.imageAlt,
        )
      }
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
    if (b.isOlympiad  !== undefined) updates.isOlympiad  = b.isOlympiad
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
      'grade', 'difficulty', 'track', 'topic', 'conceptKey', 'progressionBand', 'isOlympiad',
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
