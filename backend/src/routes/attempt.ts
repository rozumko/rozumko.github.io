import type { FastifyInstance } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { attemptQuestions, attempts, questions } from '../db/schema.js'
import { isQuestionInAttempt, scoreAttempt } from './attempt-validation.js'

export async function attemptRoutes(app: FastifyInstance) {
  // POST /api/attempt/:id/answer
  // Зберігає відповідь на одне питання (не перевіряє правильність)
  app.post<{
    Params: { id: string }
    Body: { questionId: string; answer: number }
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
          answer:     { type: 'integer', minimum: 0, maximum: 3 },
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
    if (attempt.status !== 'in_progress') {
      return reply.code(409).send({ error: 'Спроба вже завершена' })
    }

    const issuedQuestions = await db
      .select({ questionId: attemptQuestions.questionId })
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, id))

    if (!isQuestionInAttempt(questionId, issuedQuestions.map(q => q.questionId))) {
      return reply.code(400).send({ error: 'Питання не належить цій спробі' })
    }

    const currentAnswers = (attempt.answers as Record<string, number>) ?? {}
    const updatedAnswers = { ...currentAnswers, [questionId]: answer }

    await db
      .update(attempts)
      .set({ answers: updatedAnswers })
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
    if (attempt.status === 'finished') {
      return reply.code(409).send({ error: 'Спроба вже завершена' })
    }

    const studentAnswers = (attempt.answers as Record<string, number>) ?? {}

    // Завантажити саме питання, видані цій спробі, з ключами відповідей
    const qs = await db
      .select({ id: questions.id, correct: questions.correct, explanation: questions.explanation })
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

    return reply.code(200).send({
      score,
      total,
      results,
    })
  })
}
