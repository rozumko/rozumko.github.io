import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { PathProgressStore, PathProgressView } from './parent-path-progress.js'

process.env.ATTEMPT_SECRET = 'test-secret-for-parent-flow'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [{ parentRoutes }, { db }, schema, { generateLeadToken }] = await Promise.all([
  import('./parent.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
  import('./home-validation.js'),
])

// Інтеграційні тести батьківської зони на фейковій БД (патерн home-flow):
// реєстрація, /me, транзакційний claim, ізоляція профілів між акаунтами.

const ids = {
  leadA:    '00000000-0000-4000-8000-0000000000a1',
  leadB:    '00000000-0000-4000-8000-0000000000a2',
  profileA: '00000000-0000-4000-8000-0000000000a3',
  profileB: '00000000-0000-4000-8000-0000000000a4',
  accountA: '00000000-0000-4000-8000-0000000000a5',
  accountB: '00000000-0000-4000-8000-0000000000a6',
}

interface AccountRow { id: string; authUserId: string; email: string; emailVerifiedAt: Date | null; status: string }
interface LeadRow { id: string; parentEmail: string; parentAccountId: string | null; claimedAt: Date | null }
interface ProfileRow { id: string; leadId: string | null; displayName: string | null; grade: number; parentAccountId: string | null }
interface EntitlementRow { leadId: string; status: string; currentPeriodEnd: Date | null }
interface ReportRow { childProfileId: string; missionId: string; track: string; grade: number; report: unknown; createdAt: Date }

function createState() {
  return {
    accounts: [] as AccountRow[],
    leads: [
      { id: ids.leadA, parentEmail: 'mama@example.com', parentAccountId: null, claimedAt: null },
      { id: ids.leadB, parentEmail: 'inshi@example.com', parentAccountId: null, claimedAt: null },
    ] as LeadRow[],
    profiles: [
      { id: ids.profileA, leadId: ids.leadA, displayName: 'Марійка', grade: 2, parentAccountId: null },
      { id: ids.profileB, leadId: ids.leadB, displayName: 'Максим', grade: 3, parentAccountId: null },
    ] as ProfileRow[],
    entitlements: [] as EntitlementRow[],
    demoReports: [] as ReportRow[],
    missionAttempts: [] as ReportRow[],
    nextAccountId: ids.accountA,
    nextProfileId: '00000000-0000-4000-8000-0000000000c1',
  }
}
type State = ReturnType<typeof createState>

// Мінімальний фейк drizzle: where-умови застосовуємо вручну через контекст
// останнього запиту — достатньо для маршрутів parent.ts.
function installFakeDb(state: State) {
  const original = { select: db.select, insert: db.insert, update: db.update, transaction: db.transaction }

  // Витягуємо значення з drizzle-умов не парсячи їх: маршрути фільтрують лише
  // за цими полями, тож фейк відтворює семантику вручну по snapshot умови.
  const condValues = (cond: unknown): string[] => {
    const out: string[] = []
    const walk = (node: any) => {
      if (node == null || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (typeof node.value === 'string') out.push(node.value)
      if (node.queryChunks) walk(node.queryChunks)
    }
    walk((cond as any))
    return out
  }

  class SelectQuery {
    table: unknown
    values: string[] = []
    constructor(private fields?: Record<string, unknown>) {}
    from(t: unknown) { this.table = t; return this }
    innerJoin() { return this }
    orderBy() { return this }
    where(cond: unknown) { this.values = condValues(cond); return this }
    limit() { return this }
    pick(rows: Array<Record<string, unknown>>) {
      if (!this.fields) return rows
      const keys = Object.keys(this.fields)
      return rows.map(r => Object.fromEntries(keys.map(k => [k, r[k] ?? null])))
    }
    rawRows() {
      if (this.table === schema.homeParentAccounts) {
        return state.accounts.filter(a => this.values.includes(a.authUserId) || this.values.includes(a.id))
      }
      if (this.table === schema.homeLeads) {
        return state.leads.filter(l => this.values.includes(l.id) || (l.parentAccountId && this.values.includes(l.parentAccountId)))
      }
      if (this.table === schema.homeChildProfiles) {
        return state.profiles.filter(p =>
          this.values.includes(p.id)
          || (p.parentAccountId && this.values.includes(p.parentAccountId))
          || (p.leadId && this.values.includes(p.leadId)))
      }
      if (this.table === schema.homeEntitlements) {
        return state.entitlements.filter(e => this.values.includes(e.leadId))
      }
      if (this.table === schema.homeDemoReports) {
        return state.demoReports.filter(r => this.values.includes(r.childProfileId))
      }
      if (this.table === schema.homeMissionAttempts) {
        return state.missionAttempts.filter(r => this.values.includes(r.childProfileId))
      }
      throw new Error('Unhandled fake select')
    }
    rows() { return this.pick(this.rawRows() as unknown as Array<Record<string, unknown>>) }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.rows()).then(res, rej)
    }
  }

  class InsertQuery {
    constructor(private table: unknown) {}
    inserted: any
    values(v: unknown) { this.inserted = v; return this }
    returning() { return Promise.resolve(this.apply()) }
    apply() {
      if (this.table === schema.homeParentAccounts) {
        const row: AccountRow = {
          id: state.nextAccountId,
          authUserId: this.inserted.authUserId,
          email: this.inserted.email,
          emailVerifiedAt: this.inserted.emailVerifiedAt ?? null,
          status: 'active',
        }
        state.accounts.push(row)
        return [{ id: row.id }]
      }
      if (this.table === schema.homeChildProfiles) {
        const row: ProfileRow = {
          id: state.nextProfileId,
          leadId: this.inserted.leadId ?? null,
          displayName: this.inserted.displayName ?? null,
          grade: this.inserted.grade,
          parentAccountId: this.inserted.parentAccountId ?? null,
        }
        state.profiles.push(row)
        return [{ id: row.id }]
      }
      throw new Error('Unhandled fake insert')
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.apply()).then(res, rej)
    }
  }

  class UpdateQuery {
    constructor(private table: unknown) {}
    updates: any
    values: string[] = []
    set(v: unknown) { this.updates = v; return this }
    where(cond: unknown) { this.values = condValues(cond); return this }
    apply() {
      if (this.table === schema.homeParentAccounts) {
        for (const a of state.accounts) {
          if (this.values.includes(a.id)) Object.assign(a, this.updates)
        }
        return []
      }
      if (this.table === schema.homeLeads) {
        const updated: Array<{ id: string }> = []
        for (const l of state.leads) {
          if (!this.values.includes(l.id)) continue
          // Race-guard маршруту: WHERE parent_account_id IS NULL.
          if (l.parentAccountId !== null) continue
          Object.assign(l, this.updates)
          updated.push({ id: l.id })
        }
        return updated
      }
      if (this.table === schema.homeChildProfiles) {
        for (const p of state.profiles) {
          if (this.values.includes(p.id) || (p.leadId && this.values.includes(p.leadId))) Object.assign(p, this.updates)
        }
        return []
      }
      throw new Error('Unhandled fake update')
    }
    returning() { return Promise.resolve(this.apply()) }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.apply()).then(res, rej)
    }
  }

  db.select = ((fields?: Record<string, unknown>) => new SelectQuery(fields)) as unknown as typeof db.select
  db.insert = ((t: unknown) => new InsertQuery(t)) as unknown as typeof db.insert
  db.update = ((t: unknown) => new UpdateQuery(t)) as unknown as typeof db.update
  db.transaction = (async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ select: db.select, insert: db.insert, update: db.update })) as unknown as typeof db.transaction

  return () => Object.assign(db, original)
}

// DI-верифікатор: токен → payload без мережі. 'verified' керує email_verified.
const TOKENS: Record<string, { sub: string; email: string; verified: boolean }> = {
  'mama-verified':    { sub: 'auth-mama', email: 'Mama@Example.com', verified: true },
  'mama-unverified':  { sub: 'auth-mama', email: 'Mama@Example.com', verified: false },
  'chuzhyi-verified': { sub: 'auth-chuzhyi', email: 'chuzhyi@example.com', verified: true },
}

async function buildApp(pathProgressStore?: PathProgressStore) {
  const app = Fastify()
  await app.register(parentRoutes, {
    prefix: '/api/parent',
    pathProgressStore,
    verifyToken: async (header: string | undefined) => {
      const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
      const known = TOKENS[token]
      if (!known) return null
      return { sub: known.sub, email: known.email, user_metadata: { email_verified: known.verified } }
    },
  })
  return app
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` }
}

function createPathProgressStore(): PathProgressStore & { rows: PathProgressView[]; events: Set<string> } {
  const rows: PathProgressView[] = []
  const events = new Set<string>()
  return {
    rows,
    events,
    async list(_childProfileId, pathId) {
      return pathId === 'grade-2' ? rows.map(row => ({ ...row })) : []
    },
    async save(input) {
      const existing = rows.find(row => row.pointId === input.pointId)
      if (events.has(input.eventKey)) {
        if (!existing) throw new Error('event without progress')
        return { progress: { ...existing }, duplicate: true }
      }
      events.add(input.eventKey)
      if (existing) {
        existing.bestStars = Math.max(existing.bestStars, input.sessionStars)
        existing.attempts += 1
        existing.updatedAt = new Date()
        return { progress: { ...existing }, duplicate: false }
      }
      const created: PathProgressView = {
        pointId: input.pointId,
        status: 'completed',
        bestStars: input.sessionStars,
        attempts: 1,
        updatedAt: new Date(),
      }
      rows.push(created)
      return { progress: { ...created }, duplicate: false }
    },
  }
}

function pathResult(activityId: string, completedAt = '2026-07-10T10:00:00.000Z') {
  return {
    activityId,
    activityVersion: 1,
    trust: 'client-unverified',
    stars: 2,
    correct: 4,
    total: 5,
    completedAt,
  }
}

test('без токена або з невідомим токеном → 401', async () => {
  const restore = installFakeDb(createState())
  const app = await buildApp()
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/parent/me' })).statusCode, 401)
    assert.equal((await app.inject({ method: 'GET', url: '/api/parent/me', headers: auth('fake') })).statusCode, 401)
  } finally { restore(); await app.close() }
})

test('me без акаунта → status none; register створює ідемпотентно', async () => {
  const restore = installFakeDb(createState())
  const app = await buildApp()
  try {
    const me1 = await app.inject({ method: 'GET', url: '/api/parent/me', headers: auth('mama-verified') })
    assert.deepEqual(me1.json(), { status: 'none' })

    const reg = await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    assert.equal(reg.statusCode, 201)
    assert.deepEqual(reg.json(), { status: 'active', email: 'mama@example.com', emailVerified: true })

    const reg2 = await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    assert.equal(reg2.statusCode, 200, 'повторна реєстрація — ідемпотентна')
  } finally { restore(); await app.close() }
})

test('claim: повний успішний шлях + ідемпотентний повтор + backfill профілю', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const app = await buildApp()
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    const claim = await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    assert.equal(claim.statusCode, 200)
    assert.deepEqual(claim.json(), { claimed: true, alreadyClaimed: false })
    assert.equal(state.leads[0].parentAccountId, ids.accountA)
    assert.ok(state.leads[0].claimedAt, 'claimed_at має бути заповнено')
    assert.equal(state.profiles[0].parentAccountId, ids.accountA, 'профіль ліда має бути привʼязаний')
    assert.equal(state.profiles[1].parentAccountId, null, 'чужий профіль не чіпаємо')

    const again = await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    assert.deepEqual(again.json(), { claimed: true, alreadyClaimed: true })
  } finally { restore(); await app.close() }
})

test('claim-відмови: невалідний UUID → 400; чужий email → 403; без verified email → 403; чужий лід → 409', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const app = await buildApp()
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })

    const badId = await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: 'not-a-uuid', leadToken: 'x' },
    })
    assert.equal(badId.statusCode, 400)

    // Акаунт із чужим email (лід B належить inshi@)
    const wrongEmail = await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadB, leadToken: generateLeadToken(ids.leadB) },
    })
    assert.equal(wrongEmail.statusCode, 403)
    assert.equal(state.leads[1].parentAccountId, null, 'лід B не має бути привʼязаний')

    // Той самий користувач, але без підтвердженого email — окремий акаунт-стан
    const unverifiedState = createState()
    restore()
    const restore2 = installFakeDb(unverifiedState)
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-unverified') })
    const unverified = await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-unverified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    assert.equal(unverified.statusCode, 403)
    assert.equal(unverifiedState.leads[0].parentAccountId, null)

    // Чужий уже привʼязаний лід → 409 fail-closed, без переносу
    unverifiedState.leads[0].parentAccountId = ids.accountB
    const mamaState = unverifiedState
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    const conflict = await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    assert.equal(conflict.statusCode, 409)
    assert.equal(mamaState.leads[0].parentAccountId, ids.accountB, 'власник не змінився')
    restore2()
  } finally { await app.close() }
})

test('профілі: створення, ліміт, оновлення і ownership-404', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const app = await buildApp()
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })

    const created = await app.inject({
      method: 'POST', url: '/api/parent/profiles', headers: auth('mama-verified'),
      payload: { displayName: '  Марійка   Друга ', grade: 2 },
    })
    assert.equal(created.statusCode, 201)
    assert.deepEqual(created.json(), { id: state.nextProfileId, displayName: 'Марійка Друга', grade: 2 })
    const stored = state.profiles.find(p => p.id === state.nextProfileId)!
    assert.equal(stored.parentAccountId, ids.accountA)
    assert.equal(stored.leadId, null)

    const badGrade = await app.inject({
      method: 'POST', url: '/api/parent/profiles', headers: auth('mama-verified'),
      payload: { grade: 7 },
    })
    assert.equal(badGrade.statusCode, 400)

    // Ліміт 6: додаємо ще 5 → сьомий створити не можна
    for (let i = 0; i < 5; i++) {
      state.nextProfileId = `00000000-0000-4000-8000-0000000000d${i}`
      await app.inject({ method: 'POST', url: '/api/parent/profiles', headers: auth('mama-verified'), payload: { grade: 1 } })
    }
    const overLimit = await app.inject({
      method: 'POST', url: '/api/parent/profiles', headers: auth('mama-verified'), payload: { grade: 1 },
    })
    assert.equal(overLimit.statusCode, 409)

    // PATCH власного
    const patched = await app.inject({
      method: 'PATCH', url: `/api/parent/profiles/${stored.id}`, headers: auth('mama-verified'),
      payload: { grade: 3 },
    })
    assert.equal(patched.statusCode, 200)
    assert.equal(patched.json().grade, 3)
    assert.equal(stored.grade, 3)

    // PATCH чужого (профіль B не привʼязаний до mama) → 404 без розкриття
    const foreign = await app.inject({
      method: 'PATCH', url: `/api/parent/profiles/${ids.profileB}`, headers: auth('mama-verified'),
      payload: { grade: 4 },
    })
    assert.equal(foreign.statusCode, 404)
    assert.equal(state.profiles.find(p => p.id === ids.profileB)!.grade, 3, 'чужий профіль не змінився')

    const badUuid = await app.inject({
      method: 'PATCH', url: '/api/parent/profiles/not-a-uuid', headers: auth('mama-verified'),
      payload: { grade: 4 },
    })
    assert.equal(badUuid.statusCode, 400)
  } finally { restore(); await app.close() }
})

test('звіти: власний профіль — обʼєднані demo+practice, чужий — 404', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const app = await buildApp()
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    state.demoReports.push({
      childProfileId: ids.profileA, missionId: 'demo-informatics-grade2', track: 'informatics',
      grade: 2, report: { correct: 4, total: 6 }, createdAt: new Date('2026-07-01T10:00:00Z'),
    })
    state.missionAttempts.push({
      childProfileId: ids.profileA, missionId: 'practice-ai-basics-grade2', track: 'ai-basics',
      grade: 2, report: { correct: 5, total: 6 }, createdAt: new Date('2026-07-05T10:00:00Z'),
    })

    const res = await app.inject({
      method: 'GET', url: `/api/parent/profiles/${ids.profileA}/reports`, headers: auth('mama-verified'),
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.reports.length, 2)
    assert.equal(body.reports[0].kind, 'practice', 'новіший звіт першим')
    assert.equal(body.reports[1].kind, 'demo')

    const foreign = await app.inject({
      method: 'GET', url: `/api/parent/profiles/${ids.profileB}/reports`, headers: auth('mama-verified'),
    })
    assert.equal(foreign.statusCode, 404, 'чужі звіти недоступні і не розкриваються')
  } finally { restore(); await app.close() }
})

test('entitlement акаунта: none без лідів; активний лід дає доступ', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const app = await buildApp()
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    const none = await app.inject({ method: 'GET', url: '/api/parent/entitlement', headers: auth('mama-verified') })
    assert.deepEqual(none.json(), { status: 'none', hasAccess: false, currentPeriodEnd: null })

    await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    state.entitlements.push({ leadId: ids.leadA, status: 'active', currentPeriodEnd: new Date(Date.now() + 86_400_000) })

    const active = await app.inject({ method: 'GET', url: '/api/parent/entitlement', headers: auth('mama-verified') })
    assert.equal(active.json().hasAccess, true)
    assert.equal(active.json().status, 'active')
  } finally { restore(); await app.close() }
})

test('ізоляція: /profiles повертає лише власні профілі', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const app = await buildApp()
  try {
    // Мама реєструється і клеймить свій лід A
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    // Чужий акаунт клеймить лід B
    state.nextAccountId = ids.accountB
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('chuzhyi-verified') })
    state.leads[1].parentEmail = 'chuzhyi@example.com'
    await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('chuzhyi-verified'),
      payload: { leadId: ids.leadB, leadToken: generateLeadToken(ids.leadB) },
    })

    const mine = await app.inject({ method: 'GET', url: '/api/parent/profiles', headers: auth('mama-verified') })
    assert.deepEqual(mine.json(), { profiles: [{ id: ids.profileA, displayName: 'Марійка', grade: 2 }] })

    const theirs = await app.inject({ method: 'GET', url: '/api/parent/profiles', headers: auth('chuzhyi-verified') })
    assert.deepEqual(theirs.json(), { profiles: [{ id: ids.profileB, displayName: 'Максим', grade: 3 }] })
  } finally { restore(); await app.close() }
})

test('path progress: completion is persisted, listed and idempotent', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const pathStore = createPathProgressStore()
  const app = await buildApp(pathStore)
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })
    const payload = {
      pathId: 'grade-2', pointId: 'g2-info-start',
      results: [pathResult('path:g2-info-start:infosort')],
    }

    const first = await app.inject({
      method: 'POST', url: `/api/parent/profiles/${ids.profileA}/path-progress`,
      headers: auth('mama-verified'), payload,
    })
    assert.equal(first.statusCode, 201)
    assert.equal(first.json().trust, 'client-unverified')
    assert.equal(first.json().attempts, 1)
    assert.equal(first.json().duplicate, false)

    const duplicate = await app.inject({
      method: 'POST', url: `/api/parent/profiles/${ids.profileA}/path-progress`,
      headers: auth('mama-verified'), payload,
    })
    assert.equal(duplicate.statusCode, 200)
    assert.equal(duplicate.json().duplicate, true)
    assert.equal(duplicate.json().attempts, 1, 'retry must not increment attempts')

    const listed = await app.inject({
      method: 'GET', url: `/api/parent/profiles/${ids.profileA}/path-progress?pathId=grade-2`,
      headers: auth('mama-verified'),
    })
    assert.equal(listed.statusCode, 200)
    assert.equal(listed.json().progress.length, 1)
    assert.equal(listed.json().progress[0].pointId, 'g2-info-start')
  } finally { restore(); await app.close() }
})

test('path progress: unknown versions and locked points fail without writes', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const pathStore = createPathProgressStore()
  const app = await buildApp(pathStore)
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    await app.inject({
      method: 'POST', url: '/api/parent/claim-lead', headers: auth('mama-verified'),
      payload: { leadId: ids.leadA, leadToken: generateLeadToken(ids.leadA) },
    })

    const stale = await app.inject({
      method: 'POST', url: `/api/parent/profiles/${ids.profileA}/path-progress`, headers: auth('mama-verified'),
      payload: {
        pathId: 'grade-2', pointId: 'g2-info-start',
        results: [{ ...pathResult('path:g2-info-start:infosort'), activityVersion: 2 }],
      },
    })
    assert.equal(stale.statusCode, 400)

    const locked = await app.inject({
      method: 'POST', url: `/api/parent/profiles/${ids.profileA}/path-progress`, headers: auth('mama-verified'),
      payload: {
        pathId: 'grade-2', pointId: 'g2-ct-multisort',
        results: [pathResult('path:g2-ct-multisort:multisort')],
      },
    })
    assert.equal(locked.statusCode, 409)
    assert.equal(pathStore.rows.length, 0)
    assert.equal(pathStore.events.size, 0)
  } finally { restore(); await app.close() }
})

test('path progress: a valid foreign profile UUID returns 404', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const pathStore = createPathProgressStore()
  const app = await buildApp(pathStore)
  try {
    await app.inject({ method: 'POST', url: '/api/parent/register', headers: auth('mama-verified') })
    const response = await app.inject({
      method: 'GET', url: `/api/parent/profiles/${ids.profileB}/path-progress?pathId=grade-2`,
      headers: auth('mama-verified'),
    })
    assert.equal(response.statusCode, 404)
    assert.equal(pathStore.rows.length, 0)
  } finally { restore(); await app.close() }
})
