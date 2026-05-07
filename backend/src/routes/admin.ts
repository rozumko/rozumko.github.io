import type { FastifyInstance } from 'fastify'
import { eq, desc, count, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, accessCodes, attempts, appUsers, olympiadEvents } from '../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { EVENT_STATUSES, normalizeEventInput, normalizeEventPatch } from './event-validation.js'

export async function adminRoutes(app: FastifyInstance) {

  // GET /api/admin/stats
  app.get('/stats', { preHandler: requireAdmin }, async (_req, reply) => {
    const [[{ teachers }], [{ codes }], [{ results }]] = await Promise.all([
      db.select({ teachers: count() }).from(appUsers).where(eq(appUsers.role, 'teacher')),
      db.select({ codes:    count() }).from(accessCodes),
      db.select({ results:  count() }).from(attempts).where(eq(attempts.status, 'finished')),
    ])
    return reply.send({ teachers, codes, results })
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
    Body: { title: string; description?: string | null; startsAt: string; endsAt: string; status?: string }
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
        },
      },
    },
  }, async (req, reply) => {
    let eventData
    try {
      eventData = normalizeEventInput(req.body)
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
    Body: { title?: string; description?: string | null; startsAt?: string; endsAt?: string; status?: string }
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
        },
      },
    },
  }, async (req, reply) => {
    let updates
    try {
      updates = normalizeEventPatch(req.body)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const [updated] = await db
      .update(olympiadEvents)
      .set(updates)
      .where(eq(olympiadEvents.id, req.params.id))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'Подію не знайдено' })
    return reply.send({ event: updated })
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
      .where(eq(attempts.status, 'finished'))
      .orderBy(desc(attempts.finishedAt))
    return reply.send({ results: allAttempts })
  })

  // GET /api/admin/questions?grade=&isOlympiad=&difficulty=
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; difficulty?: string }
  }>('/questions', { preHandler: requireAdmin }, async (req, reply) => {
    const { grade, isOlympiad, difficulty } = req.query
    const filters = []
    if (grade)      filters.push(eq(questions.grade,      Number(grade)))
    if (isOlympiad) filters.push(eq(questions.isOlympiad, isOlympiad === 'true'))
    if (difficulty) filters.push(eq(questions.difficulty, difficulty))

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
      q: string; grade: number; difficulty: string; isOlympiad: boolean
      options: string[]; correct: number; explanation?: string; code?: string
    }
  }>('/questions', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['q', 'grade', 'difficulty', 'options', 'correct'],
        properties: {
          q:           { type: 'string' },
          grade:       { type: 'integer', minimum: 1, maximum: 4 },
          difficulty:  { type: 'string', enum: ['easy', 'medium', 'hard'] },
          isOlympiad:  { type: 'boolean' },
          options:     { type: 'array', items: { type: 'string' }, minItems: 2 },
          correct:     { type: 'integer', minimum: 0 },
          explanation: { type: 'string' },
          code:        { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { q, grade, difficulty, isOlympiad = false, options, correct, explanation, code } = req.body
    const [inserted] = await db
      .insert(questions)
      .values({ q, grade, difficulty, isOlympiad, options, correct, explanation: explanation ?? null, code: code ?? null, subject: 'informatics' })
      .returning({ id: questions.id })
    return reply.code(201).send({ id: inserted.id })
  })

  // PUT /api/admin/questions/:id
  app.put<{
    Params: { id: string }
    Body: {
      q?: string; grade?: number; difficulty?: string; isOlympiad?: boolean
      options?: string[]; correct?: number; explanation?: string; code?: string
    }
  }>('/questions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    const b = req.body
    if (b.q           !== undefined) updates.q           = b.q
    if (b.grade       !== undefined) updates.grade       = b.grade
    if (b.difficulty  !== undefined) updates.difficulty  = b.difficulty
    if (b.isOlympiad  !== undefined) updates.isOlympiad  = b.isOlympiad
    if (b.options     !== undefined) updates.options     = b.options
    if (b.correct     !== undefined) updates.correct     = b.correct
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
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params
      const [deleted] = await db
        .delete(questions)
        .where(eq(questions.id, id))
        .returning({ id: questions.id })
      if (!deleted) return reply.code(404).send({ error: 'Питання не знайдено' })
      return reply.code(204).send()
    }
  )
}
