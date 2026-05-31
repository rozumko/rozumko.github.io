import type { FastifyInstance } from 'fastify'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attemptQuestions, attempts, olympiadEvents, questions } from '../db/schema.js'
import { isQuestionInAttempt, scoreAttempt, type AnswerValue } from './attempt-validation.js'
import { verifyAttemptToken } from './student-validation.js'

function checkAttemptToken(req: { headers: Record<string, string | string[] | undefined> }, attemptId: string): boolean {
  const token = req.headers['x-attempt-token']
  if (!token || typeof token !== 'string') return false
  return verifyAttemptToken(attemptId, token)
}

function getRemainingSeconds(startedAt: Date | null, timeMinutes: number, endsAt: Date, now = new Date()): number {
  const attemptDeadline = (startedAt?.getTime() ?? now.getTime()) + timeMinutes * 60_000
  const deadline = Math.min(attemptDeadline, endsAt.getTime())
  return Math.max(0, Math.ceil((deadline - now.getTime()) / 1000))
}

export async function attemptRoutes(app: FastifyInstance) {
  // POST /api/attempt/:id/answer
  // Зберігає відповідь на одне питання (не перевіряє правильність)
  app.post<{
    Params: { id: string }
    Body: { questionId: string; answer: number | string | number[] }
  }>('/:id/answer', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['questionId', 'answer'],
        properties: {
          questionId: { type: 'string', format: 'uuid' },
          // choice/truefalse/sequence: integer-індекс; input: рядок;
          // sort/match: масив integer-індексів
          answer: {
            oneOf: [
              { type: 'integer', minimum: 0, maximum: 99 },
              { type: 'string', minLength: 1, maxLength: 200 },
              { type: 'array', items: { type: 'integer', minimum: 0, maximum: 99 }, minItems: 1, maxItems: 20 },
            ],
          },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    const { questionId, answer } = req.body

    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, id))
      .limit(1)

    if (!attempt) {
      return reply.code(404).send({ error: 'Спробу не знайдено' })
    }
    if (!checkAttemptToken(req, id)) {
      return reply.code(403).send({ error: 'Невірний токен спроби' })
    }
    if (attempt.status !== 'in_progress') {
      return reply.code(409).send({ error: 'Спроба вже завершена' })
    }

    // Вікно події та ліміт спроби: не приймаємо відповіді після дедлайну.
    const [evt] = await db
      .select({ endsAt: olympiadEvents.endsAt, timeMinutes: olympiadEvents.timeMinutes })
      .from(accessCodes)
      .innerJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.id, attempt.codeId))
      .limit(1)
    if (evt && getRemainingSeconds(attempt.startedAt, evt.timeMinutes, evt.endsAt) === 0) {
      await db.update(attempts).set({ status: 'expired', score: 0, finishedAt: new Date() }).where(eq(attempts.id, id))
      return reply.code(410).send({ error: 'Час спроби вичерпано' })
    }

    const issuedQuestions = await db
      .select({ questionId: attemptQuestions.questionId })
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, id))

    if (!isQuestionInAttempt(questionId, issuedQuestions.map(q => q.questionId))) {
      return reply.code(400).send({ error: 'Питання не належить цій спробі' })
    }

    // Атомарний JSONB merge — захист від race condition при одночасних відповідях.
    // sql`||` (jsonb concat) виконується атомарно в одному UPDATE, без read-modify-write.
    await db
      .update(attempts)
      .set({
        answers: sql`COALESCE(${attempts.answers}, '{}'::jsonb) || ${JSON.stringify({ [questionId]: answer })}::jsonb`,
      })
      .where(eq(attempts.id, id))

    return reply.code(200).send({ saved: true })
  })

  // POST /api/attempt/:id/finish
  // Підраховує результат, повертає score і правильні відповіді
  app.post<{ Params: { id: string } }>('/:id/finish', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params

    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, id))
      .limit(1)

    if (!attempt) {
      return reply.code(404).send({ error: 'Спробу не знайдено' })
    }
    if (!checkAttemptToken(req, id)) {
      return reply.code(403).send({ error: 'Невірний токен спроби' })
    }
    if (attempt.status === 'finished') {
      // Ідемпотентне завершення — повертаємо лише score/total без isCorrect по кожному питанню,
      // щоб не дозволити використовувати /finish як оракул правильних відповідей.
      return reply.code(200).send({ score: attempt.score ?? 0, total: attempt.totalQ ?? 0 })
    }
    if (attempt.status === 'expired') {
      return reply.code(410).send({ error: 'Час спроби вичерпано' })
    }

    const [evt] = await db
      .select({ endsAt: olympiadEvents.endsAt, timeMinutes: olympiadEvents.timeMinutes })
      .from(accessCodes)
      .innerJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.id, attempt.codeId))
      .limit(1)

    if (evt && getRemainingSeconds(attempt.startedAt, evt.timeMinutes, evt.endsAt) === 0) {
      await db.update(attempts).set({ status: 'expired', score: 0, finishedAt: new Date() }).where(eq(attempts.id, id))
      return reply.code(410).send({ error: 'Час спроби вичерпано' })
    }

    const studentAnswers = (attempt.answers as Record<string, AnswerValue>) ?? {}

    // Завантажити саме питання, видані цій спробі, з ключами відповідей
    const qs = await db
      .select({ id: questions.id, type: questions.type, correct: questions.correct, explanation: questions.explanation, options: questions.options })
      .from(attemptQuestions)
      .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
      .where(eq(attemptQuestions.attemptId, id))
      .orderBy(asc(attemptQuestions.position))

    const { score, results } = scoreAttempt(qs, studentAnswers)

    const total = attempt.totalQ ?? qs.length

    await db
      .update(attempts)
      .set({
        status:     'finished',
        score,
        finishedAt: new Date(),
      })
      .where(eq(attempts.id, id))

    // results (isCorrect по питанню) не повертаємо — щоб унеможливити binary-search оракул.
    // Фронтенду достатньо score/total для відображення результату.
    return reply.code(200).send({ score, total })
  })
}
