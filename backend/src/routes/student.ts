import type { FastifyInstance } from 'fastify'
import { and, asc, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attemptQuestions, attempts, eventQuestions, olympiadEvents, questions } from '../db/schema.js'
import { assertEventCanIssueCodes } from './teacher-events-validation.js'
import {
  normalizeCode,
  validateCodeFormat,
  generateAttemptToken,
  verifyAttemptToken,
} from './student-validation.js'

export { generateAttemptToken, verifyAttemptToken }

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
    const normalized = normalizeCode(req.body.code)

    try { validateCodeFormat(normalized) } catch (e: any) {
      return reply.code(400).send({ error: e.message })
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

    // 3. Попередня перевірка ліміту (оптимізація — уникає зайвих запитів до БД)
    //    Фінальна атомарна перевірка відбувається всередині транзакції.
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

    // 5 + 6. Атомарно: збільшити лічильник + створити спробу + зафіксувати питання
    // Умовний UPDATE (used_count < max_uses) всередині транзакції — захист від race condition:
    // два одночасних запити не зможуть обидва пройти, навіть якщо обидва пройшли попередню перевірку.
    const [attempt] = await db.transaction(async tx => {
      const incremented = await tx
        .update(accessCodes)
        .set({ usedCount: sql`${accessCodes.usedCount} + 1` })
        .where(and(
          eq(accessCodes.id, accessCode.id),
          lt(accessCodes.usedCount, accessCodes.maxUses),
        ))
        .returning({ id: accessCodes.id })

      if (incremented.length === 0) {
        throw Object.assign(new Error('Код вже використано'), { statusCode: 409 })
      }

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
      attemptId:    attempt.id,
      attemptToken: generateAttemptToken(attempt.id),
      grade:        accessCode.grade,
      questions:    qs,
    })
  })
}
