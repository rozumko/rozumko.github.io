import type { FastifyInstance } from 'fastify'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accessCodes, attemptQuestions, attempts, olympiadEvents } from '../db/schema.js'
import { finalizeAttemptFromSavedAnswers } from './attempt-finalization.js'
import { isQuestionInAttempt } from './attempt-validation.js'
import { verifyAttemptToken } from './student-validation.js'
import { getRemainingSeconds, creditPauseSeconds } from './attempt-timing.js'
import { createVerifiedResourceRateLimit, RATE_LIMIT_MAX } from '../lib/rate-limit-policy.js'

function checkAttemptToken(req: { headers: Record<string, string | string[] | undefined> }, attemptId: string): boolean {
  const token = req.headers['x-attempt-token']
  if (!token || typeof token !== 'string') return false
  return verifyAttemptToken(attemptId, token)
}

const attemptAnswerRateLimit = createVerifiedResourceRateLimit({
  scope: 'attempt-answer',
  headerName: 'x-attempt-token',
  max: RATE_LIMIT_MAX.attemptAnswer,
  verifyToken: verifyAttemptToken,
})

const attemptFinishRateLimit = createVerifiedResourceRateLimit({
  scope: 'attempt-finish',
  headerName: 'x-attempt-token',
  max: RATE_LIMIT_MAX.attemptFinish,
  verifyToken: verifyAttemptToken,
})

const attemptHeartbeatRateLimit = createVerifiedResourceRateLimit({
  scope: 'attempt-heartbeat',
  headerName: 'x-attempt-token',
  max: RATE_LIMIT_MAX.attemptHeartbeat,
  verifyToken: verifyAttemptToken,
})

export async function attemptRoutes(app: FastifyInstance) {
  // POST /api/attempt/:id/answer
  // Зберігає відповідь на одне питання (не перевіряє правильність)
  app.post<{
    Params: { id: string }
    Body: { questionId: string; answer: number | string | number[] }
  }>('/:id/answer', {
    config: { rateLimit: attemptAnswerRateLimit },
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
            anyOf: [
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

    if (!checkAttemptToken(req, id)) {
      return reply.code(403).send({ error: 'Невірний токен спроби' })
    }

    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, id))
      .limit(1)

    if (!attempt) {
      return reply.code(404).send({ error: 'Спробу не знайдено' })
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
    if (evt && getRemainingSeconds(attempt.startedAt, evt.timeMinutes, evt.endsAt, new Date(), attempt.pausedSeconds) === 0) {
      await finalizeAttemptFromSavedAnswers(id)
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
    const updated = await db
      .update(attempts)
      .set({
        answers: sql`COALESCE(${attempts.answers}, '{}'::jsonb) || ${JSON.stringify({ [questionId]: answer })}::jsonb`,
      })
      .where(and(eq(attempts.id, id), eq(attempts.status, 'in_progress')))
      .returning({ id: attempts.id })

    if (updated.length === 0) {
      return reply.code(409).send({ error: 'Спроба вже завершена' })
    }

    return reply.code(200).send({ saved: true })
  })

  // POST /api/attempt/:id/finish
  // Підраховує результат, повертає score і правильні відповіді
  app.post<{ Params: { id: string } }>('/:id/finish', {
    config: { rateLimit: attemptFinishRateLimit },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params

    if (!checkAttemptToken(req, id)) {
      return reply.code(403).send({ error: 'Невірний токен спроби' })
    }

    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, id))
      .limit(1)

    if (!attempt) {
      return reply.code(404).send({ error: 'Спробу не знайдено' })
    }
    if (attempt.status === 'finished') {
      // Ідемпотентне завершення — повертаємо лише score/total без isCorrect по кожному питанню,
      // щоб не дозволити використовувати /finish як оракул правильних відповідей.
      return reply.code(200).send({ score: attempt.score ?? 0, total: attempt.totalQ ?? 0 })
    }
    if (attempt.status === 'expired') {
      return reply.code(200).send(await finalizeAttemptFromSavedAnswers(id))
    }

    const [evt] = await db
      .select({ endsAt: olympiadEvents.endsAt, timeMinutes: olympiadEvents.timeMinutes })
      .from(accessCodes)
      .innerJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.id, attempt.codeId))
      .limit(1)

    if (evt && getRemainingSeconds(attempt.startedAt, evt.timeMinutes, evt.endsAt, new Date(), attempt.pausedSeconds) === 0) {
      return reply.code(200).send(await finalizeAttemptFromSavedAnswers(id))
    }

    // results (isCorrect по питанню) не повертаємо — щоб унеможливити binary-search оракул.
    // Фронтенду достатньо score/total для відображення результату.
    return reply.code(200).send(await finalizeAttemptFromSavedAnswers(id))
  })

  // POST /api/attempt/:id/heartbeat
  // Пульс від клієнта (~кожні 15с). Сервер міряє розрив між пульсами й кредитує
  // "прощену" паузу для блекаутів (обмежену grace-лімітом), тоді повертає лишок
  // часу. Розрив міряє сервер, не клієнт — час не можна домалювати звітом.
  app.post<{ Params: { id: string } }>('/:id/heartbeat', {
    config: { rateLimit: attemptHeartbeatRateLimit },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params

    if (!checkAttemptToken(req, id)) {
      return reply.code(403).send({ error: 'Невірний токен спроби' })
    }

    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, id))
      .limit(1)

    if (!attempt) {
      return reply.code(404).send({ error: 'Спробу не знайдено' })
    }
    if (attempt.status !== 'in_progress') {
      return reply.code(409).send({ error: 'Спроба вже завершена' })
    }

    const now = new Date()
    // Кредитуємо паузу на основі розриву від попереднього пульсу (перший пульс:
    // last_seen_at = null → 0), потім фіксуємо новий last_seen_at.
    const pausedSeconds = creditPauseSeconds(attempt.pausedSeconds, attempt.lastSeenAt, now)

    const updated = await db
      .update(attempts)
      .set({ pausedSeconds, lastSeenAt: now })
      .where(and(eq(attempts.id, id), eq(attempts.status, 'in_progress')))
      .returning({ id: attempts.id })

    if (updated.length === 0) {
      return reply.code(409).send({ error: 'Спроба вже завершена' })
    }

    const [evt] = await db
      .select({ endsAt: olympiadEvents.endsAt, timeMinutes: olympiadEvents.timeMinutes })
      .from(accessCodes)
      .innerJoin(olympiadEvents, eq(accessCodes.eventId, olympiadEvents.id))
      .where(eq(accessCodes.id, attempt.codeId))
      .limit(1)

    const remainingSeconds = evt
      ? getRemainingSeconds(attempt.startedAt, evt.timeMinutes, evt.endsAt, now, pausedSeconds)
      : null

    if (remainingSeconds === 0) {
      await finalizeAttemptFromSavedAnswers(id)
      return reply.code(410).send({ error: 'Час спроби вичерпано' })
    }

    return reply.code(200).send({ pausedSeconds, remainingSeconds })
  })
}
