import type { FastifyInstance } from 'fastify'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions } from '../db/schema.js'
import { stripOptionKeys } from './question-sanitize.js'

export async function questionsRoutes(app: FastifyInstance) {
  // GET /api/questions?grade=4&isOlympiad=false&count=10&difficulty=hard
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; count?: string; difficulty?: string; hideAnswers?: string }
  }>('/', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          grade:       { type: 'string', enum: ['1', '2', '3', '4'] },
          isOlympiad:  { type: 'string', enum: ['false'] },
          count:       { type: 'string', pattern: '^(?:[1-9]|[1-4][0-9]|50)$' },
          difficulty:  { type: 'string', enum: ['easy', 'medium', 'hard'] },
          hideAnswers: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (req, reply) => {
    const grade      = req.query.grade      ? Number(req.query.grade)          : undefined
    const count      = req.query.count      ? Number(req.query.count)          : 10
    const difficulty = req.query.difficulty
    const hideAnswers = req.query.hideAnswers === 'true'

    // Публічний endpoint видає лише тренувальні питання. Олімпіадні питання
    // студент отримує тільки після POST /api/student/exchange-code.
    const filters = [eq(questions.isOlympiad, false)]
    if (grade      !== undefined) filters.push(eq(questions.grade,      grade))
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
      .where(and(...filters))
      .orderBy(sql`random()`)
      .limit(count)

    // Для demo-режиму тренувальні питання віддаються без ключів:
    //   • top-level correct/explanation (choice/truefalse/sequence)
    //   • ключі всередині options (sort.correctOrder, match.pairs, input.answer)
    const qs = hideAnswers
      ? rows.map(({ correct: _c, explanation: _e, options, ...rest }) => ({
          ...rest,
          options: stripOptionKeys(options),
        }))
      : rows

    return reply.send({ questions: qs })
  })
}
