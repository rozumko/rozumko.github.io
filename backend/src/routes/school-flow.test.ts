import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-school-flow'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [{ schoolRoutes }, { db }, schema, { SCHOOL_AVATARS }, { resetCodeThrottleForTests }] = await Promise.all([
  import('./school.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
  import('./school-validation.js'),
  import('./code-throttle.js'),
])

const ids = {
  session: '00000000-0000-4000-8000-0000000000a1',
  participant: '00000000-0000-4000-8000-0000000000a2',
  question: '00000000-0000-4000-8000-0000000000a3',
  foreignQuestion: '00000000-0000-4000-8000-0000000000a4',
}
const AVATAR = SCHOOL_AVATARS[0]

function createState() {
  return {
    session: { id: ids.session, joinCode: '123456', status: 'active', grade: 2, difficulty: 'easy', questionsCount: 1, createdAt: new Date() },
    sessionExists: true,
    question: {
      id: ids.question,
      q: '2+2?',
      code: null,
      type: 'choice',
      options: ['4', '5'],
      correct: 0,
      explanation: 'Addition',
      img: '/questions/addition.webp',
      imageAlt: 'Four blocks arranged as two plus two',
    },
    participant: null as null | { id: string; sessionId: string; avatar: string; nickname: string; score: number },
    issuedContains: true, // Whether the question belongs to the issued session set
    answers: new Set<string>(),
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = { select: db.select, update: db.update, insert: db.insert }
  const isTable = (a: unknown, b: unknown) => a === b

  class SelectQuery {
    table: unknown
    joins: unknown[] = []
    from(t: unknown) { this.table = t; return this }
    innerJoin(t: unknown) { this.joins.push(t); return this }
    leftJoin(t: unknown) { this.joins.push(t); return this }
    where() { return this }
    orderBy() { return this }
    limit() { return this }

    rows() {
      if (isTable(this.table, schema.schoolSessions)) {
        return state.sessionExists ? [state.session] : []
      }
      if (isTable(this.table, schema.schoolSessionQuestions) && this.joins.includes(schema.schoolAnswers)) {
        // Teacher breakdown: one row per issued question + this participant's answer
        const { q, type, options } = state.question
        return [{ position: 0, q, type, topic: null, options, answer: 1, isCorrect: false }]
      }
      if (isTable(this.table, schema.schoolParticipants)) {
        if (this.joins.includes(schema.schoolSessions) && state.participant) {
          return [{
            id: state.participant.id,
            sessionId: state.participant.sessionId,
            score: state.participant.score,
            status: state.session.status,
            grade: state.session.grade,
          }]
        }
        return state.participant ? [state.participant] : []
      }
      if (isTable(this.table, schema.schoolAnswers)) {
        // Participant's own answered ids for the resume payload
        return [...state.answers].map(key => ({ questionId: key.split(':')[1] }))
      }
      if (isTable(this.table, schema.schoolSessionQuestions) && this.joins.includes(schema.questions)) {
        // Render payload for classroom clients, without answer keys
        const { id, q, code, type, options, img, imageAlt } = state.question
        return [{ id, q, code, type, options, img, imageAlt }]
      }
      if (isTable(this.table, schema.schoolSessionQuestions)) {
        // membership-перевірка в answer
        return state.issuedContains ? [{ questionId: state.question.id }] : []
      }
      if (isTable(this.table, schema.questions)) {
        return [state.question]
      }
      throw new Error('Unhandled fake select')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.rows()).then(res, rej)
    }
  }

  class InsertQuery {
    table: unknown
    inserted: any
    conflictDoNothing = false
    constructor(t: unknown) { this.table = t }
    values(v: unknown) { this.inserted = v; return this }
    onConflictDoNothing() { this.conflictDoNothing = true; return this }
    returning() {
      if (isTable(this.table, schema.schoolParticipants)) {
        state.participant = { id: ids.participant, sessionId: state.session.id, avatar: this.inserted.avatar, nickname: this.inserted.nickname, score: 0 }
        return [{ id: state.participant.id }]
      }
      if (isTable(this.table, schema.schoolAnswers)) {
        const key = `${this.inserted.participantId}:${this.inserted.questionId}`
        if (state.answers.has(key)) return [] // конфлікт UNIQUE → вже відповів
        state.answers.add(key)
        return [{ id: 'answer-1' }]
      }
      throw new Error('Unhandled fake insert')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.returning()).then(res, rej)
    }
  }

  class UpdateQuery {
    table: unknown
    patch: any
    constructor(t: unknown) { this.table = t }
    set(v: unknown) { this.patch = v; return this }
    where() { return this }
    // Аватар оновлюється атомарним UPDATE ... WHERE session in lobby → returning
    returning() {
      if (isTable(this.table, schema.schoolSessions) && state.sessionExists && this.patch?.status === 'finished') {
        state.session.status = 'finished'
        return [{ id: state.session.id }]
      }
      if (isTable(this.table, schema.schoolParticipants) && state.participant && this.patch?.avatar && state.session.status === 'lobby') {
        state.participant.avatar = this.patch.avatar
        return [{ id: state.participant.id }]
      }
      return []
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      if (isTable(this.table, schema.schoolParticipants) && state.participant && !this.patch?.avatar) {
        state.participant.score += 1
      }
      return Promise.resolve([]).then(res, rej)
    }
  }

  db.select = (() => new SelectQuery()) as unknown as typeof db.select
  db.insert = ((t: unknown) => new InsertQuery(t)) as unknown as typeof db.insert
  db.update = ((t: unknown) => new UpdateQuery(t)) as unknown as typeof db.update

  return () => { db.select = original.select; db.insert = original.insert; db.update = original.update }
}

async function withApp(fn: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify()
  await app.register(schoolRoutes, {
    prefix: '/api/school',
    authorizeTeacher: async (req: FastifyRequest) => {
      req.user = {
        id: '00000000-0000-4000-8000-0000000000f1',
        authUserId: 'teacher-auth-id',
        role: 'teacher',
        name: 'Test Teacher',
        email: 'teacher@example.test',
      }
    },
  })
  await app.ready()
  try { await fn(app) } finally { await app.close() }
}

test('school: join → answer correct → score increments; keys are stripped', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: '  Маша  ' } })
      assert.equal(join.statusCode, 201, join.body)
      const body = join.json()
      assert.equal(body.participantId, ids.participant)
      assert.equal(body.questions.length, 1)
      // Answer keys never reach the browser.
      assert.equal('correct' in body.questions[0], false)
      assert.equal('explanation' in body.questions[0], false)
      assert.equal(body.questions[0].img, '/questions/addition.webp')
      assert.equal(body.questions[0].imageAlt, 'Four blocks arranged as two plus two')
      assert.equal(state.participant?.nickname, 'Маша') // нормалізовано

      const answer = await app.inject({
        method: 'POST', url: `/api/school/participants/${ids.participant}/answer`,
        headers: { 'X-Participant-Token': body.participantToken },
        payload: { questionId: ids.question, answer: 0 },
      })
      assert.equal(answer.statusCode, 200, answer.body)
      assert.deepEqual(answer.json(), { correct: true })
      assert.equal(state.participant?.score, 1)
    })
  } finally { restore() }
})

test('school: answering the same question twice is rejected (409)', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Іван' } })
      const token = join.json().participantToken
      const url = `/api/school/participants/${ids.participant}/answer`
      const first = await app.inject({ method: 'POST', url, headers: { 'X-Participant-Token': token }, payload: { questionId: ids.question, answer: 1 } })
      assert.equal(first.statusCode, 200)
      const second = await app.inject({ method: 'POST', url, headers: { 'X-Participant-Token': token }, payload: { questionId: ids.question, answer: 0 } })
      assert.equal(second.statusCode, 409, second.body)
    })
  } finally { restore() }
})

test('school: answer without a valid participant token is 403', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const noToken = await app.inject({ method: 'POST', url: `/api/school/participants/${ids.participant}/answer`, payload: { questionId: ids.question, answer: 0 } })
      assert.equal(noToken.statusCode, 403)
      const badToken = await app.inject({ method: 'POST', url: `/api/school/participants/${ids.participant}/answer`, headers: { 'X-Participant-Token': 'deadbeef' }, payload: { questionId: ids.question, answer: 0 } })
      assert.equal(badToken.statusCode, 403)
    })
  } finally { restore() }
})

test('school: cannot answer a question not issued to the session (400)', async () => {
  const state = createState()
  state.issuedContains = false // membership повертає порожньо
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Оля' } })
      const token = join.json().participantToken
      const res = await app.inject({ method: 'POST', url: `/api/school/participants/${ids.participant}/answer`, headers: { 'X-Participant-Token': token }, payload: { questionId: ids.foreignQuestion, answer: 0 } })
      assert.equal(res.statusCode, 400, res.body)
    })
  } finally { restore() }
})

test('school: cannot answer when session is not active (409)', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Петро' } })
      const token = join.json().participantToken
      state.session.status = 'lobby' // ще не запущено
      const res = await app.inject({ method: 'POST', url: `/api/school/participants/${ids.participant}/answer`, headers: { 'X-Participant-Token': token }, payload: { questionId: ids.question, answer: 0 } })
      assert.equal(res.statusCode, 409, res.body)
    })
  } finally { restore() }
})

test('school: join with a stale code (past the session TTL) is rejected with 409', async () => {
  const state = createState()
  state.session.createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000) // 3h old > 2h TTL
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Запізнілий' } })
      assert.equal(res.statusCode, 409, res.body)
      assert.match(res.json().error, /завершено/)
      assert.equal(state.participant, null, 'expired session must not create a participant')
    })
  } finally { restore() }
})

test('school: lobby join creates a participant but does not issue questions before start', async () => {
  const state = createState()
  state.session.status = 'lobby'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Рано' } })
      assert.equal(res.statusCode, 201, res.body)
      const body = res.json()
      assert.equal(body.status, 'lobby')
      assert.equal(body.participantId, ids.participant)
      assert.deepEqual(body.questions, [])
      assert.equal(body.questionsCount, 0)
      assert.equal(state.participant?.nickname, 'Рано')
    })
  } finally { restore() }
})

test('school: participant session polling issues questions only after teacher starts', async () => {
  const state = createState()
  state.session.status = 'lobby'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Старт' } })
      assert.equal(join.statusCode, 201, join.body)
      const token = join.json().participantToken

      const lobby = await app.inject({
        method: 'GET',
        url: `/api/school/participants/${ids.participant}/session`,
        headers: { 'X-Participant-Token': token },
      })
      assert.equal(lobby.statusCode, 200, lobby.body)
      assert.equal(lobby.json().status, 'lobby')
      assert.deepEqual(lobby.json().questions, [])

      state.session.status = 'active'
      const active = await app.inject({
        method: 'GET',
        url: `/api/school/participants/${ids.participant}/session`,
        headers: { 'X-Participant-Token': token },
      })
      assert.equal(active.statusCode, 200, active.body)
      const body = active.json()
      assert.equal(body.status, 'active')
      assert.equal(body.questions.length, 1)
      assert.equal('correct' in body.questions[0], false)
      assert.equal('explanation' in body.questions[0], false)
      assert.equal(body.questions[0].img, '/questions/addition.webp')
      assert.equal(body.questions[0].imageAlt, 'Four blocks arranged as two plus two')
      // Resume payload: no answers yet
      assert.deepEqual(body.answeredQuestionIds, [])
      assert.equal(body.score, 0)

      // After answering, polling reports the own answered id + server score
      const answer = await app.inject({
        method: 'POST', url: `/api/school/participants/${ids.participant}/answer`,
        headers: { 'X-Participant-Token': token },
        payload: { questionId: ids.question, answer: 0 },
      })
      assert.equal(answer.statusCode, 200, answer.body)
      const resumed = await app.inject({
        method: 'GET',
        url: `/api/school/participants/${ids.participant}/session`,
        headers: { 'X-Participant-Token': token },
      })
      const resumedBody = resumed.json()
      assert.deepEqual(resumedBody.answeredQuestionIds, [ids.question])
      assert.equal(resumedBody.score, 1)
    })
  } finally { restore() }
})

test('school: teacher can cancel a lobby session before changing game settings', async () => {
  const state = createState()
  state.session.status = 'lobby'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const canceled = await app.inject({ method: 'POST', url: `/api/school/sessions/${ids.session}/finish` })
      assert.equal(canceled.statusCode, 200, canceled.body)
      assert.deepEqual(canceled.json(), { status: 'finished' })
      assert.equal(state.session.status, 'finished')

      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Пізно' } })
      assert.equal(join.statusCode, 409, join.body)
      assert.equal(state.participant, null)
    })
  } finally { restore() }
})

test('school: projector questions are sanitized and available only for an active owned session', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const active = await app.inject({ method: 'GET', url: `/api/school/sessions/${ids.session}/questions` })
      assert.equal(active.statusCode, 200, active.body)
      const body = active.json()
      assert.equal(body.questions.length, 1)
      assert.equal('correct' in body.questions[0], false)
      assert.equal('explanation' in body.questions[0], false)
      assert.equal(body.questions[0].img, '/questions/addition.webp')
      assert.equal(body.questions[0].imageAlt, 'Four blocks arranged as two plus two')

      state.session.status = 'finished'
      const finished = await app.inject({ method: 'GET', url: `/api/school/sessions/${ids.session}/questions` })
      assert.equal(finished.statusCode, 409, finished.body)
    })
  } finally { restore() }
})

test('school: projector answers are scored on the server without returning an answer key', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const answer = await app.inject({
        method: 'POST',
        url: `/api/school/sessions/${ids.session}/projector-answer`,
        payload: { questionId: ids.question, answer: 0 },
      })
      assert.equal(answer.statusCode, 200, answer.body)
      assert.deepEqual(answer.json(), { correct: true })

      state.issuedContains = false
      const foreign = await app.inject({
        method: 'POST',
        url: `/api/school/sessions/${ids.session}/projector-answer`,
        payload: { questionId: ids.foreignQuestion, answer: 0 },
      })
      assert.equal(foreign.statusCode, 400, foreign.body)
    })
  } finally { restore() }
})

test('school: teacher participant breakdown returns answer text + correctness, never keys', async () => {
  const state = createState()
  state.participant = { id: ids.participant, sessionId: ids.session, avatar: AVATAR, nickname: 'Маша', score: 0 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/school/sessions/${ids.session}/participants/${ids.participant}/answers`,
      })
      assert.equal(res.statusCode, 200, res.body)
      const body = res.json()
      assert.equal(body.participant.nickname, 'Маша')
      assert.equal(body.answers.length, 1)
      // Fake DB stores answer index 1 (wrong) → resolved to option text "5"
      assert.equal(body.answers[0].answerText, '5')
      assert.equal(body.answers[0].isCorrect, false)
      assert.equal(body.answers[0].answered, true)
      // Answer keys and explanations never reach the browser (School surface rule)
      assert.ok(!res.body.includes('"correct"'), 'answer key leaked in breakdown response')
      assert.ok(!res.body.includes('"explanation"'), 'explanation leaked in breakdown response')
      // Lobby sessions must not reveal question texts before start (409)
      state.session.status = 'lobby'
      const lobby = await app.inject({
        method: 'GET',
        url: `/api/school/sessions/${ids.session}/participants/${ids.participant}/answers`,
      })
      assert.equal(lobby.statusCode, 409, lobby.body)
      state.session.status = 'active'
      // Participant not in this session → 404
      state.participant = null
      const missing = await app.inject({
        method: 'GET',
        url: `/api/school/sessions/${ids.session}/participants/${ids.participant}/answers`,
      })
      assert.equal(missing.statusCode, 404, missing.body)
    })
  } finally { restore() }
})

test('school: lobby participant can update avatar before start', async () => {
  const state = createState()
  state.session.status = 'lobby'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Герой' } })
      assert.equal(join.statusCode, 201, join.body)
      const token = join.json().participantToken
      const nextAvatar = SCHOOL_AVATARS[1]

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/school/participants/${ids.participant}/avatar`,
        headers: { 'X-Participant-Token': token },
        payload: { avatar: nextAvatar },
      })

      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(res.json(), { avatar: nextAvatar })
      assert.equal(state.participant?.avatar, nextAvatar)
    })
  } finally { restore() }
})

test('school: participant cannot update avatar after start', async () => {
  const state = createState()
  state.session.status = 'lobby'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const join = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Герой' } })
      assert.equal(join.statusCode, 201, join.body)
      const token = join.json().participantToken
      state.session.status = 'active'

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/school/participants/${ids.participant}/avatar`,
        headers: { 'X-Participant-Token': token },
        payload: { avatar: SCHOOL_AVATARS[1] },
      })

      assert.equal(res.statusCode, 409, res.body)
      assert.equal(state.participant?.avatar, AVATAR)
    })
  } finally { restore() }
})

test('school: join rejects an avatar outside the allowlist (400)', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: '<script>', nickname: 'Х' } })
      assert.equal(res.statusCode, 400, res.body)
    })
  } finally { restore() }
})

test('school: join throttles repeated unknown valid-format codes', async () => {
  resetCodeThrottleForTests()
  const state = createState()
  state.sessionExists = false
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      for (let i = 0; i < 5; i++) {
        const miss = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '999999', avatar: AVATAR, nickname: 'Тест' } })
        assert.equal(miss.statusCode, 404, miss.body)
      }

      const throttled = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '999999', avatar: AVATAR, nickname: 'Тест' } })
      assert.equal(throttled.statusCode, 429, throttled.body)
      assert.ok(Number(throttled.headers['retry-after']) > 0)
    })
  } finally {
    resetCodeThrottleForTests()
    restore()
  }
})
