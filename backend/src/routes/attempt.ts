import type { FastifyInstance } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { attempts, questions } from '../db/schema.js'

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
    const questionIds = Object.keys(studentAnswers)

    // Завантажити питання з ключами відповідей
    const qs = questionIds.length > 0
      ? await db
          .select({ id: questions.id, correct: questions.correct, explanation: questions.explanation })
          .from(questions)
          .where(inArray(questions.id, questionIds))
      : []

    // Підрахувати score
    let score = 0
    const results: Record<string, { correct: number; explanation: string | null; isCorrect: boolean }> = {}

    for (const q of qs) {
      const given = studentAnswers[q.id]
      const isCorrect = given === q.correct
      if (isCorrect) score++
      results[q.id] = {
        correct:     q.correct,
        explanation: q.explanation,
        isCorrect,
      }
    }

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
