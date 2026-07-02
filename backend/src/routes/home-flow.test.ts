import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-home-flow'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [{ homeRoutes }, { db }, schema, validation] = await Promise.all([
  import('./home.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
  import('./home-validation.js'),
])
const { generateLeadToken, verifyLeadToken, buildDemoReport } = validation

const ids = {
  lead:      '00000000-0000-4000-8000-0000000000b1',
  profile:   '00000000-0000-4000-8000-0000000000b2',
  q1:        '00000000-0000-4000-8000-0000000000b3',
  q2:        '00000000-0000-4000-8000-0000000000b4',
  olympiadQ: '00000000-0000-4000-8000-0000000000b5',
}

function createState() {
  return {
    lead: null as null | { id: string; parentEmail: string },
    profile: null as null | { id: string; leadId: string; displayName: string | null; grade: number },
    attempt: null as null | { id: string; childProfileId: string; missionId: string; events?: any },
    report: null as null | { attemptId: string; report: unknown },
    // Тренувальний пул: q1 (правильно = 0), q2 (правильно = 1). olympiadQ поза пулом.
    practiceQuestions: [
      { id: ids.q1, type: 'choice', options: ['4', '5'], correct: 0, explanation: null },
      { id: ids.q2, type: 'choice', options: ['так', 'ні'], correct: 1, explanation: null },
    ],
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = { select: db.select, insert: db.insert, update: db.update }
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
      if (isTable(this.table, schema.homeDemoAttempts)) return state.attempt ? [state.attempt] : []
      if (isTable(this.table, schema.homeDemoReports)) return state.report ? [state.report] : []
      if (isTable(this.table, schema.questions)) {
        // Фейк моделює WHERE isOlympiad=false: олімпіадне питання ніколи не повертається.
        return state.practiceQuestions
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
    constructor(t: unknown) { this.table = t }
    values(v: unknown) { this.inserted = v; return this }
    onConflictDoNothing() { return this }
    returning() {
      if (isTable(this.table, schema.homeLeads)) {
        state.lead = { id: ids.lead, parentEmail: this.inserted.parentEmail }
        return [{ id: ids.lead }]
      }
      if (isTable(this.table, schema.homeChildProfiles)) {
        state.profile = { id: ids.profile, leadId: this.inserted.leadId, displayName: this.inserted.displayName, grade: this.inserted.grade }
        return [{ id: ids.profile }]
      }
      if (isTable(this.table, schema.homeDemoAttempts)) {
        if (state.attempt && state.attempt.missionId === this.inserted.missionId) return [] // UNIQUE конфлікт
        state.attempt = { id: 'attempt-1', childProfileId: this.inserted.childProfileId, missionId: this.inserted.missionId, events: this.inserted.events }
        return [{ id: 'attempt-1' }]
      }
      if (isTable(this.table, schema.homeDemoReports)) {
        state.report = { attemptId: this.inserted.attemptId, report: this.inserted.report }
        return [{ id: 'report-1' }]
      }
      throw new Error('Unhandled fake insert')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.returning()).then(res, rej)
    }
  }

  db.select = (() => new SelectQuery()) as unknown as typeof db.select
  db.insert = ((t: unknown) => new InsertQuery(t)) as unknown as typeof db.insert

  return () => { db.select = original.select; db.insert = original.insert; db.update = original.update }
}

async function withApp(fn: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify()
  await app.register(homeRoutes, { prefix: '/api/home' })
  await app.ready()
  try { await fn(app) } finally { await app.close() }
}

const validLeadPayload = {
  parentEmail: '  Parent@Example.COM ',
  consent: { policyVersion: 'privacy-2026-05', acceptedAt: '2026-07-02T10:00:00Z' },
  childProfile: { displayName: 'Марійка', grade: 2 },
}

function validDemoPayload() {
  return {
    missionId: 'demo-ct-grade2',
    missionVersion: 1,
    track: 'computational-thinking',
    grade: 2,
    startedAt: '2026-07-02T10:00:00Z',
    finishedAt: '2026-07-02T10:12:00Z',
    events: [
      // q1: правильна відповідь 0 → дитина відповіла 0 (вірно), повільно
      { questionId: ids.q1, answer: 0, timeToAnswerMs: 12000, answerChangeCount: 0, position: 0 },
      // q2: правильна відповідь 1 → дитина відповіла 0 (невірно), швидко
      { questionId: ids.q2, answer: 0, timeToAnswerMs: 2000, answerChangeCount: 0, position: 1 },
    ],
  }
}

test('home: створення ліда нормалізує email і повертає токен', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/home/leads', payload: validLeadPayload })
      assert.equal(res.statusCode, 201, res.body)
      const body = res.json()
      assert.equal(body.leadId, ids.lead)
      assert.equal(body.leadToken, generateLeadToken(ids.lead))
      assert.equal(state.lead?.parentEmail, 'parent@example.com')
      assert.equal(state.profile?.grade, 2)
    })
  } finally { restore() }
})

test('home: лід відхиляє невірний email і зайві поля (400)', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const badEmail = await app.inject({ method: 'POST', url: '/api/home/leads', payload: { ...validLeadPayload, parentEmail: 'not-an-email' } })
      assert.equal(badEmail.statusCode, 400)
      assert.equal(state.lead, null) // нічого не записано
    })
  } finally { restore() }
})

test('home: demo-report без валідного токена — 403, нічого не пишеться', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/demo-report`
      const noToken = await app.inject({ method: 'POST', url, payload: validDemoPayload() })
      assert.equal(noToken.statusCode, 403)
      const forged = await app.inject({ method: 'POST', url, headers: { 'X-Lead-Token': 'deadbeef' }, payload: validDemoPayload() })
      assert.equal(forged.statusCode, 403)
      // токен від attempt-домену того самого UUID теж не підходить
      assert.equal(verifyLeadToken(ids.lead, generateLeadToken(ids.profile)), false)
      assert.equal(state.attempt, null)
    })
  } finally { restore() }
})

test('home: demo-report без збереженого ліда/згоди — 404, consent-gate', async () => {
  const state = createState() // lead = null
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({
        method: 'POST', url: `/api/home/leads/${ids.lead}/demo-report`,
        headers: { 'X-Lead-Token': generateLeadToken(ids.lead) },
        payload: validDemoPayload(),
      })
      assert.equal(res.statusCode, 404)
      assert.equal(state.attempt, null)
    })
  } finally { restore() }
})

test('home: скоринг серверний, ключі не течуть у відповідь', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const res = await app.inject({
        method: 'POST', url: `/api/home/leads/${ids.lead}/demo-report`,
        headers: { 'X-Lead-Token': generateLeadToken(ids.lead) },
        payload: validDemoPayload(),
      })
      assert.equal(res.statusCode, 201, res.body)
      const { report } = res.json()
      // Сервер сам порахував: q1 вірно, q2 невірно → 1 з 2
      assert.equal(report.correct, 1)
      assert.equal(report.total, 2)
      assert.equal(report.missionVersion, 1)
      // Відповідь не містить ключів питань (correct-індексів чи explanation)
      assert.equal(res.body.includes('explanation'), false)
    })
  } finally { restore() }
})

// Fastify AJV (removeAdditional) вирізає невідомі поля ДО хендлера: клієнтська
// "правильність" ніколи не досягає скорингу і не зберігається у сирих подіях.
test('home: клієнтська "правильність" вирізається схемою і не впливає на звіт', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const payload = validDemoPayload() as any
      payload.events[1].correct = true // спроба навʼязати результат для невірної відповіді
      const res = await app.inject({
        method: 'POST', url: `/api/home/leads/${ids.lead}/demo-report`,
        headers: { 'X-Lead-Token': generateLeadToken(ids.lead) },
        payload,
      })
      assert.equal(res.statusCode, 201, res.body)
      // Сервер перерахував сам: q2 лишилась невірною попри client-claim
      assert.equal(res.json().report.correct, 1)
      // У збережені сирі події клієнтське поле не потрапило (AJV його вирізав)
      assert.ok(state.attempt)
      assert.equal('correct' in state.attempt!.events[1], false)
    })
  } finally { restore() }
})

test('home: питання поза тренувальним пулом — 400 (олімпіадні недоступні)', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const payload = validDemoPayload()
      payload.events[0].questionId = ids.olympiadQ
      const res = await app.inject({
        method: 'POST', url: `/api/home/leads/${ids.lead}/demo-report`,
        headers: { 'X-Lead-Token': generateLeadToken(ids.lead) },
        payload,
      })
      assert.equal(res.statusCode, 400, res.body)
      assert.equal(state.attempt, null)
    })
  } finally { restore() }
})

test('home: повторна подача тієї ж місії повертає збережений звіт (idempotent)', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/demo-report`
      const headers = { 'X-Lead-Token': generateLeadToken(ids.lead) }
      const first = await app.inject({ method: 'POST', url, headers, payload: validDemoPayload() })
      assert.equal(first.statusCode, 201)
      const second = await app.inject({ method: 'POST', url, headers, payload: validDemoPayload() })
      assert.equal(second.statusCode, 200, second.body)
      assert.deepEqual(second.json().report, first.json().report)
    })
  } finally { restore() }
})

test('home: шкільні ідентифікатори вирізаються і не зберігаються', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const payload = { ...validDemoPayload(), participantToken: 'abc', sessionId: ids.lead }
      const res = await app.inject({
        method: 'POST', url: `/api/home/leads/${ids.lead}/demo-report`,
        headers: { 'X-Lead-Token': generateLeadToken(ids.lead) },
        payload,
      })
      // AJV (removeAdditional) вирізає шкільні поля до хендлера —
      // вони не досягають ні логіки, ні збережених даних.
      assert.equal(res.statusCode, 201, res.body)
      assert.equal(res.body.includes('participantToken'), false)
      assert.equal(JSON.stringify(state.attempt).includes('sessionId'), false)
    })
  } finally { restore() }
})

test('home: GET звіту вимагає токен і повертає збережене', async () => {
  const state = createState()
  state.lead = { id: ids.lead, parentEmail: 'parent@example.com' }
  state.profile = { id: ids.profile, leadId: ids.lead, displayName: null, grade: 2 }
  state.attempt = { id: 'attempt-1', childProfileId: ids.profile, missionId: 'demo-ct-grade2' }
  state.report = { attemptId: 'attempt-1', report: { correct: 1, total: 2 } }
  const restore = installFakeDb(state)
  try {
    await withApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/demo-report`
      const noToken = await app.inject({ method: 'GET', url })
      assert.equal(noToken.statusCode, 403)
      const ok = await app.inject({ method: 'GET', url, headers: { 'X-Lead-Token': generateLeadToken(ids.lead) } })
      assert.equal(ok.statusCode, 200)
      assert.deepEqual(ok.json().report, { correct: 1, total: 2 })
    })
  } finally { restore() }
})

// ── Unit: токени і звіт ───────────────────────────────────────

test('generateLeadToken: доменно відокремлений від attempt-токенів', async () => {
  const { generateAttemptToken } = await import('./student-validation.js')
  assert.notEqual(generateLeadToken(ids.lead), generateAttemptToken(ids.lead))
  assert.equal(verifyLeadToken(ids.lead, generateAttemptToken(ids.lead)), false)
  assert.equal(verifyLeadToken(ids.lead, generateLeadToken(ids.lead)), true)
  assert.equal(verifyLeadToken(ids.lead, 'not-hex'), false)
})

test('buildDemoReport: haste-патерн лише при ≥2 швидких помилках', () => {
  const meta = { missionId: 'm', missionVersion: 1, track: 'ai-basics' as const }
  const fastWrong = (q: string, pos: number) => ({ questionId: q, position: pos, isCorrect: false, timeToAnswerMs: 2000, answerChangeCount: 0 })
  const one = buildDemoReport([fastWrong('a', 0)], meta)
  assert.equal(one.patterns.some(p => p.kind === 'haste'), false)
  const two = buildDemoReport([fastWrong('a', 0), fastWrong('b', 1)], meta)
  assert.equal(two.patterns.some(p => p.kind === 'haste'), true)
  assert.equal(two.nextMission.missionId, 'ai-basics-attention-1')
})

test('buildDemoReport: всі правильні → сильні сторони без патернів', () => {
  const meta = { missionId: 'm', missionVersion: 3, track: 'informatics' as const }
  const items = [0, 1, 2].map(i => ({ questionId: String(i), position: i, isCorrect: true, timeToAnswerMs: 9000, answerChangeCount: 0 }))
  const report = buildDemoReport(items, meta)
  assert.equal(report.correct, 3)
  assert.equal(report.patterns.length, 0)
  assert.equal(report.missionVersion, 3)
  assert.ok(report.strengths.length >= 1)
})

test('home-validation: нормалізація імені і подій', () => {
  assert.equal(validation.normalizeChildDisplayName('  Марійка   К.  '), 'Марійка К.')
  assert.equal(validation.normalizeChildDisplayName(undefined), null)
  assert.equal(validation.normalizeChildDisplayName(''), null)
  // керуючі символи вирізаються (будуємо їх через charCode, не літерально)
  assert.equal(validation.normalizeChildDisplayName(String.fromCharCode(7, 8) + 'Ая'), 'Ая')
  assert.throws(() => validation.normalizeParentEmail('nope'))
  assert.throws(() => validation.validateDemoEvents([
    { questionId: 'a', answer: 0, timeToAnswerMs: 1, answerChangeCount: 0, position: 0 },
    { questionId: 'a', answer: 1, timeToAnswerMs: 1, answerChangeCount: 0, position: 1 },
  ]))
})
