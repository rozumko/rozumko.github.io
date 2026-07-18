import type { FastifyInstance } from 'fastify'
import { eq, and, sql, arrayContains } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, type QuestionTrack } from '../db/schema.js'
import { stripOptionKeys } from './question-sanitize.js'
import { ALL_TOPICS } from '../lib/taxonomy.js'
import type { QuestionChannel } from '../db/schema.js'

type PublicQuestionChannel = Exclude<QuestionChannel, 'class_game'>

export async function questionsRoutes(app: FastifyInstance) {
  // GET /api/questions?grade=4&isOlympiad=false&count=10&difficulty=hard&track=ai-basics
  app.get<{
    Querystring: { grade?: string; isOlympiad?: string; channel?: PublicQuestionChannel; count?: string; difficulty?: string; track?: string; topic?: string; hideAnswers?: string }
  }>('/', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          grade:       { type: 'string', enum: ['1', '2', '3', '4'] },
          isOlympiad:  { type: 'string', enum: ['false'] },
          channel:     { type: 'string', enum: ['path', 'olympiad_training'] },
          count:       { type: 'string', pattern: '^(?:[1-9]|[1-4][0-9]|50)$' },
          difficulty:  { type: 'string', enum: ['easy', 'medium', 'hard'] },
          track:       { type: 'string', enum: ['informatics', 'computational-thinking', 'ai-basics'] },
          topic:       { type: 'string', enum: ALL_TOPICS as string[] },
          hideAnswers: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (req, reply) => {
    const grade      = req.query.grade      ? Number(req.query.grade)          : undefined
    const count      = req.query.count      ? Number(req.query.count)          : 10
    const difficulty = req.query.difficulty
    const track      = req.query.track as QuestionTrack | undefined
    const topic      = req.query.topic
    const channel    = req.query.channel ?? 'path'
    // Публічний endpoint видає лише тренувальні питання. Олімпіадні питання
    // студент отримує тільки після POST /api/student/exchange-code.
    const filters = [
      eq(questions.isOlympiad, false),
      eq(questions.editorialStatus, 'published'),
      arrayContains(questions.channels, [channel]),
    ]
    if (grade      !== undefined) filters.push(eq(questions.grade,      grade))
    if (difficulty)               filters.push(eq(questions.difficulty,  difficulty))
    if (track)                    filters.push(eq(questions.track,       track))
    if (topic)                    filters.push(eq(questions.topic,       topic))

    const rows = await db
      .select({
        id:          questions.id,
        q:           questions.q,
        code:        questions.code,
        type:        questions.type,
        options:     questions.options,
        correct:     questions.correct,
        explanation: questions.explanation,
        img:         questions.img,
        imageAlt:    questions.imageAlt,
        difficulty:  questions.difficulty,
        track:       questions.track,
        topic:       questions.topic,
        conceptKey:  questions.conceptKey,
        progressionBand: questions.progressionBand,
        grade:       questions.grade,
      })
      .from(questions)
      .where(and(...filters))
      .orderBy(sql`random()`)
      .limit(count)

    // Публічний API ніколи не віддає ключі: демо/Club/reporting scoring має
    // лишатися серверним, а локальний feedback живе тільки у static bundle.
    //   • top-level correct/explanation (choice/truefalse/sequence)
    //   • ключі всередині options (sort.correctOrder, match.pairs, input.answer)
    const qs = rows.map(({ correct: _c, explanation: _e, options, ...rest }) => ({
      ...rest,
      options: stripOptionKeys(options),
    }))

    return reply.send({ questions: qs })
  })
}
