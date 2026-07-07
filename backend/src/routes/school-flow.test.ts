import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'

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
    session: { id: ids.session, joinCode: '123456', status: 'active', grade: 2, difficulty: 'easy', questionsCount: 1 },
    sessionExists: true,
    question: { id: ids.question, q: '2+2?', code: null, type: 'choice', options: ['4', '5'], correct: 0, explanation: 'Additon' },
    participant: null as null | { id: string; sessionId: string; avatar: string; nickname: string; score: number },
    issuedContains: true, // чи належить питання сесії (membership select)
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
    where() { return this }
    orderBy() { return this }
    limit() { return this }

    rows() {
      if (isTable(this.table, schema.schoolSessions)) {
        return state.sessionExists ? [state.session] : []
      }
      if (isTable(this.table, schema.schoolParticipants)) {
        return state.participant ? [state.participant] : []
      }
      if (isTable(this.table, schema.schoolSessionQuestions) && this.joins.includes(schema.questions)) {
        // render-набір для join (без ключів у select)
        const { id, q, code, type, options } = state.question
        return [{ id, q, code, type, options }]
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
    constructor(t: unknown) { this.table = t }
    set() { return this }
    where() { return this }
    returning() { return [] }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      if (isTable(this.table, schema.schoolParticipants) && state.participant) state.participant.score += 1
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
  await app.register(schoolRoutes, { prefix: '/api/school' })
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
      // ключі не течуть у браузер
      assert.equal('correct' in body.questions[0], false)
      assert.equal('explanation' in body.questions[0], false)
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

test('school: join is rejected while the session is still in lobby (409)', async () => {
  const state = createState()
  state.session.status = 'lobby'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/school/join', payload: { code: '123456', avatar: AVATAR, nickname: 'Рано' } })
      assert.equal(res.statusCode, 409, res.body)
      assert.match(res.json().error, /не розпочав/)
      // учасник НЕ створюється — жодного спаленого токена
      assert.equal(state.participant, null)
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
