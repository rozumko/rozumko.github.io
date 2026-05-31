import type { FastifyInstance } from 'fastify'
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attemptQuestions, attempts, eventQuestions, olympiadEvents, questions } from '../db/schema.js'
import { assertEventCanIssueCodes } from './teacher-events-validation.js'
import { sanitizeOlympiadQuestion } from './question-sanitize.js'
import {
  normalizeCode,
  validateCodeFormat,
  generateAttemptToken,
  verifyAttemptToken,
} from './student-validation.js'

export { generateAttemptToken, verifyAttemptToken }

function getRemainingSeconds(startedAt: Date | null, timeMinutes: number, endsAt: Date, now = new Date()): number {
  const attemptDeadline = (startedAt?.getTime() ?? now.getTime()) + timeMinutes * 60_000
  const deadline = Math.min(attemptDeadline, endsAt.getTime())
  return Math.max(0, Math.ceil((deadline - now.getTime()) / 1000))
}

export async function studentRoutes(app: FastifyInstance) {
  // GET /api/student/validate-code?code=XXX
  // Перевіряє код без споживання — для сторінки olympiad-enter.html
  app.get<{ Querystring: { code?: string } }>('/validate-code', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      querystring: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', minLength: 4, maxLength: 10 } },
      },
    },
  }, async (req, reply) => {
    const normalized = normalizeCode(req.query.code ?? '')
    try { validateCodeFormat(normalized) } catch (e: any) {
      return reply.code(400).send({ error: e.message })
    }

    const [accessCode] = await db
      .select({
        id:        accessCodes.id,
        eventId:   accessCodes.eventId,
        grade:     accessCodes.grade,
        usedCount: accessCodes.usedCount,
        maxUses:   accessCodes.maxUses,
        expiresAt: accessCodes.expiresAt,
      })
      .from(accessCodes)
      .where(eq(accessCodes.code, normalized))
      .limit(1)

    if (!accessCode) return reply.code(404).send({ error: 'Код не знайдено' })
    if (accessCode.expiresAt && accessCode.expiresAt < new Date())
      return reply.code(410).send({ error: 'Код застарів' })
    if (accessCode.usedCount >= accessCode.maxUses) {
      const [existing] = accessCode.maxUses === 1
        ? await db
            .select({ id: attempts.id })
            .from(attempts)
            .where(and(eq(attempts.codeId, accessCode.id), eq(attempts.status, 'in_progress')))
            .limit(1)
        : []
      if (!existing) return reply.code(409).send({ error: 'Код вже використано максимальну кількість разів' })
    }
    if (!accessCode.eventId)
      return reply.code(409).send({ error: 'Код не привʼязаний до олімпіадної події' })

    const [event] = await db
      .select({ id: olympiadEvents.id, title: olympiadEvents.title, status: olympiadEvents.status, startsAt: olympiadEvents.startsAt, endsAt: olympiadEvents.endsAt })
      .from(olympiadEvents)
      .where(eq(olympiadEvents.id, accessCode.eventId))
      .limit(1)

    if (!event) return reply.code(404).send({ error: 'Олімпіаду не знайдено' })

    try { assertEventCanIssueCodes(event) } catch (err) {
      return reply.code(409).send({ error: (err as Error).message })
    }

    return reply.send({ eventTitle: event.title, grade: accessCode.grade })
  })

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

    if (!accessCode.eventId) {
      return reply.code(409).send({ error: 'Код не привʼязаний до олімпіадної події' })
    }

    const [event] = await db
      .select({
        id: olympiadEvents.id,
        status: olympiadEvents.status,
        startsAt: olympiadEvents.startsAt,
        endsAt: olympiadEvents.endsAt,
        timeMinutes: olympiadEvents.timeMinutes,
        questionsCount: olympiadEvents.questionsCount,
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

    // 4. Відновлення спроби (crash / закрита вкладка / F5):
    // Якщо для цього коду вже є незавершена спроба — НЕ споживаємо код повторно,
    // а повертаємо ту саму спробу з новим токеном і її зафіксованими питаннями.
    // Це безпечно: токен усе одно генерує сервер, а доступ вимагає фізичний код.
    const [existing] = await db
      .select({ id: attempts.id, grade: attempts.grade, startedAt: attempts.startedAt, answers: attempts.answers })
      .from(attempts)
      .where(and(eq(attempts.codeId, accessCode.id), eq(attempts.status, 'in_progress')))
      .orderBy(desc(attempts.startedAt))
      .limit(1)

    // ВАЖЛИВО: відновлення лише для персональних кодів (maxUses === 1 — один код на дитину).
    // Для спільних кодів (maxUses > 1) кілька дітей ділять один код, але attempt привʼязаний
    // до коду, а не до дитини — тож відновлення віддало б другій дитині спробу першої (hijack).
    // У такому разі йдемо звичайним шляхом і створюємо нову спробу.
    if (existing && accessCode.maxUses === 1) {
      const remainingSeconds = getRemainingSeconds(existing.startedAt, event.timeMinutes, event.endsAt)
      if (remainingSeconds === 0) {
        await db
          .update(attempts)
          .set({ status: 'expired', score: 0, finishedAt: new Date() })
          .where(eq(attempts.id, existing.id))
        return reply.code(410).send({ error: 'Час спроби вичерпано' })
      }

      // Повертаємо саме ті питання, що були видані цій спробі (immutable attempt_questions),
      // а не поточний набір події — він міг змінитись після старту.
      const resumeQs = await db
        .select({
          id:      questions.id,
          q:       questions.q,
          code:    questions.code,
          type:    questions.type,
          options: questions.options,
        })
        .from(attemptQuestions)
        .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
        .where(eq(attemptQuestions.attemptId, existing.id))
        .orderBy(asc(attemptQuestions.position))

      return reply.code(200).send({
        attemptId:    existing.id,
        attemptToken: generateAttemptToken(existing.id),
        grade:        existing.grade,
        questions:    resumeQs.map(sanitizeOlympiadQuestion),
        resumed:      true,
        answeredQuestionIds: Object.keys((existing.answers as Record<string, unknown>) ?? {}),
        remainingSeconds,
        timeMinutes: event.timeMinutes,
        questionsCount: resumeQs.length,
      })
    }

    // 5. Попередня перевірка ліміту; фінальна атомарна перевірка є в транзакції.
    if (accessCode.usedCount >= accessCode.maxUses) {
      return reply.code(409).send({ error: 'Код вже використано' })
    }

    // 6. Вибрати питання з набору події для цього класу
    const qs = await db
      .select({
        id:      questions.id,
        q:       questions.q,
        code:    questions.code,
        type:    questions.type,
        options: questions.options,
      })
      .from(eventQuestions)
      .innerJoin(questions, eq(eventQuestions.questionId, questions.id))
      .where(and(eq(eventQuestions.eventId, accessCode.eventId), eq(eventQuestions.grade, accessCode.grade)))
      .orderBy(asc(eventQuestions.position))
      .limit(event.questionsCount)

    if (qs.length === 0) {
      return reply.code(422).send({ error: 'Для цього класу ще не обрано питання в події' })
    }

    // 7. Атомарно: збільшити лічильник + створити спробу + зафіксувати питання
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
        .returning({ id: attempts.id, startedAt: attempts.startedAt })

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
      questions:    qs.map(sanitizeOlympiadQuestion),
      remainingSeconds: getRemainingSeconds(attempt.startedAt, event.timeMinutes, event.endsAt),
      timeMinutes: event.timeMinutes,
      questionsCount: qs.length,
    })
  })
}
