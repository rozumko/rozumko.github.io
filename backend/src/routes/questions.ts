import type { FastifyInstance } from 'fastify'
import { eq, and, sql, arrayContains, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, type QuestionTrack } from '../db/schema.js'
import { sanitizeOlympiadQuestion, stripOptionKeys } from './question-sanitize.js'
import { ALL_TOPICS } from '../lib/taxonomy.js'
import type { QuestionChannel } from '../db/schema.js'
import { scoreAttempt, type AnswerValue } from './attempt-validation.js'
import { analyzeOlympiadSet, type OlympiadQuestionForPolicy } from '../lib/olympiad-content-policy.js'
import {
  createDemoToken,
  OLYMPIAD_DEMO_QUESTION_COUNT,
  OLYMPIAD_DEMO_TIME_MINUTES,
  OLYMPIAD_DEMO_TOKEN_TTL_MS,
  pickDemoQuestionSet,
  verifyDemoToken,
} from './olympiad-demo-validation.js'

type PublicQuestionChannel = Exclude<QuestionChannel, 'class_game'>

export async function questionsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { grade: number }
  }>('/demo/start', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['grade'],
        properties: {
          grade: { type: 'integer', minimum: 1, maximum: 4 },
        },
      },
    },
  }, async (req, reply) => {
    const rows = (await db
      .select({
        id: questions.id,
        q: questions.q,
        code: questions.code,
        type: questions.type,
        options: questions.options,
        correct: questions.correct,
        explanation: questions.explanation,
        img: questions.img,
        imageAlt: questions.imageAlt,
        difficulty: questions.difficulty,
        track: questions.track,
        topic: questions.topic,
        conceptKey: questions.conceptKey,
        progressionBand: questions.progressionBand,
        grade: questions.grade,
        meta: questions.meta,
        isOlympiad: questions.isOlympiad,
        channels: questions.channels,
        editorialStatus: questions.editorialStatus,
      })
      .from(questions)
      .where(and(
        eq(questions.grade, req.body.grade),
        eq(questions.isOlympiad, false),
        eq(questions.editorialStatus, 'published'),
        arrayContains(questions.channels, ['olympiad_training']),
      )))
      .sort((left, right) => left.id.localeCompare(right.id))

    let selectedIds: string[]
    try {
      selectedIds = pickDemoQuestionSet(
        req.body.grade,
        rows,
        Math.random,
        selected => analyzeOlympiadSet(
          req.body.grade,
          'demo',
          selected as OlympiadQuestionForPolicy[],
        ).ready,
      )
    } catch (error) {
      req.log.error({ err: error, grade: req.body.grade }, 'Unable to compose olympiad demo')
      return reply.code(422).send({ error: 'Для цього класу ще бракує збалансованого набору демо-завдань.' })
    }

    const byId = new Map(rows.map(question => [question.id, question]))
    const selected = selectedIds.map(id => byId.get(id)!)
    const readiness = analyzeOlympiadSet(
      req.body.grade,
      'demo',
      selected as OlympiadQuestionForPolicy[],
    )
    if (!readiness.ready) {
      req.log.error({ grade: req.body.grade, issues: readiness.issues }, 'Generated olympiad demo violates hard content policy')
      return reply.code(422).send({ error: 'Демо-набір не пройшов перевірку якості. Спробуйте пізніше.' })
    }

    const issuedAt = Date.now()
    return reply.send({
      demoToken: createDemoToken(req.body.grade, selectedIds, issuedAt),
      tokenExpiresAt: issuedAt + OLYMPIAD_DEMO_TOKEN_TTL_MS,
      tokenTtlMs: OLYMPIAD_DEMO_TOKEN_TTL_MS,
      questions: selected.map(({ isOlympiad: _isOlympiad, channels: _channels, editorialStatus: _status, ...question }) =>
        sanitizeOlympiadQuestion(question)),
      questionsCount: OLYMPIAD_DEMO_QUESTION_COUNT,
      timeMinutes: OLYMPIAD_DEMO_TIME_MINUTES,
    })
  })

  app.post<{
    Body: {
      demoToken: string
      answers: Array<{ questionId: string; answer: AnswerValue }>
    }
  }>('/demo/finish', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['demoToken', 'answers'],
        properties: {
          demoToken: { type: 'string', minLength: 40, maxLength: 4096 },
          answers: {
            type: 'array',
            maxItems: OLYMPIAD_DEMO_QUESTION_COUNT,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['questionId', 'answer'],
              properties: {
                questionId: { type: 'string', format: 'uuid' },
                answer: {
                  anyOf: [
                    { type: 'integer' },
                    { type: 'string', maxLength: 500 },
                    {
                      type: 'array',
                      maxItems: 50,
                      items: { type: 'integer' },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const payload = verifyDemoToken(req.body.demoToken)
    if (!payload) return reply.code(403).send({ error: 'Демо-сесію завершено або пошкоджено. Запусти демо ще раз.' })

    const issuedIds = new Set(payload.questionIds)
    const answerIds = req.body.answers.map(item => item.questionId)
    if (new Set(answerIds).size !== answerIds.length || answerIds.some(id => !issuedIds.has(id))) {
      return reply.code(400).send({ error: 'Відповіді не належать до цієї демо-сесії.' })
    }

    const rows = await db
      .select({
        id: questions.id,
        type: questions.type,
        correct: questions.correct,
        explanation: questions.explanation,
        options: questions.options,
      })
      .from(questions)
      .where(and(
        inArray(questions.id, payload.questionIds),
        eq(questions.grade, payload.grade),
        eq(questions.isOlympiad, false),
        inArray(questions.editorialStatus, ['published', 'archived']),
        arrayContains(questions.channels, ['olympiad_training']),
      ))

    if (rows.length !== OLYMPIAD_DEMO_QUESTION_COUNT) {
      return reply.code(409).send({ error: 'Склад демо змінився. Запусти демо ще раз.' })
    }

    const answers = Object.fromEntries(req.body.answers.map(item => [item.questionId, item.answer]))
    const byId = new Map(rows.map(question => [question.id, question]))
    const orderedQuestions = payload.questionIds.map(id => byId.get(id)!)
    const { score } = scoreAttempt(orderedQuestions, answers)

    return reply.send({ score, total: orderedQuestions.length })
  })

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
