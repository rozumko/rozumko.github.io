import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-heartbeat-flow'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [{ attemptRoutes }, { generateAttemptToken }, { db }, schema] = await Promise.all([
  import('./attempt.js'),
  import('./student-validation.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
])

const ids = {
  attempt: '00000000-0000-4000-8000-0000000000b1',
  other:   '00000000-0000-4000-8000-0000000000b2',
}

function createState() {
  return {
    attempt: {
      id: ids.attempt,
      codeId: '00000000-0000-4000-8000-0000000000c1',
      status: 'in_progress' as string,
      startedAt: new Date(Date.now() - 60_000), // 1 хв тому
      pausedSeconds: 0,
      lastSeenAt: null as Date | null,
    },
    // подія ще довго триває, ліміт великий → залишок > 0 (не чіпаємо finalize)
    event: { endsAt: new Date(Date.now() + 3_600_000), timeMinutes: 60 },
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = { select: db.select, update: db.update }
  const isTable = (a: unknown, b: unknown) => a === b

  class SelectQuery {
    table: unknown
    from(t: unknown) { this.table = t; return this }
    innerJoin() { return this }
    where() { return this }
    orderBy() { return this }
    limit() { return this }
    rows() {
      if (isTable(this.table, schema.attempts)) return [state.attempt]
      if (isTable(this.table, schema.accessCodes)) return [state.event] // join з olympiadEvents
      throw new Error('Unhandled fake select')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.rows()).then(res, rej)
    }
  }

  class UpdateQuery {
    table: unknown
    setVals: any = {}
    constructor(t: unknown) { this.table = t }
    set(v: any) { this.setVals = v; return this }
    where() { return this }
    returning() {
      if (isTable(this.table, schema.attempts)) {
        if (state.attempt.status !== 'in_progress') return []
        Object.assign(state.attempt, this.setVals)
        return [{ id: state.attempt.id }]
      }
      return []
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.returning()).then(res, rej)
    }
  }

  db.select = (() => new SelectQuery()) as unknown as typeof db.select
  db.update = ((t: unknown) => new UpdateQuery(t)) as unknown as typeof db.update
  return () => { db.select = original.select; db.update = original.update }
}

async function withApp(fn: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify()
  await app.register(attemptRoutes, { prefix: '/api/attempt' })
  await app.ready()
  try { await fn(app) } finally { await app.close() }
}

const url = `/api/attempt/${ids.attempt}/heartbeat`
const token = () => generateAttemptToken(ids.attempt)

test('heartbeat: великий розрив кредитує паузу і повертає залишок', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const lastSeenAt = new Date(Date.now() - 300_000)
      state.attempt.lastSeenAt = lastSeenAt
      const before = Date.now()
      const res = await app.inject({ method: 'POST', url, headers: { 'X-Attempt-Token': token() }, payload: {} })
      const after = Date.now()
      assert.equal(res.statusCode, 200, res.body)
      const body = res.json()
      const minPaused = Math.floor((before - lastSeenAt.getTime()) / 1000)
      const maxPaused = Math.floor((after - lastSeenAt.getTime()) / 1000)
      assert.ok(body.pausedSeconds >= minPaused && body.pausedSeconds <= maxPaused, `paused=${body.pausedSeconds}`)
      assert.ok(body.remainingSeconds > 0)
      assert.ok(state.attempt.lastSeenAt instanceof Date) // last_seen_at оновлено
    })
  } finally { restore() }
})

test('heartbeat: звичайний розрив (15с) не кредитує паузу', async () => {
  const state = createState()
  state.attempt.lastSeenAt = new Date(Date.now() - 15_000)
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url, headers: { 'X-Attempt-Token': token() }, payload: {} })
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json().pausedSeconds, 0)
    })
  } finally { restore() }
})

test('heartbeat: сумарна пауза не перевищує grace-ліміт (10 хв)', async () => {
  const state = createState()
  state.attempt.pausedSeconds = 500
  state.attempt.lastSeenAt = new Date(Date.now() - 400_000) // ще 400с
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url, headers: { 'X-Attempt-Token': token() }, payload: {} })
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json().pausedSeconds, 600) // 500+400=900 → cap 600
    })
  } finally { restore() }
})

test('heartbeat: без валідного токена — 403', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const noTok = await app.inject({ method: 'POST', url, payload: {} })
      assert.equal(noTok.statusCode, 403, noTok.body)
      const badTok = await app.inject({ method: 'POST', url, headers: { 'X-Attempt-Token': 'garbage' }, payload: {} })
      assert.equal(badTok.statusCode, 403, badTok.body)
      // токен від іншої спроби теж не підходить
      const foreign = await app.inject({ method: 'POST', url, headers: { 'X-Attempt-Token': generateAttemptToken(ids.other) }, payload: {} })
      assert.equal(foreign.statusCode, 403, foreign.body)
    })
  } finally { restore() }
})

test('heartbeat: завершена спроба — 409', async () => {
  const state = createState()
  state.attempt.status = 'finished'
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url, headers: { 'X-Attempt-Token': token() }, payload: {} })
      assert.equal(res.statusCode, 409, res.body)
    })
  } finally { restore() }
})

test('heartbeat: невалідний UUID у шляху — 400 до БД', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/attempt/not-a-uuid/heartbeat', headers: { 'X-Attempt-Token': token() }, payload: {} })
      assert.equal(res.statusCode, 400, res.body)
    })
  } finally { restore() }
})
