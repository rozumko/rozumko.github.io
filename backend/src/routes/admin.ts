import type { FastifyInstance } from 'fastify'
import { eq, desc, count, and, asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, accessCodes, attempts, attemptQuestions, appUsers, olympiadEvents, eventQuestions, schoolSessions, schoolSessionQuestions, type QuestionTrack } from '../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { assertQuestionsBelongToGrade, normalizeEventQuestionSelection } from './event-questions-validation.js'
import { validateQuestionShape, type QuestionType } from './question-input-validation.js'
import {
  EVENT_STATUSES,
  assertEventDateOrder,
  assertEventQuestionSelectionAllowed,
  assertEventRuleChangesAllowed,
  normalizeEventInput,
  normalizeEventPatch,
} from './event-validation.js'

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
        required: ['grade'],
        properties: { grade: { type: 'string' } },
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

  // GET /api/admin/questions?grade=&isOlympiad=&difficulty=&track=
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; difficulty?: string; track?: string }
  }>('/questions', { preHandler: requireAdmin }, async (req, reply) => {
    const { grade, isOlympiad, difficulty } = req.query
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
    try {
      track = normalizeQuestionTrack(req.body.track)
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
      .values({ q, grade, difficulty, track, isOlympiad, type, options: shape.options as any, correct: shape.correct, explanation: explanation ?? null, code: code ?? null })
      .returning({ id: questions.id })
    return reply.code(201).send({ id: inserted.id })
  })

  // PUT /api/admin/questions/:id
  app.put<{
    Params: { id: string }
    Body: {
      q?: string; grade?: number; difficulty?: string; track?: QuestionTrack | null; isOlympiad?: boolean
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
    try {
      track = b.track !== undefined ? normalizeQuestionTrack(b.track) : undefined
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    // Завантажити поточний стан питання для merge-валідації
    const [current] = await db
      .select({ type: questions.type, correct: questions.correct, options: questions.options })
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1)
    if (!current) return reply.code(404).send({ error: 'Питання не знайдено' })
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
    if (b.isOlympiad  !== undefined) updates.isOlympiad  = b.isOlympiad
    if (b.type        !== undefined) updates.type        = b.type
    // options/correct беремо з провалідованої форми (нормалізовані)
    if (b.options !== undefined || b.type !== undefined) updates.options = shape.options
    if (b.correct !== undefined || b.type !== undefined) updates.correct = shape.correct  // null очищає
    if (b.explanation !== undefined) updates.explanation = b.explanation
    if (b.code        !== undefined) updates.code        = b.code

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
}
