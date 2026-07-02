import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Fastify from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-home-club'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [{ homeRoutes }, { db }, schema, { generateLeadToken }] = await Promise.all([
  import('./home.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
  import('./home-validation.js'),
])

const ids = {
  lead:        '00000000-0000-4000-8000-0000000000d1',
  profile:     '00000000-0000-4000-8000-0000000000d2',
  entitlement: '00000000-0000-4000-8000-0000000000d3',
  q1:          '00000000-0000-4000-8000-0000000000d4',
  q2:          '00000000-0000-4000-8000-0000000000d5',
}

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
const PAST = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

function createState() {
  return {
    lead: { id: ids.lead, parentEmail: 'parent@example.com' } as null | { id: string; parentEmail: string },
    profile: { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 } as null | { id: string; leadId: string; displayName: string | null; grade: number },
    entitlement: null as null | { id: string; leadId: string; status: string; currentPeriodEnd: Date | null },
    missionAttempts: [] as any[],
    practiceQuestions: [
      { id: ids.q1, type: 'choice', options: ['4', '5'], correct: 0, explanation: null },
      { id: ids.q2, type: 'choice', options: ['так', 'ні'], correct: 1, explanation: null },
    ],
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = { select: db.select, insert: db.insert, update: db.update, transaction: db.transaction }
  const isTable = (a: unknown, b: unknown) => a === b

  class SelectQuery {
    table: unknown
    from(t: unknown) { this.table = t; return this }
    innerJoin() { return this }
    where() { return this }
    orderBy() { return this }
    limit() { return this }
    rows() {
      if (isTable(this.table, schema.homeLeads)) return state.lead ? [state.lead] : []
      if (isTable(this.table, schema.homeChildProfiles)) return state.profile ? [state.profile] : []
      if (isTable(this.table, schema.homeEntitlements)) return state.entitlement ? [state.entitlement] : []
      if (isTable(this.table, schema.homeMissionAttempts)) return state.missionAttempts
      if (isTable(this.table, schema.questions)) return state.practiceQuestions
      throw new Error('Unhandled fake select')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.rows()).then(res, rej)
    }
  }

  class InsertQuery {
    table: unknown
    inserted: any
    constructor(t: unknown) { this.table = t }
    values(v: unknown) { this.inserted = v; return this }
    onConflictDoNothing() { return this }
    returning() {
      if (isTable(this.table, schema.homeMissionAttempts)) {
        state.missionAttempts.push(this.inserted)
        return [{ id: `attempt-${state.missionAttempts.length}` }]
      }
      throw new Error('Unhandled fake insert')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.returning()).then(res, rej)
    }
  }

  db.select = (() => new SelectQuery()) as unknown as typeof db.select
  db.insert = ((t: unknown) => new InsertQuery(t)) as unknown as typeof db.insert

  return () => {
    db.select = original.select
    db.insert = original.insert
    db.update = original.update
    db.transaction = original.transaction
  }
}

async function withApp(fn: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify()
  await app.register(homeRoutes, { prefix: '/api/home' })
  await app.ready()
  try { await fn(app) } finally { await app.close() }
}

function missionPayload() {
  return {
    missionId: 'practice-computational-thinking-grade2',
    missionVersion: 1,
    track: 'computational-thinking',
    grade: 2,
    startedAt: new Date(Date.now() - 600_000).toISOString(),
    finishedAt: new Date().toISOString(),
    events: [
      { questionId: ids.q1, answer: 0, timeToAnswerMs: 9000, answerChangeCount: 0, position: 0 },
      { questionId: ids.q2, answer: 0, timeToAnswerMs: 3000, answerChangeCount: 0, position: 1 },
    ],
  }
}

const headers = () => ({ 'X-Lead-Token': generateLeadToken(ids.lead) })
const missionUrl = `/api/home/leads/${ids.lead}/mission-report`

// ── Entitlement gate: платний контент закритий без активного доступу ─────────

test('club: без entitlement — 403, нічого не пишеться', async () => {
  const state = createState() // entitlement = null
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload: missionPayload() })
      assert.equal(res.statusCode, 403, res.body)
      assert.equal(state.missionAttempts.length, 0)
    })
  } finally { restore() }
})

test('club: expired entitlement блокує платний контент (403)', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'expired', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload: missionPayload() })
      assert.equal(res.statusCode, 403)
      assert.equal(state.missionAttempts.length, 0)
    })
  } finally { restore() }
})

test('club: revoked entitlement блокує платний контент (403)', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'revoked', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload: missionPayload() })
      assert.equal(res.statusCode, 403)
      assert.equal(state.missionAttempts.length, 0)
    })
  } finally { restore() }
})

test('club: active з минулим періодом блокує (403) — стан не довший за оплату', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: PAST }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload: missionPayload() })
      assert.equal(res.statusCode, 403)
    })
  } finally { restore() }
})

// ── Активний доступ: серверний скоринг, повторюваність, без ключів ────────────

test('club: active — місія приймається, скоринг серверний, повторна спроба дозволена', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const first = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload: missionPayload() })
      assert.equal(first.statusCode, 201, first.body)
      const { report } = first.json()
      assert.equal(report.correct, 1) // q1 вірно, q2 ні — рахує сервер
      assert.equal(report.total, 2)
      assert.equal(first.body.includes('explanation'), false)

      // Practice повторюваний — на відміну від демо
      const second = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload: missionPayload() })
      assert.equal(second.statusCode, 201, second.body)
      assert.equal(state.missionAttempts.length, 2)
      // Агрегат збережено для прогрес-списку
      assert.equal(state.missionAttempts[0].correct, 1)
      assert.equal(state.missionAttempts[0].total, 2)
    })
  } finally { restore() }
})

test('club: невалідний токен — 403 навіть з active entitlement', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: missionUrl, headers: { 'X-Lead-Token': 'deadbeef' }, payload: missionPayload() })
      assert.equal(res.statusCode, 403)
    })
  } finally { restore() }
})

test('club: питання поза тренувальним пулом — 400 і нічого не пишеться', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const payload = missionPayload()
      payload.events[0].questionId = '00000000-0000-4000-8000-0000000000ff'
      const res = await app.inject({ method: 'POST', url: missionUrl, headers: headers(), payload })
      assert.equal(res.statusCode, 400)
      assert.equal(state.missionAttempts.length, 0)
    })
  } finally { restore() }
})

// ── Прогрес і стан клубу ─────────────────────────────────────

test('club: GET /club повертає стан доступу і треки; без токена — 403', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/club`
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 403)

      const res = await app.inject({ method: 'GET', url, headers: headers() })
      assert.equal(res.statusCode, 200, res.body)
      const body = res.json()
      assert.equal(body.hasAccess, true)
      assert.equal(body.status, 'active')
      assert.deepEqual(body.tracks, ['informatics', 'computational-thinking', 'ai-basics'])
    })
  } finally { restore() }
})

test('club: GET /mission-reports — список спроб лише за валідним токеном', async () => {
  const state = createState()
  state.missionAttempts = [{
    childProfileId: ids.profile, missionId: 'practice-x', missionVersion: 1, track: 'ai-basics',
    grade: 2, correct: 2, total: 2, report: { correct: 2, total: 2 }, createdAt: new Date(),
  }]
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/mission-reports`
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 403)

      const res = await app.inject({ method: 'GET', url, headers: headers() })
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json().attempts.length, 1)
      assert.equal(res.json().attempts[0].correct, 2)
      // Сирі події не віддаються назад у браузер — лише звіт і агрегат
      assert.equal(res.body.includes('"events"'), false)
    })
  } finally { restore() }
})

// ── Межі поверхонь: School ↔ Home не перетинаються ────────────

test('home-роути не торкаються шкільних таблиць; school-роути не знають lead-токенів', () => {
  const homeSrc = readFileSync(new URL('./home.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(homeSrc, /schoolSessions|schoolParticipants|schoolAnswers|schoolSessionQuestions|x-participant-token/i)

  const schoolSrc = readFileSync(new URL('./school.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(schoolSrc, /homeLeads|homeChildProfiles|homeEntitlements|leadToken|x-lead-token/i)
})
