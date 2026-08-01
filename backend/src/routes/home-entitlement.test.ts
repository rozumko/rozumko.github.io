import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Fastify from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-entitlement'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [entitlement, { homeRoutes }, { adminRoutes }, { db }, schema, { generateLeadToken }] = await Promise.all([
  import('./home-entitlement.js'),
  import('./home.js'),
  import('./admin.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
  import('./home-validation.js'),
])
const { hasHomeAccess, normalizeEntitlementStatus, applyEntitlementChange, PAST_DUE_GRACE_MS } = entitlement

const ids = {
  lead:        '00000000-0000-4000-8000-0000000000c1',
  entitlement: '00000000-0000-4000-8000-0000000000c2',
}

const NOW = new Date('2026-07-02T12:00:00Z')
const PAST = new Date('2026-06-01T00:00:00Z')
// Route tests read the real clock, so this has to stay ahead of it, not of a fixed date.
const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

// ── Unit: рішення про доступ (єдина точка, fail closed) ──────

test('hasHomeAccess: active/canceled — до кінця періоду, потім ні', () => {
  assert.equal(hasHomeAccess('active', FUTURE, NOW), true)
  assert.equal(hasHomeAccess('active', PAST, NOW), false)
  assert.equal(hasHomeAccess('canceled', FUTURE, NOW), true)
  assert.equal(hasHomeAccess('canceled', PAST, NOW), false)
})

test('hasHomeAccess: past_due — grace-період понад кінець періоду', () => {
  const justEnded = new Date(NOW.getTime() - 1000)
  assert.equal(hasHomeAccess('past_due', justEnded, NOW), true) // у межах grace
  const beyondGrace = new Date(NOW.getTime() - PAST_DUE_GRACE_MS - 1000)
  assert.equal(hasHomeAccess('past_due', beyondGrace, NOW), false)
})

test('hasHomeAccess: expired і revoked блокують навіть із майбутнім періодом', () => {
  assert.equal(hasHomeAccess('expired', FUTURE, NOW), false)
  assert.equal(hasHomeAccess('revoked', FUTURE, NOW), false)
})

test('hasHomeAccess: без дати кінця періоду — fail closed для всіх статусів', () => {
  for (const status of ['active', 'past_due', 'canceled', 'expired', 'revoked'] as const) {
    assert.equal(hasHomeAccess(status, null, NOW), false, status)
  }
})

test('normalizeEntitlementStatus: allowlist із пʼяти станів', () => {
  for (const s of ['active', 'past_due', 'canceled', 'expired', 'revoked']) {
    assert.equal(normalizeEntitlementStatus(s), s)
  }
  assert.throws(() => normalizeEntitlementStatus('gold'))
  assert.throws(() => normalizeEntitlementStatus(null))
})

// ── Unit: applyEntitlementChange (upsert + audit) ─────────────

function createState() {
  return {
    lead: { id: ids.lead, parentEmail: 'parent@example.com' } as null | { id: string; parentEmail: string },
    entitlement: null as null | { id: string; leadId: string; status: string; currentPeriodEnd: Date | null },
    events: [] as Array<{ entitlementId: string; actor: string; fromStatus: string | null; toStatus: string; reason: string | null }>,
    failEventInsert: false,
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = { select: db.select, insert: db.insert, update: db.update, transaction: db.transaction }
  const isTable = (a: unknown, b: unknown) => a === b

  class SelectQuery {
    table: unknown
    from(t: unknown) { this.table = t; return this }
    where() { return this }
    orderBy() { return this }
    limit() { return this }
    rows() {
      if (isTable(this.table, schema.homeLeads)) return state.lead ? [state.lead] : []
      if (isTable(this.table, schema.homeEntitlements)) return state.entitlement ? [state.entitlement] : []
      if (isTable(this.table, schema.homeEntitlementEvents)) return state.events
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
      if (isTable(this.table, schema.homeEntitlements)) {
        state.entitlement = { id: ids.entitlement, leadId: this.inserted.leadId, status: this.inserted.status, currentPeriodEnd: this.inserted.currentPeriodEnd }
        return [{ id: ids.entitlement }]
      }
      if (isTable(this.table, schema.homeEntitlementEvents)) {
        if (state.failEventInsert) throw new Error('audit insert failed')
        state.events.push(this.inserted)
        return [{ id: 'event-1' }]
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
    set(p: unknown) { this.patch = p; return this }
    where() { return this }
    returning() {
      if (isTable(this.table, schema.homeEntitlements) && state.entitlement) {
        state.entitlement = { ...state.entitlement, status: this.patch.status, currentPeriodEnd: this.patch.currentPeriodEnd }
        return [{ id: state.entitlement.id }]
      }
      return []
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
      return Promise.resolve(this.returning()).then(res, rej)
    }
  }

  db.select = (() => new SelectQuery()) as unknown as typeof db.select
  db.insert = ((t: unknown) => new InsertQuery(t)) as unknown as typeof db.insert
  db.update = ((t: unknown) => new UpdateQuery(t)) as unknown as typeof db.update
  db.transaction = (async (fn: (tx: typeof db) => unknown) => {
    const snapshot = {
      entitlement: state.entitlement ? { ...state.entitlement } : null,
      events: state.events.map(e => ({ ...e })),
    }
    try {
      return await fn(db)
    } catch (err) {
      state.entitlement = snapshot.entitlement
      state.events = snapshot.events
      throw err
    }
  }) as unknown as typeof db.transaction

  return () => {
    db.select = original.select
    db.insert = original.insert
    db.update = original.update
    db.transaction = original.transaction
  }
}

test('applyEntitlementChange: створює entitlement + audit-подію', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    const result = await applyEntitlementChange(db, ids.lead, { status: 'active', currentPeriodEnd: FUTURE, reason: 'manual grant' }, 'admin')
    assert.equal(result.status, 'active')
    assert.equal(state.entitlement?.status, 'active')
    assert.equal(state.events.length, 1)
    assert.equal(state.events[0].fromStatus, null)
    assert.equal(state.events[0].toStatus, 'active')
    assert.equal(state.events[0].actor, 'admin')
  } finally { restore() }
})

test('applyEntitlementChange: оновлює наявний і фіксує перехід у журналі', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await applyEntitlementChange(db, ids.lead, { status: 'revoked', currentPeriodEnd: null, reason: 'chargeback' }, 'admin')
    assert.equal(state.entitlement?.status, 'revoked')
    assert.equal(state.events[0].fromStatus, 'active')
    assert.equal(state.events[0].toStatus, 'revoked')
    assert.equal(state.events[0].reason, 'chargeback')
  } finally { restore() }
})

test('applyEntitlementChange: audit insert failure rolls back entitlement change', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  state.failEventInsert = true
  const restore = installFakeDb(state)
  try {
    await assert.rejects(
      () => applyEntitlementChange(db, ids.lead, { status: 'revoked', currentPeriodEnd: null, reason: 'audit failure probe' }, 'admin'),
      /audit insert failed/,
    )
    assert.equal(state.entitlement?.status, 'active')
    assert.equal(state.events.length, 0)
  } finally { restore() }
})

test('applyEntitlementChange: active/past_due/canceled без дати періоду — помилка, нічого не пишеться', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    for (const status of ['active', 'past_due', 'canceled'] as const) {
      await assert.rejects(() => applyEntitlementChange(db, ids.lead, { status, currentPeriodEnd: null, reason: null }, 'admin'))
    }
    assert.equal(state.entitlement, null)
    assert.equal(state.events.length, 0)
  } finally { restore() }
})

// ── Flow: GET /api/home/leads/:id/entitlement ────────────────

async function withHomeApp(fn: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify()
  await app.register(homeRoutes, { prefix: '/api/home' })
  await app.ready()
  try { await fn(app) } finally { await app.close() }
}

test('entitlement: без валідного токена — 403', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withHomeApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/entitlement`
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 403)
      assert.equal((await app.inject({ method: 'GET', url, headers: { 'X-Lead-Token': 'deadbeef' } })).statusCode, 403)
    })
  } finally { restore() }
})

test('entitlement: без підписки — status none, hasAccess false', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  try {
    await withHomeApp(async (app) => {
      const res = await app.inject({
        method: 'GET', url: `/api/home/leads/${ids.lead}/entitlement`,
        headers: { 'X-Lead-Token': generateLeadToken(ids.lead) },
      })
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(res.json(), { status: 'none', hasAccess: false, currentPeriodEnd: null })
    })
  } finally { restore() }
})

test('entitlement: active з майбутнім періодом — доступ є; revoked — ні', async () => {
  const state = createState()
  state.entitlement = { id: ids.entitlement, leadId: ids.lead, status: 'active', currentPeriodEnd: FUTURE }
  const restore = installFakeDb(state)
  try {
    await withHomeApp(async (app) => {
      const url = `/api/home/leads/${ids.lead}/entitlement`
      const headers = { 'X-Lead-Token': generateLeadToken(ids.lead) }
      const active = await app.inject({ method: 'GET', url, headers })
      assert.equal(active.json().hasAccess, true)

      state.entitlement!.status = 'revoked'
      const revoked = await app.inject({ method: 'GET', url, headers })
      assert.equal(revoked.json().hasAccess, false)

      state.entitlement!.status = 'expired'
      const expired = await app.inject({ method: 'GET', url, headers })
      assert.equal(expired.json().hasAccess, false)
    })
  } finally { restore() }
})

// ── Flow: адмінські роути (валідація до auth, auth до БД) ────

test('entitlement admin: невалідний UUID — 400, без Authorization — 401', async () => {
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })
  await app.ready()
  try {
    const badUuid = await app.inject({
      method: 'PUT', url: '/api/admin/home-entitlements/not-a-uuid',
      payload: { status: 'active', currentPeriodEnd: FUTURE.toISOString() },
    })
    assert.equal(badUuid.statusCode, 400)

    const noAuth = await app.inject({
      method: 'PUT', url: `/api/admin/home-entitlements/${ids.lead}`,
      payload: { status: 'active', currentPeriodEnd: FUTURE.toISOString() },
    })
    assert.equal(noAuth.statusCode, 401)
  } finally { await app.close() }
})

// ── Інваріант: entitlement не змішується зі скорингом ─────────

test('entitlement-модуль не торкається скорингу і ключів відповідей', () => {
  const src = readFileSync(new URL('./home-entitlement.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /scoreAttempt|correct|answer|questions/)
})
