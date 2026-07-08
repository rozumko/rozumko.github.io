import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, schoolSessions, schoolSessionQuestions, schoolParticipants, schoolAnswers } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { sanitizeOlympiadQuestion } from './question-sanitize.js'
import { scoreAttempt, type AnswerValue } from './attempt-validation.js'
import { generateAttemptToken, verifyAttemptToken } from './student-validation.js'
import { isValidAvatar, normalizeNickname, validateJoinCodeFormat, generateJoinCode, normalizeDifficulty } from './school-validation.js'
import {
  SCHOOL_JOIN_CODE_THROTTLE_SCOPE,
  clearCodeThrottle,
  getCodeThrottleStatus,
  recordCodeFailure,
} from './code-throttle.js'
import { ALL_TOPICS, normalizeTopic } from '../lib/taxonomy.js'
import type { QuestionTrack } from '../db/schema.js'

const QUESTION_TRACKS = ['informatics', 'computational-thinking', 'ai-basics'] as const

// Просунутий School Mode (Kahoot-стиль). Ключі відповідей учням не віддаються,
// скоринг — на сервері. Учасник анонімний, ідентифікується HMAC-токеном.

const uuidParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

const answerBody = {
  type: 'object',
  required: ['questionId', 'answer'],
  additionalProperties: false,
  properties: {
    questionId: { type: 'string', format: 'uuid' },
    answer: {
      anyOf: [
        { type: 'integer', minimum: 0, maximum: 99 },
        { type: 'string', minLength: 1, maxLength: 200 },
        { type: 'array', items: { type: 'integer', minimum: 0, maximum: 99 }, minItems: 1, maxItems: 20 },
      ],
    },
  },
} as const

const avatarBody = {
  type: 'object',
  required: ['avatar'],
  additionalProperties: false,
  properties: {
    avatar: { type: 'string', maxLength: 16 },
  },
} as const

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
}

async function loadSessionQuestions(sessionId: string) {
  const qs = await db
    .select({ id: questions.id, q: questions.q, code: questions.code, type: questions.type, options: questions.options })
    .from(schoolSessionQuestions)
    .innerJoin(questions, eq(schoolSessionQuestions.questionId, questions.id))
    .where(eq(schoolSessionQuestions.sessionId, sessionId))
    .orderBy(asc(schoolSessionQuestions.position))

  return qs.map(sanitizeOlympiadQuestion)
}

// Guard учасника: HMAC-токен у X-Participant-Token має відповідати :id.
// Повертає false і сам відправляє 403, якщо токен невалідний.
function requireParticipant(
  req: { headers: Record<string, string | string[] | undefined>; params: { id: string } },
  reply: FastifyReply,
): boolean {
  const token = req.headers['x-participant-token']
  if (typeof token !== 'string' || !verifyAttemptToken(req.params.id, token)) {
    reply.code(403).send({ error: 'Невірний токен учасника' })
    return false
  }
  return true
}

async function loadParticipantWithSession(participantId: string) {
  const [row] = await db
    .select({
      id: schoolParticipants.id,
      sessionId: schoolParticipants.sessionId,
      status: schoolSessions.status,
      grade: schoolSessions.grade,
    })
    .from(schoolParticipants)
    .innerJoin(schoolSessions, eq(schoolParticipants.sessionId, schoolSessions.id))
    .where(eq(schoolParticipants.id, participantId))
    .limit(1)
  return row
}

export async function schoolRoutes(app: FastifyInstance) {
  // ── Вчитель: створити сесію ──────────────────────────────────────────────
  app.post<{ Body: { grade: number; difficulty?: string; questionsCount?: number; track?: string; topic?: string } }>('/sessions', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['grade'],
        additionalProperties: false,
        properties: {
          grade:          { type: 'integer', minimum: 1, maximum: 4 },
          difficulty:     { type: 'string', enum: ['easy', 'medium', 'hard'] },
          questionsCount: { type: 'integer', minimum: 1, maximum: 30 },
          track:          { type: 'string', enum: [...QUESTION_TRACKS] },
          topic:          { type: 'string', enum: ALL_TOPICS as string[] },
        },
      },
    },
  }, async (req, reply) => {
    let difficulty: 'easy' | 'medium' | 'hard' | null
    try { difficulty = normalizeDifficulty(req.body.difficulty) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }
    const track = (req.body.track ?? null) as QuestionTrack | null
    // topic валідний лише в парі зі своїм track (fail-closed, як в адмінці)
    let topic: string | null
    try { topic = normalizeTopic(req.body.topic, track) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }
    const wanted = req.body.questionsCount ?? 10

    const filters = [eq(questions.isOlympiad, false), eq(questions.grade, req.body.grade)]
    if (difficulty) filters.push(eq(questions.difficulty, difficulty))
    if (track)      filters.push(eq(questions.track, track))
    if (topic)      filters.push(eq(questions.topic, topic))

    const picked = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(...filters))
      .orderBy(sql`random()`)
      .limit(wanted)

    if (picked.length === 0) {
      return reply.code(422).send({ error: 'Немає тренувальних питань для цих параметрів' })
    }

    // Унікальний join-code: UNIQUE у БД + повтор при колізії.
    let session: typeof schoolSessions.$inferSelect | undefined
    for (let i = 0; i < 5; i++) {
      try {
        [session] = await db.insert(schoolSessions).values({
          teacherId:      req.user!.id,
          grade:          req.body.grade,
          difficulty,
          questionsCount: picked.length,
          joinCode:       generateJoinCode(),
        }).returning()
        break
      } catch (e) {
        if (isUniqueViolation(e)) continue
        throw e
      }
    }
    if (!session) return reply.code(500).send({ error: 'Не вдалося створити сесію' })

    await db.insert(schoolSessionQuestions).values(
      picked.map((q, position) => ({ sessionId: session!.id, questionId: q.id, position })),
    )

    return reply.code(201).send({
      session: {
        id: session.id, joinCode: session.joinCode, grade: session.grade,
        difficulty: session.difficulty, questionsCount: session.questionsCount, status: session.status,
      },
    })
  })

  // ── Вчитель: старт/фініш сесії (лише свою) ────────────────────────────────
  app.post<{ Params: { id: string } }>('/sessions/:id/start', { preHandler: requireAuth, schema: { params: uuidParam } }, async (req, reply) => {
    const [updated] = await db.update(schoolSessions)
      .set({ status: 'active', startedAt: new Date() })
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id), eq(schoolSessions.status, 'lobby')))
      .returning({ id: schoolSessions.id })
    if (!updated) return reply.code(409).send({ error: 'Сесію не знайдено або її вже запущено' })
    return reply.send({ status: 'active' })
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/finish', { preHandler: requireAuth, schema: { params: uuidParam } }, async (req, reply) => {
    const [updated] = await db.update(schoolSessions)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .returning({ id: schoolSessions.id })
    if (!updated) return reply.code(404).send({ error: 'Сесію не знайдено' })
    return reply.send({ status: 'finished' })
  })

  // ── Вчитель: стан + агрегат (лідерборд) своєї сесії ───────────────────────
  app.get<{ Params: { id: string } }>('/sessions/:id', { preHandler: requireAuth, schema: { params: uuidParam } }, async (req, reply) => {
    const [session] = await db.select().from(schoolSessions)
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .limit(1)
    if (!session) return reply.code(404).send({ error: 'Сесію не знайдено' })

    const participants = await db
      .select({ id: schoolParticipants.id, avatar: schoolParticipants.avatar, nickname: schoolParticipants.nickname, score: schoolParticipants.score })
      .from(schoolParticipants)
      .where(eq(schoolParticipants.sessionId, session.id))
      .orderBy(desc(schoolParticipants.score))

    // Агрегат правильності за темою (лише зведене — жодних ключів чи дитячих
    // даних понад лідерборд). Дає вчителю бачити, що варто повторити.
    const topicStats = await db
      .select({
        topic:   questions.topic,
        total:   sql<number>`cast(count(*) as int)`,
        correct: sql<number>`cast(sum(case when ${schoolAnswers.isCorrect} then 1 else 0 end) as int)`,
      })
      .from(schoolAnswers)
      .innerJoin(schoolParticipants, eq(schoolAnswers.participantId, schoolParticipants.id))
      .innerJoin(questions, eq(schoolAnswers.questionId, questions.id))
      .where(eq(schoolParticipants.sessionId, session.id))
      .groupBy(questions.topic)

    return reply.send({
      session: {
        id: session.id, joinCode: session.joinCode, grade: session.grade,
        difficulty: session.difficulty, questionsCount: session.questionsCount, status: session.status,
      },
      participants,
      topicStats,
    })
  })

  // ── Учень: приєднатися за кодом (анонімно) ────────────────────────────────
  app.post<{ Body: { code: string; avatar: string; nickname: string } }>('/join', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['code', 'avatar', 'nickname'],
        additionalProperties: false,
        properties: {
          code:     { type: 'string', minLength: 6, maxLength: 6 },
          avatar:   { type: 'string', maxLength: 16 },
          nickname: { type: 'string', minLength: 1, maxLength: 40 },
        },
      },
    },
  }, async (req, reply) => {
    try { validateJoinCodeFormat(req.body.code) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }
    const throttle = getCodeThrottleStatus(SCHOOL_JOIN_CODE_THROTTLE_SCOPE, req.body.code)
    if (!throttle.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(throttle.retryAfterSeconds))
        .send({ error: 'Забагато невдалих спроб. Спробуй трохи пізніше.' })
    }
    if (!isValidAvatar(req.body.avatar)) return reply.code(400).send({ error: 'Оберіть аватар зі списку' })
    let nickname: string
    try { nickname = normalizeNickname(req.body.nickname) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }

    const [session] = await db
      .select({ id: schoolSessions.id, status: schoolSessions.status, grade: schoolSessions.grade })
      .from(schoolSessions)
      .where(eq(schoolSessions.joinCode, req.body.code))
      .limit(1)
    if (!session) {
      recordCodeFailure(SCHOOL_JOIN_CODE_THROTTLE_SCOPE, req.body.code)
      return reply.code(404).send({ error: 'Сесію не знайдено' })
    }
    clearCodeThrottle(SCHOOL_JOIN_CODE_THROTTLE_SCOPE, req.body.code)
    if (session.status === 'finished') return reply.code(409).send({ error: 'Сесію вже завершено' })

    const [participant] = await db.insert(schoolParticipants)
      .values({ sessionId: session.id, avatar: req.body.avatar, nickname })
      .returning({ id: schoolParticipants.id })

    const questionsForPlayer = session.status === 'active'
      ? await loadSessionQuestions(session.id)
      : []

    return reply.code(201).send({
      participantId:    participant.id,
      participantToken: generateAttemptToken(participant.id),
      status:           session.status,
      grade:            session.grade,
      questions:        questionsForPlayer,
      questionsCount:   questionsForPlayer.length,
    })
  })

  app.get<{ Params: { id: string } }>('/participants/:id/session', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return

    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })

    const questionsForPlayer = participant.status === 'active'
      ? await loadSessionQuestions(participant.sessionId)
      : []

    return reply.send({
      status: participant.status,
      grade: participant.grade,
      questions: questionsForPlayer,
      questionsCount: questionsForPlayer.length,
    })
  })

  app.patch<{ Params: { id: string }; Body: { avatar: string } }>('/participants/:id/avatar', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { params: uuidParam, body: avatarBody },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return
    if (!isValidAvatar(req.body.avatar)) return reply.code(400).send({ error: 'Оберіть аватар зі списку' })

    // Атомарно: оновлюємо лише поки сесія в лобі — без вікна між перевіркою
    // статусу і записом (вчитель може стартувати гру між ними).
    const [updated] = await db.update(schoolParticipants)
      .set({ avatar: req.body.avatar })
      .where(and(
        eq(schoolParticipants.id, req.params.id),
        inArray(
          schoolParticipants.sessionId,
          db.select({ id: schoolSessions.id }).from(schoolSessions).where(eq(schoolSessions.status, 'lobby')),
        ),
      ))
      .returning({ id: schoolParticipants.id })

    if (!updated) {
      const participant = await loadParticipantWithSession(req.params.id)
      if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })
      return reply.code(409).send({ error: 'Гра вже стартувала. Герой зафіксований.' })
    }

    return reply.send({ avatar: req.body.avatar })
  })

  // ── Учень: відповісти на питання (серверний скоринг) ──────────────────────
  app.post<{ Params: { id: string }; Body: { questionId: string; answer: AnswerValue } }>('/participants/:id/answer', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { params: uuidParam, body: answerBody },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return

    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })
    if (participant.status !== 'active') {
      return reply.code(409).send({ error: 'Сесія неактивна' })
    }

    // Питання має належати саме цій сесії (immutable набір).
    const [issued] = await db
      .select({ questionId: schoolSessionQuestions.questionId })
      .from(schoolSessionQuestions)
      .where(and(eq(schoolSessionQuestions.sessionId, participant.sessionId), eq(schoolSessionQuestions.questionId, req.body.questionId)))
      .limit(1)
    if (!issued) return reply.code(400).send({ error: 'Питання не належить цій сесії' })

    const [question] = await db
      .select({ id: questions.id, type: questions.type, correct: questions.correct, explanation: questions.explanation, options: questions.options })
      .from(questions)
      .where(eq(questions.id, req.body.questionId))
      .limit(1)
    if (!question) return reply.code(404).send({ error: 'Питання не знайдено' })

    const { results } = scoreAttempt(
      [{ id: question.id, type: question.type ?? 'choice', correct: question.correct, explanation: question.explanation, options: question.options }],
      { [question.id]: req.body.answer },
    )
    const isCorrect = results[question.id]?.isCorrect ?? false

    // UNIQUE(participant, question) → одна відповідь на питання. Конфлікт = вже відповів.
    const [inserted] = await db.insert(schoolAnswers)
      .values({ participantId: participant.id, questionId: question.id, answer: req.body.answer, isCorrect })
      .onConflictDoNothing()
      .returning({ id: schoolAnswers.id })
    if (!inserted) return reply.code(409).send({ error: 'Ти вже відповів на це питання' })

    if (isCorrect) {
      await db.update(schoolParticipants)
        .set({ score: sql`${schoolParticipants.score} + 1` })
        .where(eq(schoolParticipants.id, participant.id))
    }

    return reply.send({ correct: isCorrect })
  })
}
