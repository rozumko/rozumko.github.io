import type { FastifyInstance } from 'fastify'
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attempts, eventQuestions, olympiadEvents } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { assertEventCanIssueCodes } from './teacher-events-validation.js'

const CODE_WORDS = [
  'КІТ','ПЕС','ЛИС','РАК','ВУЖ','ЖУК','БИК','ЛЕВ','КИТ','ВІЛ',
  'ВОВК','ОРЕЛ','КОЗА','КІНЬ','ГУСЬ','КРОТ','ТИГР','РИСЬ','ЛОСЬ','ЗУБР',
]

function generateCode(): string {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `${word}${digits}`
}

export async function teacherRoutes(app: FastifyInstance) {
  // GET /api/me
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(req.user)
  })

  // GET /api/teacher/events
  // Повертає поточні активні події, для яких вчитель може генерувати коди.
  app.get('/events', { preHandler: requireAuth }, async (_req, reply) => {
    const now = new Date()
    const events = await db
      .select({
        id: olympiadEvents.id,
        title: olympiadEvents.title,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
        status: olympiadEvents.status,
      })
      .from(olympiadEvents)
      .where(and(
        eq(olympiadEvents.status, 'active'),
        lte(olympiadEvents.startsAt, now),
        gte(olympiadEvents.endsAt, now),
      ))
      .orderBy(desc(olympiadEvents.startsAt))

    return reply.send({ events })
  })

  // POST /api/teacher/codes/generate
  // Body: { eventId, grade, count, maxUses, expiresAt? }
  app.post<{
    Body: { eventId: string; grade: number; count: number; maxUses: number; expiresAt?: string }
  }>('/codes/generate', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['eventId', 'grade', 'count', 'maxUses'],
        properties: {
          eventId:   { type: 'string', format: 'uuid' },
          grade:     { type: 'integer', minimum: 1, maximum: 4 },
          count:     { type: 'integer', minimum: 1, maximum: 50 },
          maxUses:   { type: 'integer', minimum: 1, maximum: 100 },
          expiresAt: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { eventId, grade, count: codesCount, maxUses, expiresAt } = req.body

    const [event] = await db
      .select({
        id: olympiadEvents.id,
        status: olympiadEvents.status,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
      })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, eventId))
      .limit(1)

    if (!event) {
      return reply.code(404).send({ error: 'Олімпіаду не знайдено' })
    }

    try {
      assertEventCanIssueCodes(event)
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    const [[{ questionsCount }]] = await Promise.all([
      db
        .select({ questionsCount: count() })
        .from(eventQuestions)
        .where(and(eq(eventQuestions.eventId, eventId), eq(eventQuestions.grade, grade))),
    ])

    if (questionsCount === 0) {
      return reply.code(409).send({ error: 'Для цього класу ще не обрано питання в події' })
    }

    const codes = Array.from({ length: codesCount }, () => ({
      eventId,
      code:      generateCode(),
      grade,
      maxUses,
      createdBy: req.user!.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }))

    const inserted = await db
      .insert(accessCodes)
      .values(codes)
      .returning({ id: accessCodes.id, code: accessCodes.code })

    return reply.code(201).send({ codes: inserted })
  })

  // GET /api/teacher/codes
  // Повертає всі коди вчителя
  app.get('/codes', { preHandler: requireAuth }, async (req, reply) => {
    const list = await db
      .select({
        id: accessCodes.id,
        eventId: accessCodes.eventId,
        code: accessCodes.code,
        grade: accessCodes.grade,
        maxUses: accessCodes.maxUses,
        usedCount: accessCodes.usedCount,
        expiresAt: accessCodes.expiresAt,
        createdAt: accessCodes.createdAt,
        eventTitle: olympiadEvents.title,
      })
      .from(accessCodes)
      .leftJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.createdBy, req.user!.id))
      .orderBy(desc(accessCodes.createdAt))

    return reply.send({ codes: list })
  })

  // GET /api/teacher/results
  // Повертає всі спроби по кодах вчителя
  app.get('/results', { preHandler: requireAuth }, async (req, reply) => {
    const teacherCodes = await db
      .select({ id: accessCodes.id, code: accessCodes.code, grade: accessCodes.grade, eventTitle: olympiadEvents.title })
      .from(accessCodes)
      .leftJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.createdBy, req.user!.id))

    if (teacherCodes.length === 0) {
      return reply.send({ results: [] })
    }

    const codeIds = teacherCodes.map(c => c.id)
    const codeMap = Object.fromEntries(teacherCodes.map(c => [c.id, c]))

    const allAttempts = await db
      .select()
      .from(attempts)
      .where(inArray(attempts.codeId, codeIds))
      .orderBy(desc(attempts.startedAt))

    // Приєднуємо інфо про код
    const results = allAttempts.map(a => ({
      ...a,
      accessCode: codeMap[a.codeId] ?? null,
    }))

    return reply.send({ results })
  })
}
