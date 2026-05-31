import type { FastifyInstance } from 'fastify'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions } from '../db/schema.js'
import { stripOptionKeys } from './question-sanitize.js'

export async function questionsRoutes(app: FastifyInstance) {
  // GET /api/questions?grade=4&isOlympiad=false&count=10&difficulty=hard
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; count?: string; difficulty?: string }
  }>('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          grade:      { type: 'string' },
          isOlympiad: { type: 'string' },
          count:      { type: 'string' },
          difficulty: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const grade      = req.query.grade      ? Number(req.query.grade)          : undefined
    let isOlympiad: boolean | undefined = undefined
    if (req.query.isOlympiad !== undefined) {
      if (req.query.isOlympiad !== 'true' && req.query.isOlympiad !== 'false') {
        return reply.code(400).send({ error: 'isOlympiad must be "true" or "false"' })
      }
      isOlympiad = req.query.isOlympiad === 'true'
    }
    const count      = req.query.count      ? Math.min(Number(req.query.count), 50) : 10
    const difficulty = req.query.difficulty

    const filters = []
    if (grade      !== undefined) filters.push(eq(questions.grade,      grade))
    if (isOlympiad !== undefined) filters.push(eq(questions.isOlympiad, isOlympiad))
    if (difficulty)               filters.push(eq(questions.difficulty,  difficulty))

    const rows = await db
      .select({
        id:          questions.id,
        q:           questions.q,
        code:        questions.code,
        type:        questions.type,
        options:     questions.options,
        correct:     questions.correct,
        explanation: questions.explanation,
        difficulty:  questions.difficulty,
        grade:       questions.grade,
      })
      .from(questions)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(sql`random()`)
      .limit(count)

    // correct і explanation повертаються ЛИШЕ для тренувальних питань (isOlympiad=false).
    // Це навмисна поведінка: practice-режим показує правильну відповідь після вибору.
    // Для олімпіадних питань (isOlympiad=true або фільтр не вказано) — ключі завжди стрипляються:
    //   • top-level correct/explanation (choice/truefalse/sequence)
    //   • ключі всередині options (sort.correctOrder, match.pairs, input.answer)
    const qs = isOlympiad === false
      ? rows
      : rows.map(({ correct: _c, explanation: _e, options, ...rest }) => ({
          ...rest,
          options: stripOptionKeys(options),
        }))

    return reply.send({ questions: qs })
  })
}
