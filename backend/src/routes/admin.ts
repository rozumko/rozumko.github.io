import type { FastifyInstance } from 'fastify'
import { eq, desc, count, and, asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, accessCodes, attempts, attemptQuestions, appUsers, olympiadEvents, eventQuestions, schoolSessions, schoolSessionQuestions, homeLeads, homeEntitlements, homeEntitlementEvents, homePathProgress, missions, microLessons, pathMapRevisions, pathMaps, type QuestionTrack } from '../db/schema.js'
import { normalizeLessonSlug, normalizeLessonStatus, normalizeLessonContent, lessonContentChanged } from './lesson-validation.js'
import { validatePathMapPoints, bumpChangedStepVersions, pathMapLessonIds, type PathPointInput } from './path-map-validation.js'
import { invalidatePathCatalogCache } from './path-catalog.js'
import { ENTITLEMENT_STATUSES, normalizeEntitlementStatus, applyEntitlementChange } from './home-entitlement.js'
import { requireAdmin } from '../lib/auth.js'
import { assertQuestionsBelongToGrade, normalizeEventQuestionSelection } from './event-questions-validation.js'
import { validateQuestionShape, type QuestionType } from './question-input-validation.js'
import { ALL_TOPICS, normalizeTopic, normalizeConceptKey, normalizeProgressionBand, type ConceptKey, type ProgressionBand } from '../lib/taxonomy.js'
import {
  EVENT_STATUSES,
  assertEventDateOrder,
  assertEventQuestionSelectionAllowed,
  assertEventRuleChangesAllowed,
  normalizeEventInput,
  normalizeEventPatch,
} from './event-validation.js'

class PathMapConflictError extends Error {}

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

  const [selectedForActiveEvent] = await db
    .select({ id: eventQuestions.id })
    .from(eventQuestions)
    .innerJoin(olympiadEvents, eq(eventQuestions.eventId, olympiadEvents.id))
    .where(and(eq(eventQuestions.questionId, questionId), eq(olympiadEvents.status, 'active')))
    .limit(1)
  if (selectedForActiveEvent) return true

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

export async function adminRoutes(app: FastifyInstance) {

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
          .select({ id: questions.id, grade: questions.grade, isOlympiad: questions.isOlympiad, type: questions.type })
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

  // GET /api/admin/questions?grade=&isOlympiad=&difficulty=&track=&topic=
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; difficulty?: string; track?: string; topic?: string }
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
        },
      },
    },
  }, async (req, reply) => {
    const { grade, isOlympiad, difficulty, topic } = req.query
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

    const list = await db
      .select()
      .from(questions)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(questions.createdAt))
    return reply.send({ questions: list })
  })

  // POST /api/admin/questions
  app.post<{
    Body: {
      q: string; grade: number; difficulty: string; track?: QuestionTrack | null; isOlympiad: boolean
      topic?: string | null; conceptKey?: string | null; progressionBand?: string | null
      type?: string; options: string[] | Record<string, unknown>
      correct?: number; explanation?: string; code?: string
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
        },
      },
    },
  }, async (req, reply) => {
    const { q, grade, difficulty, isOlympiad = false, options, correct, explanation, code } = req.body
    const type = (req.body.type ?? 'choice') as QuestionType
    let track: QuestionTrack | null
    let topic: string | null
    let conceptKey: ConceptKey | null
    let progressionBand: ProgressionBand | null
    try {
      track           = normalizeQuestionTrack(req.body.track)
      topic           = normalizeTopic(req.body.topic, track)
      conceptKey      = normalizeConceptKey(req.body.conceptKey)
      progressionBand = normalizeProgressionBand(req.body.progressionBand)
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

    const [inserted] = await db
      .insert(questions)
      .values({ q, grade, difficulty, track, topic, conceptKey, progressionBand, isOlympiad, type, options: shape.options as any, correct: shape.correct, explanation: explanation ?? null, code: code ?? null })
      .returning({ id: questions.id })
    return reply.code(201).send({ id: inserted.id })
  })

  // PUT /api/admin/questions/:id
  app.put<{
    Params: { id: string }
    Body: {
      q?: string; grade?: number; difficulty?: string; track?: QuestionTrack | null; isOlympiad?: boolean
      topic?: string | null; conceptKey?: string | null; progressionBand?: string | null
      type?: string; options?: string[] | Record<string, unknown>
      correct?: number; explanation?: string; code?: string
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
          options:     {},
          correct:     { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          explanation: { type: 'string' },
          code:        { type: 'string' },
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
    try {
      track           = b.track           !== undefined ? normalizeQuestionTrack(b.track) : undefined
      conceptKey      = b.conceptKey      !== undefined ? normalizeConceptKey(b.conceptKey) : undefined
      progressionBand = b.progressionBand !== undefined ? normalizeProgressionBand(b.progressionBand) : undefined
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    // Завантажити поточний стан питання для merge-валідації
    const [current] = await db
      .select({ type: questions.type, correct: questions.correct, options: questions.options, track: questions.track, topic: questions.topic, version: questions.version })
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1)
    if (!current) return reply.code(404).send({ error: 'Питання не знайдено' })

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

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (b.q           !== undefined) updates.q           = b.q
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
    if (b.explanation !== undefined) updates.explanation = b.explanation
    if (b.code        !== undefined) updates.code        = b.code

    // Змістовна правка (текст/варіанти/відповідь/тип) → нова версія питання
    if (b.q !== undefined || b.options !== undefined || b.correct !== undefined || b.type !== undefined) {
      updates.version = current.version + 1
    }

    const [updated] = await db
      .update(questions)
      .set(updates)
      .where(eq(questions.id, id))
      .returning({ id: questions.id })

    if (!updated) return reply.code(404).send({ error: 'Питання не знайдено' })
    return reply.send({ id: updated.id })
  })

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

  // GET /api/admin/missions — реєстр місій (read-only, редагування — пізніше)
  app.get('/missions', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = await db
      .select()
      .from(missions)
      .orderBy(asc(missions.track), asc(missions.grade), asc(missions.id))
    return reply.send({ missions: list })
  })

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
        const [created] = await db.insert(microLessons).values({
          id,
          title: content.title,
          cards: content.cards,
          videoUrl: content.videoUrl,
          checkQuestions: content.checkQuestions,
        }).returning()
        return reply.code(201).send({ lesson: created })
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  // PUT /api/admin/lessons/:id — оновлення контенту; зміна контенту піднімає version
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/lessons/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const id = normalizeLessonSlug(req.params.id)
        const content = normalizeLessonContent(req.body)
        const [existing] = await db.select().from(microLessons)
          .where(eq(microLessons.id, id)).limit(1)
        if (!existing) return reply.code(404).send({ error: 'Урок не знайдено' })

        const prev = normalizeLessonContent({
          title: existing.title,
          cards: existing.cards,
          videoUrl: existing.videoUrl,
          checkQuestions: existing.checkQuestions,
        })
        const bump = lessonContentChanged(prev, content)
        const [updated] = await db.update(microLessons).set({
          title: content.title,
          cards: content.cards,
          videoUrl: content.videoUrl,
          checkQuestions: content.checkQuestions,
          version: bump ? existing.version + 1 : existing.version,
          updatedAt: new Date(),
        }).where(eq(microLessons.id, id)).returning()
        return reply.send({ lesson: updated, versionBumped: bump })
      } catch (err) {
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
            ? await tx.select({ id: microLessons.id, version: microLessons.version, status: microLessons.status })
              .from(microLessons).where(inArray(microLessons.id, lessonIds)).for('share')
            : []
          const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]))
          for (const lessonId of lessonIds) {
            const lesson = lessonById.get(lessonId)
            if (!lesson) throw new Error(`Урок «${lessonId}» не існує`)
            if (existing.status === 'published' && lesson.status !== 'published') {
              throw new Error(`Урок «${lessonId}» не опублікований`)
            }
          }
          nextPoints = snapshotLessonVersions(nextPoints,
            new Map(lessons.map(lesson => [lesson.id, lesson.version])))

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

  // PUT /api/admin/lessons/:id/status — draft | published | archived
  app.put<{ Params: { id: string }; Body: { status: string } }>(
    '/lessons/:id/status',
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const id = normalizeLessonSlug(req.params.id)
        const status = normalizeLessonStatus(req.body?.status)
        const outcome = await db.transaction(async tx => {
          if (status !== 'published') {
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
          const [updated] = await tx.update(microLessons)
            .set({ status, updatedAt: new Date() })
            .where(eq(microLessons.id, id))
            .returning()
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
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )
}
