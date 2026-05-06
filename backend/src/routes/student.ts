import type { FastifyInstance } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attempts, questions } from '../db/schema.js'

export async function studentRoutes(app: FastifyInstance) {
  // POST /api/student/exchange-code
  // Body: { code: string }
  // Returns: { attemptId, grade, questions: [...] }
  app.post<{ Body: { code: string } }>('/exchange-code', {
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

    // 4. Збільшити лічильник використань
    await db
      .update(accessCodes)
      .set({ usedCount: sql`${accessCodes.usedCount} + 1` })
      .where(eq(accessCodes.id, accessCode.id))

    // 5. Вибрати питання для цього класу (перемішані, макс 10)
    const qs = await db
      .select({
        id: questions.id,
        q: questions.q,
        code: questions.code,
        options: questions.options,
      })
      .from(questions)
      .where(eq(questions.grade, accessCode.grade))
      .orderBy(sql`random()`)
      .limit(10)

    if (qs.length === 0) {
      return reply.code(422).send({ error: 'Немає питань для цього класу' })
    }

    // 6. Створити спробу
    const [attempt] = await db
      .insert(attempts)
      .values({
        codeId:  accessCode.id,
        grade:   accessCode.grade,
        totalQ:  qs.length,
      })
      .returning({ id: attempts.id })

    return reply.code(201).send({
      attemptId: attempt.id,
      grade:     accessCode.grade,
      questions: qs,
    })
  })
}
