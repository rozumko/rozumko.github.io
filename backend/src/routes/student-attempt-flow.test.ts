import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-student-flow'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [
  { studentRoutes },
  { attemptRoutes },
  { db },
  schema,
  { resetCodeThrottleForTests },
] = await Promise.all([
  import('./student.js'),
  import('./attempt.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
  import('./code-throttle.js'),
])

const ids = {
  code: '00000000-0000-4000-8000-000000000001',
  event: '00000000-0000-4000-8000-000000000002',
  attempt: '00000000-0000-4000-8000-000000000003',
  question: '00000000-0000-4000-8000-000000000004',
}

function createState() {
  const now = new Date()
  return {
    accessCode: {
      id: ids.code,
      eventId: ids.event,
      registrationId: null,
      code: 'КІТ247',
      grade: 1,
      maxUses: 1,
      usedCount: 0,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      createdBy: 'teacher',
      createdAt: now,
    },
    accessCodeExists: true,
    event: {
      id: ids.event,
      title: 'Test Olympiad',
      description: null,
      status: 'active',
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 60 * 60_000),
      timeMinutes: 15,
      questionsCount: 1,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
    },
    questions: [{
      id: ids.question,
      q: '2 + 2?',
      code: null,
      type: 'choice',
      options: ['4', '5'],
      correct: 0,
      explanation: 'Basic addition',
      difficulty: 'easy',
      grade: 1,
    }],
    attempt: null as null | {
      id: string
      codeId: string
      grade: number
      status: string
      answers: Record<string, number | string | number[]>
      score: number | null
      totalQ: number
      startedAt: Date
      finishedAt: Date | null
    },
    attemptQuestions: [] as { attemptId: string; questionId: string; position: number }[],
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = {
    select: db.select,
    update: db.update,
    insert: db.insert,
    transaction: db.transaction,
  }

  const isTable = (actual: unknown, expected: unknown) => actual === expected

  class SelectQuery {
    table: unknown
    joins: unknown[] = []

    from(table: unknown) { this.table = table; return this }
    innerJoin(table: unknown) { this.joins.push(table); return this }
    where() { return this }
    orderBy() { return this }
    limit() { return this }
    for() { return this }

    rows() {
      if (isTable(this.table, schema.accessCodes) && this.joins.includes(schema.olympiadEvents)) {
        return [{ endsAt: state.event.endsAt, timeMinutes: state.event.timeMinutes }]
      }
      if (isTable(this.table, schema.accessCodes)) {
        return state.accessCodeExists ? [state.accessCode] : []
      }
      if (isTable(this.table, schema.olympiadEvents)) {
        return [state.event]
      }
      if (isTable(this.table, schema.attempts)) {
        return state.attempt ? [state.attempt] : []
      }
      if (isTable(this.table, schema.eventQuestions) && this.joins.includes(schema.questions)) {
        return state.questions.map(({ id, q, code, type, options }) => ({ id, q, code, type, options }))
      }
      if (isTable(this.table, schema.attemptQuestions) && this.joins.includes(schema.questions)) {
        return state.attemptQuestions
          .sort((a, b) => a.position - b.position)
          .map(aq => {
            const question = state.questions.find(q => q.id === aq.questionId)
            assert.ok(question)
            return {
              id: question.id,
              q: question.q,
              code: question.code,
              type: question.type,
              options: question.options,
              correct: question.correct,
              explanation: question.explanation,
            }
          })
      }
      if (isTable(this.table, schema.attemptQuestions)) {
        return state.attemptQuestions.map(aq => ({ questionId: aq.questionId }))
      }
      throw new Error('Unhandled fake select query')
    }

    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(this.rows()).then(resolve, reject)
    }
  }

  class UpdateQuery {
    table: unknown
    values: Record<string, unknown> = {}

    constructor(table: unknown) { this.table = table }
    set(values: Record<string, unknown>) { this.values = values; return this }
    where() { return this }

    returning() {
      if (isTable(this.table, schema.accessCodes)) {
        if (state.accessCode.usedCount >= state.accessCode.maxUses) return []
        state.accessCode.usedCount += 1
        return [{ id: state.accessCode.id }]
      }
      if (isTable(this.table, schema.attempts)) {
        if (!state.attempt) return []
        if ('answers' in this.values) {
          if (state.attempt.status !== 'in_progress') return []
          state.attempt.answers[ids.question] = 0
          return [{ id: state.attempt.id }]
        }
        state.attempt.status = 'finished'
        state.attempt.score = Number(this.values.score)
        state.attempt.finishedAt = this.values.finishedAt as Date
        return [{ id: state.attempt.id }]
      }
      throw new Error('Unhandled fake update query')
    }

    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(this.returning()).then(resolve, reject)
    }
  }

  class InsertQuery {
    table: unknown
    inserted: unknown

    constructor(table: unknown) { this.table = table }
    values(inserted: unknown) { this.inserted = inserted; return this }

    returning() {
      if (isTable(this.table, schema.attempts)) {
        const row = Array.isArray(this.inserted) ? this.inserted[0] : this.inserted as any
        state.attempt = {
          id: ids.attempt,
          codeId: row.codeId,
          grade: row.grade,
          status: 'in_progress',
          answers: {},
          score: null,
          totalQ: row.totalQ,
          startedAt: new Date(),
          finishedAt: null,
        }
        return [{ id: state.attempt.id, startedAt: state.attempt.startedAt }]
      }
      throw new Error('Unhandled fake insert returning query')
    }

    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      if (isTable(this.table, schema.attemptQuestions)) {
        state.attemptQuestions = this.inserted as typeof state.attemptQuestions
        return Promise.resolve([]).then(resolve, reject)
      }
      return Promise.resolve(this.returning()).then(resolve, reject)
    }
  }

  const fakeDb = {
    select: () => new SelectQuery(),
    update: (table: unknown) => new UpdateQuery(table),
    insert: (table: unknown) => new InsertQuery(table),
    transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb),
  }

  db.select = fakeDb.select as unknown as typeof db.select
  db.update = fakeDb.update as unknown as typeof db.update
  db.insert = fakeDb.insert as unknown as typeof db.insert
  db.transaction = fakeDb.transaction as unknown as typeof db.transaction

  return () => {
    db.select = original.select
    db.update = original.update
    db.insert = original.insert
    db.transaction = original.transaction
  }
}

test('student can exchange a personal code, save an answer, and finish an attempt', async () => {
  const state = createState()
  const restoreDb = installFakeDb(state)
  const app = Fastify()

  try {
    await app.register(studentRoutes, { prefix: '/api/student' })
    await app.register(attemptRoutes, { prefix: '/api/attempt' })
    await app.ready()

    const exchange = await app.inject({
      method: 'POST',
      url: '/api/student/exchange-code',
      payload: { code: state.accessCode.code },
    })

    assert.equal(exchange.statusCode, 201, exchange.body)
    const exchangeBody = exchange.json()
    assert.equal(exchangeBody.attemptId, ids.attempt)
    assert.equal(exchangeBody.grade, 1)
    assert.equal(exchangeBody.questions.length, 1)
    assert.equal('correct' in exchangeBody.questions[0], false)
    assert.equal('explanation' in exchangeBody.questions[0], false)

    const answer = await app.inject({
      method: 'POST',
      url: `/api/attempt/${exchangeBody.attemptId}/answer`,
      headers: { 'X-Attempt-Token': exchangeBody.attemptToken },
      payload: { questionId: ids.question, answer: 0 },
    })

    assert.equal(answer.statusCode, 200, answer.body)
    assert.deepEqual(answer.json(), { saved: true })

    const finish = await app.inject({
      method: 'POST',
      url: `/api/attempt/${exchangeBody.attemptId}/finish`,
      headers: { 'X-Attempt-Token': exchangeBody.attemptToken },
      payload: {},
    })

    assert.equal(finish.statusCode, 200, finish.body)
    assert.deepEqual(finish.json(), { score: 1, total: 1 })
    assert.equal(state.attempt?.status, 'finished')
    assert.equal(state.attempt?.answers[ids.question], 0)
  } finally {
    restoreDb()
    await app.close()
  }
})

test('student code endpoints throttle repeated unknown valid-format codes', async () => {
  resetCodeThrottleForTests()
  const state = createState()
  const missingCode = state.accessCode.code
  state.accessCodeExists = false
  const restoreDb = installFakeDb(state)
  const app = Fastify()

  try {
    await app.register(studentRoutes, { prefix: '/api/student' })
    await app.ready()

    for (let i = 0; i < 5; i++) {
      const miss = await app.inject({
        method: 'GET',
        url: `/api/student/validate-code?code=${encodeURIComponent(missingCode)}`,
      })
      assert.equal(miss.statusCode, 404, miss.body)
    }

    const throttled = await app.inject({
      method: 'POST',
      url: '/api/student/exchange-code',
      payload: { code: missingCode },
    })
    assert.equal(throttled.statusCode, 429, throttled.body)
    assert.ok(Number(throttled.headers['retry-after']) > 0)
  } finally {
    resetCodeThrottleForTests()
    restoreDb()
    await app.close()
  }
})

// Resume exists so a crashed tab or F5 does not burn a child's only code. It is
// gated on maxUses === 1 (one code per child). Dropping that guard would hand
// the second child of a shared classroom code the first child's attempt id and
// a valid attempt token — the comment in student.ts says so, these assert it.
test('a personal code (maxUses=1) resumes the same attempt without spending the code again', async () => {
  resetCodeThrottleForTests()
  const state = createState()
  const restoreDb = installFakeDb(state)
  const app = Fastify()

  try {
    await app.register(studentRoutes, { prefix: '/api/student' })
    await app.ready()

    const first = await app.inject({
      method: 'POST', url: '/api/student/exchange-code', payload: { code: state.accessCode.code },
    })
    assert.equal(first.statusCode, 201, first.body)
    assert.equal(state.accessCode.usedCount, 1)

    const resumed = await app.inject({
      method: 'POST', url: '/api/student/exchange-code', payload: { code: state.accessCode.code },
    })
    assert.equal(resumed.statusCode, 200, resumed.body)
    assert.equal(resumed.json().attemptId, first.json().attemptId)
    assert.equal(state.accessCode.usedCount, 1, 'резюм не має споживати код удруге')
    assert.equal('correct' in resumed.json().questions[0], false)
  } finally {
    resetCodeThrottleForTests()
    restoreDb()
    await app.close()
  }
})

test('a shared code (maxUses>1) never resumes another child\'s attempt', async () => {
  resetCodeThrottleForTests()
  const state = createState()
  state.accessCode.maxUses = 25
  const restoreDb = installFakeDb(state)
  const app = Fastify()

  try {
    await app.register(studentRoutes, { prefix: '/api/student' })
    await app.ready()

    const childA = await app.inject({
      method: 'POST', url: '/api/student/exchange-code', payload: { code: state.accessCode.code },
    })
    assert.equal(childA.statusCode, 201, childA.body)
    assert.equal(state.accessCode.usedCount, 1)

    // The fake db returns child A's in-progress attempt here, exactly as the real
    // query would. 201 (not 200) proves the maxUses guard refused to hand it over.
    const childB = await app.inject({
      method: 'POST', url: '/api/student/exchange-code', payload: { code: state.accessCode.code },
    })
    assert.equal(childB.statusCode, 201, 'дитина Б отримала спробу дитини А')
    assert.equal(state.accessCode.usedCount, 2, 'кожна дитина має списати одне використання')
  } finally {
    resetCodeThrottleForTests()
    restoreDb()
    await app.close()
  }
})

test('an exhausted code is refused and its counter does not move', async () => {
  resetCodeThrottleForTests()
  const state = createState()
  state.accessCode.maxUses = 2
  state.accessCode.usedCount = 2
  const restoreDb = installFakeDb(state)
  const app = Fastify()

  try {
    await app.register(studentRoutes, { prefix: '/api/student' })
    await app.ready()

    const refused = await app.inject({
      method: 'POST', url: '/api/student/exchange-code', payload: { code: state.accessCode.code },
    })
    assert.equal(refused.statusCode, 409, refused.body)
    assert.equal(state.accessCode.usedCount, 2)
  } finally {
    resetCodeThrottleForTests()
    restoreDb()
    await app.close()
  }
})

test('concurrent exchanges on a single-use code spend it exactly once', async () => {
  resetCodeThrottleForTests()
  const state = createState()
  const restoreDb = installFakeDb(state)
  const app = Fastify()

  try {
    await app.register(studentRoutes, { prefix: '/api/student' })
    await app.ready()

    const results = await Promise.all([1, 2, 3].map(() => app.inject({
      method: 'POST', url: '/api/student/exchange-code', payload: { code: state.accessCode.code },
    })))

    assert.equal(results.filter(r => r.statusCode === 201).length, 1, 'рівно одна спроба має бути створена')
    assert.equal(state.accessCode.usedCount, 1)
    for (const result of results) assert.ok([201, 200, 409].includes(result.statusCode), String(result.statusCode))
  } finally {
    resetCodeThrottleForTests()
    restoreDb()
    await app.close()
  }
})
