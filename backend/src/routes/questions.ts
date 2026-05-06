import type { FastifyInstance } from 'fastify'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions } from '../db/schema.js'

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
    const isOlympiad = req.query.isOlympiad !== undefined
      ? req.query.isOlympiad === 'true'
      : undefined
    const count      = req.query.count      ? Math.min(Number(req.query.count), 50) : 10
    const difficulty = req.query.difficulty

    const filters = []
    if (grade      !== undefined) filters.push(eq(questions.grade,      grade))
    if (isOlympiad !== undefined) filters.push(eq(questions.isOlympiad, isOlympiad))
    if (difficulty)               filters.push(eq(questions.difficulty,  difficulty))

    const qs = await db
      .select({
        id:          questions.id,
        q:           questions.q,
        code:        questions.code,
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

    return reply.send({ questions: qs })
  })
}
