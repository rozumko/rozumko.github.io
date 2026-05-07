import type { FastifyInstance } from 'fastify'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attemptQuestions, attempts, eventQuestions, olympiadEvents, questions } from '../db/schema.js'
import { assertEventCanIssueCodes } from './teacher-events-validation.js'

export async function studentRoutes(app: FastifyInstance) {
  // POST /api/student/exchange-code
  // Body: { code: string }
  // Returns: { attemptId, grade, questions: [...] }
  app.post<{ Body: { code: string } }>('/exchange-code', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 4, maxLength: 10 },
        },
      },
    },
  }, async (req, reply) => {
    const { code } = req.body
    const normalized = code.trim().toUpperCase()

    // Перевірити формат: СЛОВО(2-5 укр. літер)+3 цифри або навпаки
    const CODE_RE = /^([А-ЯҐЄІЇ]{2,5}\d{3}|\d{3}[А-ЯҐЄІЇ]{2,5})$/u
    if (!CODE_RE.test(normalized)) {
      return reply.code(400).send({ error: 'Невірний формат коду. Приклад: КІТ247' })
    }

    // 1. Знайти код
    const [accessCode] = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.code, normalized))
      .limit(1)

    if (!accessCode) {
      return reply.code(404).send({ error: 'Код не знайдено' })
    }

    // 2. Перевірити термін дії
    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Код застарів' })
    }

    // 3. Перевірити ліміт використань
    if (accessCode.usedCount >= accessCode.maxUses) {
      return reply.code(409).send({ error: 'Код вже використано' })
    }

    if (!accessCode.eventId) {
      return reply.code(409).send({ error: 'Код не привʼязаний до олімпіадної події' })
    }

    const [event] = await db
      .select({
        id: olympiadEvents.id,
        status: olympiadEvents.status,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
      })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, accessCode.eventId))
      .limit(1)

    if (!event) {
      return reply.code(404).send({ error: 'Олімпіаду не знайдено' })
    }

    try {
      assertEventCanIssueCodes(event)
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    // 4. Вибрати питання з набору події для цього класу
    const qs = await db
      .select({
        id: questions.id,
        q: questions.q,
        code: questions.code,
        options: questions.options,
      })
      .from(eventQuestions)
      .innerJoin(questions, eq(eventQuestions.questionId, questions.id))
      .where(and(eq(eventQuestions.eventId, accessCode.eventId), eq(eventQuestions.grade, accessCode.grade)))
      .orderBy(asc(eventQuestions.position))

    if (qs.length === 0) {
      return reply.code(422).send({ error: 'Для цього класу ще не обрано питання в події' })
    }

    // 5. Збільшити лічильник використань після успішної перевірки події та питань
    await db
      .update(accessCodes)
      .set({ usedCount: sql`${accessCodes.usedCount} + 1` })
      .where(eq(accessCodes.id, accessCode.id))

    // 6. Створити спробу і зафіксувати виданий набір питань
    const [attempt] = await db.transaction(async tx => {
      const [createdAttempt] = await tx
        .insert(attempts)
        .values({
          codeId:  accessCode.id,
          grade:   accessCode.grade,
          totalQ:  qs.length,
        })
        .returning({ id: attempts.id })

      await tx.insert(attemptQuestions).values(qs.map((question, position) => ({
        attemptId: createdAttempt.id,
        questionId: question.id,
        position,
      })))

      return [createdAttempt]
    })

    return reply.code(201).send({
      attemptId: attempt.id,
      grade:     accessCode.grade,
      questions: qs,
    })
  })
}
