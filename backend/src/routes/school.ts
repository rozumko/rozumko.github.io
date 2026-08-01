import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify'
import { and, asc, desc, eq, inArray, notInArray, sql, arrayContains } from 'drizzle-orm'
import { db } from '../db/index.js'
import { questions, schoolSessions, schoolSessionQuestions, schoolParticipants, schoolAnswers, schoolActivityResults } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { sanitizeOlympiadQuestion, stripOptionKeys } from './question-sanitize.js'
import { scoreAttempt, type AnswerValue } from './attempt-validation.js'
import { generateAttemptToken, verifyAttemptToken } from './student-validation.js'
import { isValidAvatar, normalizeNickname, validateJoinCodeFormat, generateJoinCode, normalizeDifficulty } from './school-validation.js'
import {
  SCHOOL_JOIN_CODE_THROTTLE_SCOPE,
  SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE,
  clearCodeThrottle,
  getCodeThrottleStatus,
  recordCodeFailure,
} from './code-throttle.js'
import { ALL_TOPICS, normalizeTopic } from '../lib/taxonomy.js'
import { SCHOOL_TOPIC_IDS, resolveSchoolTopicSelection } from '../lib/school-topics.js'
import {
  SCHOOL_ACTIVITY_KEYS,
  SCHOOL_ACTIVITY_LEVEL_IDS,
  normalizeActivityResult,
  normalizeSessionKind,
  resolveActivityDefinition,
  resolveActivityLevel,
  type SchoolSessionKind,
} from '../lib/school-activities.js'
import { createVerifiedResourceRateLimit, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../lib/rate-limit-policy.js'
import { publicSchoolFactOpinionPack, scoreSchoolFactOpinion, type SchoolFactOpinionChoice } from '../lib/school-fact-opinion.js'
import type { QuestionTrack } from '../db/schema.js'

const QUESTION_TRACKS = ['informatics', 'computational-thinking', 'ai-basics'] as const

// A session the teacher never explicitly finished must not stay joinable
// forever (kids could rejoin with a stale code hours later). After the TTL
// the join code auto-expires: the session is closed and join returns 409.
const SESSION_JOIN_TTL_MS = 2 * 60 * 60 * 1000

function isSessionExpired(createdAt: Date | null): boolean {
  return createdAt != null && Date.now() - createdAt.getTime() > SESSION_JOIN_TTL_MS
}

export interface SchoolRoutesOptions {
  authorizeTeacher?: preHandlerHookHandler
}

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

// Human-readable form of a stored participant answer for the teacher view.
// Display-only: resolves via the question's public options, never the key.
function describeAnswer(type: string | null, options: unknown, answer: unknown): string {
  const t = type ?? 'choice'
  if (t === 'choice' && typeof answer === 'number' && Array.isArray(options)) {
    return String(options[answer] ?? `Варіант ${answer + 1}`)
  }
  if (t === 'truefalse' && typeof answer === 'number') {
    return answer === 0 ? 'Так' : 'Ні'
  }
  const struct = options && typeof options === 'object' && !Array.isArray(options)
    ? options as Record<string, unknown>
    : {}
  if (t === 'multi_select' && Array.isArray(answer) && Array.isArray(struct.choices)) {
    const choices = struct.choices as unknown[]
    return answer.map(index => String(choices[Number(index)] ?? '?')).join('; ')
  }
  if (t === 'sequence' && typeof answer === 'number' && Array.isArray(struct.choices)) {
    return String((struct.choices as unknown[])[answer] ?? `Варіант ${answer + 1}`)
  }
  if ((t === 'sort' || t === 'algorithm') && Array.isArray(answer) && Array.isArray(struct.items)) {
    const items = struct.items as unknown[]
    return answer.map(i => String(items[Number(i)] ?? '?')).join(' → ')
  }
  if (t === 'match' && Array.isArray(answer) && Array.isArray(struct.left) && Array.isArray(struct.right)) {
    const left = struct.left as unknown[]
    const right = struct.right as unknown[]
    return answer.map((r, i) => `${String(left[i] ?? '?')} → ${String(right[Number(r)] ?? '?')}`).join('; ')
  }
  if (typeof answer === 'string') return answer
  return JSON.stringify(answer ?? '')
}

// Ready-to-read form of the answer key for the teacher preview. Mirrors where
// each type keeps its key (see scoreAttempt): choice/truefalse/sequence in the
// `correct` column, sort in options.correctOrder, match in options.pairs,
// input in options.answer. Returns TEXT, never the raw key structures.
function describeCorrectAnswer(type: string | null, options: unknown, correct: number | null): string | null {
  const t = type ?? 'choice'
  const struct = options && typeof options === 'object' && !Array.isArray(options)
    ? options as Record<string, unknown>
    : {}
  if (t === 'sort' || t === 'algorithm') {
    return Array.isArray(struct.correctOrder) ? describeAnswer(t, options, struct.correctOrder) : null
  }
  if (t === 'match') {
    return Array.isArray(struct.pairs) ? describeAnswer(t, options, struct.pairs) : null
  }
  if (t === 'input') {
    return struct.answer == null ? null : String(struct.answer)
  }
  if (t === 'multi_select') {
    return Array.isArray(struct.correctAnswers)
      ? describeAnswer(t, options, struct.correctAnswers)
      : null
  }
  return correct == null ? null : describeAnswer(t, options, correct)
}

async function loadSessionQuestions(sessionId: string) {
  const qs = await db
    .select({
      id: questions.id,
      q: questions.q,
      code: questions.code,
      type: questions.type,
      options: questions.options,
      img: questions.img,
      imageAlt: questions.imageAlt,
    })
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

const participantSessionRateLimit = createVerifiedResourceRateLimit({
  scope: 'school-participant-session',
  headerName: 'x-participant-token',
  max: RATE_LIMIT_MAX.schoolParticipantSession,
  verifyToken: verifyAttemptToken,
})

const participantAvatarRateLimit = createVerifiedResourceRateLimit({
  scope: 'school-participant-avatar',
  headerName: 'x-participant-token',
  max: RATE_LIMIT_MAX.schoolParticipantAvatar,
  verifyToken: verifyAttemptToken,
})

const participantAnswerRateLimit = createVerifiedResourceRateLimit({
  scope: 'school-participant-answer',
  headerName: 'x-participant-token',
  max: RATE_LIMIT_MAX.schoolParticipantAnswer,
  verifyToken: verifyAttemptToken,
})

const participantActivityResultRateLimit = createVerifiedResourceRateLimit({
  scope: 'school-participant-activity-result',
  headerName: 'x-participant-token',
  max: RATE_LIMIT_MAX.schoolParticipantActivityResult,
  verifyToken: verifyAttemptToken,
})

const activityResultBody = {
  type: 'object',
  required: ['correct', 'total', 'mistakes', 'durationSec'],
  additionalProperties: false,
  properties: {
    correct:     { type: 'integer', minimum: 0, maximum: 10_000 },
    total:       { type: 'integer', minimum: 1, maximum: 10_000 },
    mistakes:    { type: 'integer', minimum: 0, maximum: 10_000 },
    durationSec: { type: 'integer', minimum: 0, maximum: 86_400 },
  },
} as const

const factOpinionAnswerBody = {
  type: 'object',
  required: ['statementId', 'choice'],
  additionalProperties: false,
  properties: {
    statementId: { type: 'string', pattern: '^g[1-4]-[0-9]{2}$' },
    choice: { type: 'string', enum: ['fact', 'opinion'] },
  },
} as const

async function loadParticipantWithSession(participantId: string) {
  const [row] = await db
    .select({
      id: schoolParticipants.id,
      sessionId: schoolParticipants.sessionId,
      status: schoolSessions.status,
      grade: schoolSessions.grade,
      kind: schoolSessions.kind,
      activityKey: schoolSessions.activityKey,
      activityLevel: schoolSessions.activityLevel,
    })
    .from(schoolParticipants)
    .innerJoin(schoolSessions, eq(schoolParticipants.sessionId, schoolSessions.id))
    .where(eq(schoolParticipants.id, participantId))
    .limit(1)
  return row
}

export interface SessionCreateBody {
  grade: number
  difficulty?: string
  questionsCount?: number
  track?: string
  topic?: string
  schoolTopicId?: string
  kind?: string
  activityKey?: string
  activityLevel?: string
}

type SessionRow = typeof schoolSessions.$inferSelect

// Shape the teacher and the student both read. `activityKey`/`activityLevel`
// stay null for question sessions so the client can branch on `kind` alone.
function serializeSession(session: SessionRow) {
  return {
    id:             session.id,
    joinCode:       session.joinCode,
    grade:          session.grade,
    difficulty:     session.difficulty,
    questionsCount: session.questionsCount,
    status:         session.status,
    kind:           session.kind,
    activityKey:    session.activityKey,
    activityLevel:  session.activityLevel,
  }
}

// Unique join code: UNIQUE in the DB + retry on collision. Shared by both
// session kinds so the code space and the retry budget stay identical.
async function insertSessionWithJoinCode(
  values: Omit<typeof schoolSessions.$inferInsert, 'joinCode'>,
): Promise<SessionRow | undefined> {
  for (let i = 0; i < 5; i++) {
    try {
      const [session] = await db.insert(schoolSessions)
        .values({ ...values, joinCode: generateJoinCode() })
        .returning()
      return session
    } catch (e) {
      if (isUniqueViolation(e)) continue
      throw e
    }
  }
  return undefined
}

export async function schoolRoutes(app: FastifyInstance, opts: SchoolRoutesOptions = {}) {
  const authorizeTeacher = opts.authorizeTeacher ?? requireAuth

  async function createActivitySession(
    req: { body: SessionCreateBody; user?: { id: string } },
    reply: FastifyReply,
  ) {
    let activity, level
    try {
      activity = resolveActivityDefinition(req.body.activityKey)
      level    = resolveActivityLevel(activity, req.body.activityLevel)
    } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }

    const session = await insertSessionWithJoinCode({
      teacherId:      req.user!.id,
      grade:          req.body.grade,
      difficulty:     null,
      questionsCount: 0,
      kind:           'activity',
      activityKey:    activity.key,
      activityLevel:  level.id,
    })
    if (!session) return reply.code(500).send({ error: 'Не вдалося створити сесію' })

    return reply.code(201).send({ session: serializeSession(session) })
  }

  // ── Вчитель: створити сесію ──────────────────────────────────────────────
  app.post<{ Body: SessionCreateBody }>('/sessions', {
    preHandler: authorizeTeacher,
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
          schoolTopicId:  { type: 'string', enum: SCHOOL_TOPIC_IDS as unknown as string[] },
          kind:           { type: 'string', enum: ['questions', 'activity'] },
          activityKey:    { type: 'string', enum: SCHOOL_ACTIVITY_KEYS as unknown as string[] },
          activityLevel:  { type: 'string', enum: SCHOOL_ACTIVITY_LEVEL_IDS as string[] },
        },
      },
    },
  }, async (req, reply) => {
    let kind: SchoolSessionKind
    try { kind = normalizeSessionKind(req.body.kind) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }

    // An activity session carries no question set: the game is procedural, so
    // there is nothing to pick and nothing to grade on the server.
    if (kind === 'activity') return createActivitySession(req, reply)

    let difficulty: 'easy' | 'medium' | 'hard' | null
    try { difficulty = normalizeDifficulty(req.body.difficulty) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }
    let schoolTopic
    try { schoolTopic = resolveSchoolTopicSelection(req.body.schoolTopicId) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }
    const track = schoolTopic?.track ?? (req.body.track ?? null) as QuestionTrack | null
    // topic валідний лише в парі зі своїм track (fail-closed, як в адмінці)
    let topic: string | null
    try { topic = schoolTopic?.topic ?? normalizeTopic(req.body.topic, track) } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }
    const wanted = req.body.questionsCount ?? 10

    const filters = [
      eq(questions.isOlympiad, false),
      eq(questions.editorialStatus, 'published'),
      arrayContains(questions.channels, ['class_game']),
      eq(questions.grade, req.body.grade),
    ]
    if (difficulty) filters.push(eq(questions.difficulty, difficulty))
    if (track)      filters.push(eq(questions.track, track))
    if (topic)      filters.push(eq(questions.topic, topic))

    let picked = schoolTopic?.preferredConceptKeys?.length
      ? await db
        .select({ id: questions.id })
        .from(questions)
        .where(and(...filters, inArray(questions.conceptKey, [...schoolTopic.preferredConceptKeys])))
        .orderBy(sql`random()`)
        .limit(wanted)
      : []

    const fallbackFilters = [...filters]
    if (picked.length > 0) fallbackFilters.push(notInArray(questions.id, picked.map(row => row.id)))
    if (picked.length < wanted) {
      const fallback = await db
        .select({ id: questions.id })
        .from(questions)
        .where(and(...fallbackFilters))
        .orderBy(sql`random()`)
        .limit(wanted - picked.length)
      picked = [...picked, ...fallback]
    }

    if (picked.length === 0) {
      return reply.code(422).send({ error: 'Немає тренувальних питань для цих параметрів' })
    }

    const session = await insertSessionWithJoinCode({
      teacherId:      req.user!.id,
      grade:          req.body.grade,
      difficulty,
      questionsCount: picked.length,
      kind:           'questions',
    })
    if (!session) return reply.code(500).send({ error: 'Не вдалося створити сесію' })

    await db.insert(schoolSessionQuestions).values(
      picked.map((q, position) => ({ sessionId: session.id, questionId: q.id, position })),
    )

    return reply.code(201).send({ session: serializeSession(session) })
  })

  // ── Вчитель: старт/фініш сесії (лише свою) ────────────────────────────────
  app.post<{ Params: { id: string } }>('/sessions/:id/start', { preHandler: authorizeTeacher, schema: { params: uuidParam } }, async (req, reply) => {
    const [updated] = await db.update(schoolSessions)
      .set({ status: 'active', startedAt: new Date() })
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id), eq(schoolSessions.status, 'lobby')))
      .returning({ id: schoolSessions.id })
    if (!updated) return reply.code(409).send({ error: 'Сесію не знайдено або її вже запущено' })
    return reply.send({ status: 'active' })
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/finish', { preHandler: authorizeTeacher, schema: { params: uuidParam } }, async (req, reply) => {
    const [updated] = await db.update(schoolSessions)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .returning({ id: schoolSessions.id })
    if (!updated) return reply.code(404).send({ error: 'Сесію не знайдено' })
    return reply.send({ status: 'finished' })
  })

  // ── Вчитель: стан + агрегат (лідерборд) своєї сесії ───────────────────────
  app.get<{ Params: { id: string } }>('/sessions/:id', { preHandler: authorizeTeacher, schema: { params: uuidParam } }, async (req, reply) => {
    const [session] = await db.select().from(schoolSessions)
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .limit(1)
    if (!session) return reply.code(404).send({ error: 'Сесію не знайдено' })

    const participants = await db
      .select({ id: schoolParticipants.id, avatar: schoolParticipants.avatar, nickname: schoolParticipants.nickname, score: schoolParticipants.score })
      .from(schoolParticipants)
      .where(eq(schoolParticipants.sessionId, session.id))
      .orderBy(desc(schoolParticipants.score))

    // Activity sessions have no per-question data at all: the teacher gets the
    // final client-reported result per child (time + how much was assembled).
    if (session.kind === 'activity') {
      const results = await db
        .select({
          participantId: schoolActivityResults.participantId,
          correct:       schoolActivityResults.correct,
          total:         schoolActivityResults.total,
          mistakes:      schoolActivityResults.mistakes,
          durationSec:   schoolActivityResults.durationSec,
          stars:         schoolActivityResults.stars,
          trust:         schoolActivityResults.trust,
          finishedAt:    schoolActivityResults.finishedAt,
        })
        .from(schoolActivityResults)
        .innerJoin(schoolParticipants, eq(schoolActivityResults.participantId, schoolParticipants.id))
        .where(eq(schoolParticipants.sessionId, session.id))
        .orderBy(asc(schoolActivityResults.durationSec))

      return reply.send({
        session: serializeSession(session),
        participants,
        topicStats: [],
        activityResults: results,
      })
    }

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
      session: serializeSession(session),
      participants,
      topicStats,
      activityResults: [],
    })
  })

  // ── Teacher: per-participant answer breakdown for an own session ──────────
  // Returns the participant's chosen answer as display text + correctness per
  // question. Never returns the answer key or explanation (School surface rule:
  // answer keys never reach the browser — docs/security-model.md).
  app.get<{ Params: { id: string; participantId: string } }>('/sessions/:id/participants/:participantId/answers', {
    preHandler: authorizeTeacher,
    schema: {
      params: {
        type: 'object',
        required: ['id', 'participantId'],
        properties: {
          id:            { type: 'string', format: 'uuid' },
          participantId: { type: 'string', format: 'uuid' },
        },
      } as const,
    },
  }, async (req, reply) => {
    const [session] = await db
      .select({ id: schoolSessions.id, status: schoolSessions.status, kind: schoolSessions.kind })
      .from(schoolSessions)
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .limit(1)
    if (!session) return reply.code(404).send({ error: 'Сесію не знайдено' })
    if (session.kind !== 'questions') return reply.code(409).send({ error: 'Ця сесія без питань' })
    // Question texts are issued to School surfaces only once the session is
    // active (docs/security-model.md); the breakdown includes them, so the
    // lobby state is blocked the same way as the projector question feed.
    if (session.status === 'lobby') {
      return reply.code(409).send({ error: 'Сесію ще не розпочато' })
    }

    const [participant] = await db
      .select({
        id: schoolParticipants.id,
        avatar: schoolParticipants.avatar,
        nickname: schoolParticipants.nickname,
        score: schoolParticipants.score,
      })
      .from(schoolParticipants)
      .where(and(
        eq(schoolParticipants.id, req.params.participantId),
        eq(schoolParticipants.sessionId, session.id),
      ))
      .limit(1)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })

    const rows = await db
      .select({
        position:  schoolSessionQuestions.position,
        q:         questions.q,
        type:      questions.type,
        topic:     questions.topic,
        options:   questions.options,
        answer:    schoolAnswers.answer,
        isCorrect: schoolAnswers.isCorrect,
      })
      .from(schoolSessionQuestions)
      .innerJoin(questions, eq(schoolSessionQuestions.questionId, questions.id))
      .leftJoin(schoolAnswers, and(
        eq(schoolAnswers.questionId, schoolSessionQuestions.questionId),
        eq(schoolAnswers.participantId, participant.id),
      ))
      .where(eq(schoolSessionQuestions.sessionId, session.id))
      .orderBy(asc(schoolSessionQuestions.position))

    return reply.send({
      participant,
      answers: rows.map(r => ({
        position:   r.position,
        q:          r.q,
        topic:      r.topic,
        answered:   r.isCorrect !== null,
        isCorrect:  r.isCorrect,
        answerText: r.isCorrect === null ? null : describeAnswer(r.type, r.options, r.answer),
      })),
    })
  })

  // ── Вчитель: попередній перегляд питань своєї сесії ───────────────────────
  // The teacher decides what the class plays, so the owner of a lobby/active
  // session sees the questions WITH the key before the game starts. Judging a
  // question needs what the class will see, so the payload carries the same
  // render data as the game (options, image, code) plus the key: as text, and
  // as the index of the correct option for single-choice mechanics. Deliberate
  // exception to "answer keys never reach the browser", scoped to the
  // authenticated owner; the nested key structures are still stripped
  // (docs/security-model.md).
  app.get<{ Params: { id: string } }>('/sessions/:id/preview', {
    preHandler: authorizeTeacher,
    schema: { params: uuidParam },
  }, async (req, reply) => {
    const [session] = await db
      .select({ id: schoolSessions.id, status: schoolSessions.status, kind: schoolSessions.kind })
      .from(schoolSessions)
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .limit(1)
    if (!session) return reply.code(404).send({ error: 'Сесію не знайдено' })
    if (session.kind !== 'questions') return reply.code(409).send({ error: 'Ця сесія без питань' })
    if (session.status === 'finished') return reply.code(409).send({ error: 'Сесію вже завершено' })

    const rows = await db
      .select({
        id:          questions.id,
        position:    schoolSessionQuestions.position,
        q:           questions.q,
        code:        questions.code,
        type:        questions.type,
        topic:       questions.topic,
        difficulty:  questions.difficulty,
        options:     questions.options,
        correct:     questions.correct,
        explanation: questions.explanation,
        img:         questions.img,
        imageAlt:    questions.imageAlt,
      })
      .from(schoolSessionQuestions)
      .innerJoin(questions, eq(schoolSessionQuestions.questionId, questions.id))
      .where(eq(schoolSessionQuestions.sessionId, session.id))
      .orderBy(asc(schoolSessionQuestions.position))

    // Which option is the key, for the mechanics that keep it in `correct`.
    // The rest (sort/match/input) are only readable as text — their key lives
    // inside options and stays stripped.
    const correctOption = (type: string | null, correct: number | null): number | null =>
      correct != null && ['choice', 'truefalse', 'sequence'].includes(type ?? 'choice') ? correct : null

    return reply.send({
      questions: rows.map(r => ({
        id:            r.id,
        position:      r.position,
        q:             r.q,
        code:          r.code,
        type:          r.type,
        topic:         r.topic,
        difficulty:    r.difficulty,
        options:       stripOptionKeys(r.options),
        correctOption: correctOption(r.type, r.correct),
        answerText:    describeCorrectAnswer(r.type, r.options, r.correct),
        explanation:   r.explanation,
        img:           r.img,
        imageAlt:      r.imageAlt,
      })),
    })
  })

  // Teacher projector mode receives only sanitized render data. Answer
  // evaluation remains server-side and never returns the answer key.
  app.get<{ Params: { id: string } }>('/sessions/:id/questions', {
    preHandler: authorizeTeacher,
    schema: { params: uuidParam },
  }, async (req, reply) => {
    const [session] = await db
      .select({ id: schoolSessions.id, status: schoolSessions.status, kind: schoolSessions.kind })
      .from(schoolSessions)
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .limit(1)
    if (!session) return reply.code(404).send({ error: 'Сесію не знайдено' })
    if (session.kind !== 'questions') return reply.code(409).send({ error: 'Ця сесія без питань' })
    if (session.status !== 'active') return reply.code(409).send({ error: 'Сесію ще не розпочато або вже завершено' })

    return reply.send({ questions: await loadSessionQuestions(session.id) })
  })

  app.post<{ Params: { id: string }; Body: { questionId: string; answer: AnswerValue } }>('/sessions/:id/projector-answer', {
    preHandler: authorizeTeacher,
    schema: { params: uuidParam, body: answerBody },
  }, async (req, reply) => {
    const [session] = await db
      .select({ id: schoolSessions.id, status: schoolSessions.status, kind: schoolSessions.kind })
      .from(schoolSessions)
      .where(and(eq(schoolSessions.id, req.params.id), eq(schoolSessions.teacherId, req.user!.id)))
      .limit(1)
    if (!session) return reply.code(404).send({ error: 'Сесію не знайдено' })
    if (session.kind !== 'questions') return reply.code(409).send({ error: 'Ця сесія без питань' })
    if (session.status !== 'active') return reply.code(409).send({ error: 'Сесія неактивна' })

    const [issued] = await db
      .select({ questionId: schoolSessionQuestions.questionId })
      .from(schoolSessionQuestions)
      .where(and(
        eq(schoolSessionQuestions.sessionId, session.id),
        eq(schoolSessionQuestions.questionId, req.body.questionId),
      ))
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
    return reply.send({ correct: results[question.id]?.isCorrect ?? false })
  })

  // ── Учень: приєднатися за кодом (анонімно) ────────────────────────────────
  app.post<{ Body: { code: string; avatar: string; nickname: string } }>('/join', {
    config: { rateLimit: { max: RATE_LIMIT_MAX.classroomStart, timeWindow: RATE_LIMIT_WINDOW } },
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
    const byCode = getCodeThrottleStatus(SCHOOL_JOIN_CODE_THROTTLE_SCOPE, req.body.code)
    const byIp = getCodeThrottleStatus(SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE, req.ip)
    const throttle = byCode.allowed ? byIp : byCode
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
      .select({
        id: schoolSessions.id,
        status: schoolSessions.status,
        grade: schoolSessions.grade,
        createdAt: schoolSessions.createdAt,
        kind: schoolSessions.kind,
        activityKey: schoolSessions.activityKey,
        activityLevel: schoolSessions.activityLevel,
      })
      .from(schoolSessions)
      .where(eq(schoolSessions.joinCode, req.body.code))
      .limit(1)
    if (!session) {
      recordCodeFailure(SCHOOL_JOIN_CODE_THROTTLE_SCOPE, req.body.code)
      recordCodeFailure(SCHOOL_JOIN_CODE_IP_THROTTLE_SCOPE, req.ip)
      return reply.code(404).send({ error: 'Сесію не знайдено' })
    }
    // Per-IP bucket intentionally not cleared — see code-throttle.ts.
    clearCodeThrottle(SCHOOL_JOIN_CODE_THROTTLE_SCOPE, req.body.code)
    if (session.status === 'finished') return reply.code(409).send({ error: 'Сесію вже завершено' })
    if (isSessionExpired(session.createdAt)) {
      await db.update(schoolSessions)
        .set({ status: 'finished', finishedAt: new Date() })
        .where(eq(schoolSessions.id, session.id))
      return reply.code(409).send({ error: 'Сесію вже завершено' })
    }

    const [participant] = await db.insert(schoolParticipants)
      .values({ sessionId: session.id, avatar: req.body.avatar, nickname })
      .returning({ id: schoolParticipants.id })

    const questionsForPlayer = session.status === 'active' && session.kind === 'questions'
      ? await loadSessionQuestions(session.id)
      : []

    return reply.code(201).send({
      participantId:    participant.id,
      participantToken: generateAttemptToken(participant.id),
      status:           session.status,
      grade:            session.grade,
      kind:             session.kind,
      activityKey:      session.activityKey,
      activityLevel:    session.activityLevel,
      questions:        questionsForPlayer,
      questionsCount:   questionsForPlayer.length,
    })
  })

  app.get<{ Params: { id: string } }>('/participants/:id/session', {
    config: { rateLimit: participantSessionRateLimit },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return

    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })

    // Activity sessions: nothing to resume question-wise. `activityDone` tells
    // the page whether this child already reported a result, so a reload lands
    // on the result screen instead of restarting the game.
    if (participant.kind === 'activity') {
      const [done] = await db
        .select({ id: schoolActivityResults.id })
        .from(schoolActivityResults)
        .where(eq(schoolActivityResults.participantId, participant.id))
        .limit(1)
      return reply.send({
        status: participant.status,
        grade: participant.grade,
        kind: participant.kind,
        activityKey: participant.activityKey,
        activityLevel: participant.activityLevel,
        questions: [],
        questionsCount: 0,
        score: 0,
        answeredQuestionIds: [],
        activityDone: Boolean(done),
      })
    }

    const questionsForPlayer = participant.status === 'active'
      ? await loadSessionQuestions(participant.sessionId)
      : []

    // Resume support after a page reload: the participant's own answered
    // question ids + server-trusted score. No keys, no other kids' data.
    const answered = await db
      .select({ questionId: schoolAnswers.questionId, isCorrect: schoolAnswers.isCorrect })
      .from(schoolAnswers)
      .where(eq(schoolAnswers.participantId, participant.id))

    return reply.send({
      status: participant.status,
      grade: participant.grade,
      kind: participant.kind,
      activityKey: participant.activityKey,
      activityLevel: participant.activityLevel,
      questions: questionsForPlayer,
      questionsCount: questionsForPlayer.length,
      score: answered.reduce((sum, answer) => sum + (answer.isCorrect ? 1 : 0), 0),
      answeredQuestionIds: answered.map(a => a.questionId),
      activityDone: false,
    })
  })

  app.patch<{ Params: { id: string }; Body: { avatar: string } }>('/participants/:id/avatar', {
    config: { rateLimit: participantAvatarRateLimit },
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
    config: { rateLimit: participantAnswerRateLimit },
    schema: { params: uuidParam, body: answerBody },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return

    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })
    if (participant.kind !== 'questions') return reply.code(409).send({ error: 'Ця сесія без питань' })
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

  // ── Учень: контентна активність «Факт чи думка» ───────────────────────────
  // The only content-backed activity so far: the browser receives statement
  // ids and text but no category or explanation, and every choice is evaluated
  // here. Both endpoints stay closed (409) for a question session and for any
  // other activity key, the same way the question surfaces stay closed for an
  // activity session.
  app.get<{ Params: { id: string } }>('/participants/:id/activity/fact-opinion', {
    config: { rateLimit: participantSessionRateLimit },
    schema: { params: uuidParam },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return
    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })
    if (participant.kind !== 'activity' || participant.activityKey !== 'fact-or-opinion') {
      return reply.code(409).send({ error: 'Ця сесія має іншу активність' })
    }
    if (participant.status !== 'active') return reply.code(409).send({ error: 'Сесія неактивна' })
    return reply.send({ statements: publicSchoolFactOpinionPack(participant.grade) })
  })

  app.post<{ Params: { id: string }; Body: { statementId: string; choice: SchoolFactOpinionChoice } }>('/participants/:id/activity/fact-opinion/answer', {
    config: { rateLimit: participantAnswerRateLimit },
    schema: { params: uuidParam, body: factOpinionAnswerBody },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return
    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })
    if (participant.kind !== 'activity' || participant.activityKey !== 'fact-or-opinion') {
      return reply.code(409).send({ error: 'Ця сесія має іншу активність' })
    }
    if (participant.status !== 'active') return reply.code(409).send({ error: 'Сесія неактивна' })

    const scored = scoreSchoolFactOpinion(participant.grade, req.body.statementId, req.body.choice)
    if (!scored) return reply.code(400).send({ error: 'Твердження не належить цій активності' })
    return reply.send(scored)
  })

  // ── Учень: фінальний результат активності ─────────────────────────────────
  // Procedural outcomes cannot be recomputed here. Content-backed activities
  // evaluate each answer on the server, but their aggregate still arrives
  // from the browser and is stored as `client-unverified` classroom evidence.
  // Never feed these numbers into entitlements, payments or certificates
  // (docs/security-model.md). The server still refuses implausible claims and
  // accepts exactly one result per participant.
  app.post<{ Params: { id: string }; Body: { correct: number; total: number; mistakes: number; durationSec: number } }>('/participants/:id/activity-result', {
    config: { rateLimit: participantActivityResultRateLimit },
    schema: { params: uuidParam, body: activityResultBody },
  }, async (req, reply) => {
    if (!requireParticipant(req, reply)) return

    const participant = await loadParticipantWithSession(req.params.id)
    if (!participant) return reply.code(404).send({ error: 'Учасника не знайдено' })
    if (participant.kind !== 'activity') return reply.code(409).send({ error: 'Ця сесія без активності' })
    if (participant.status !== 'active') return reply.code(409).send({ error: 'Сесія неактивна' })

    // The activity and level come from the session row, never from the body:
    // the child cannot claim an easier level than the teacher started.
    let activity, level, normalized
    try {
      activity   = resolveActivityDefinition(participant.activityKey)
      level      = resolveActivityLevel(activity, participant.activityLevel)
      normalized = normalizeActivityResult(activity, level, req.body)
    } catch (e) { return reply.code(400).send({ error: (e as Error).message }) }

    const [inserted] = await db.insert(schoolActivityResults)
      .values({
        participantId: participant.id,
        activityKey:   activity.key,
        activityLevel: level.id,
        correct:       normalized.correct,
        total:         normalized.total,
        mistakes:      normalized.mistakes,
        durationSec:   normalized.durationSec,
        stars:         normalized.stars,
        trust:         'client-unverified',
      })
      .onConflictDoNothing()
      .returning({ id: schoolActivityResults.id })
    if (!inserted) return reply.code(409).send({ error: 'Результат уже збережено' })

    // The leaderboard column is shared with question sessions; for activities
    // it holds how much of the activity the child completed.
    await db.update(schoolParticipants)
      .set({ score: normalized.correct })
      .where(eq(schoolParticipants.id, participant.id))

    return reply.send({ stars: normalized.stars, correct: normalized.correct, total: normalized.total })
  })
}
