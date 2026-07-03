import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Fastify from 'fastify'

process.env.ATTEMPT_SECRET = 'test-secret-for-payment-webhook'
process.env.SUPABASE_URL = 'https://test.supabase.co'

const [{ homePaymentWebhookRoutes, createPaymentWebhookSignature }, { db }, schema] = await Promise.all([
  import('./home-payment-webhook.js'),
  import('../db/index.js'),
  import('../db/schema.js'),
])

const ids = {
  lead: '00000000-0000-4000-8000-0000000000d1',
  entitlement: '00000000-0000-4000-8000-0000000000d2',
  paymentEvent: '00000000-0000-4000-8000-0000000000d3',
}

const FUTURE = '2026-08-01T00:00:00.000Z'
const SECRET = 'payment-webhook-secret'

type PaymentBody = {
  provider: string
  eventId: string
  leadId: string
  eventType: 'subscription.active' | 'subscription.past_due' | 'subscription.canceled' | 'subscription.expired' | 'subscription.revoked'
  currentPeriodEnd?: string | null
  providerRef?: string | null
}

function validBody(overrides: Partial<PaymentBody> = {}): PaymentBody {
  return {
    provider: 'test-provider',
    eventId: 'evt_1',
    leadId: ids.lead,
    eventType: 'subscription.active',
    currentPeriodEnd: FUTURE,
    providerRef: 'sub_1',
    ...overrides,
  }
}

function createState() {
  return {
    lead: { id: ids.lead } as null | { id: string },
    entitlement: null as null | { id: string; leadId: string; status: string; currentPeriodEnd: Date | null; providerRef: string | null },
    entitlementEvents: [] as Array<{ entitlementId: string; actor: string; fromStatus: string | null; toStatus: string; reason: string | null }>,
    paymentEvents: [] as Array<{ provider: string; providerEventId: string; leadId: string; eventType: string; providerRef: string | null; payload: unknown }>,
  }
}

function installFakeDb(state: ReturnType<typeof createState>) {
  const original = { select: db.select, insert: db.insert, update: db.update, transaction: db.transaction }
  const isTable = (a: unknown, b: unknown) => a === b

  class SelectQuery {
    table: unknown
    from(t: unknown) { this.table = t; return this }
    where() { return this }
    limit() { return this }
    rows() {
      if (isTable(this.table, schema.homeLeads)) return state.lead ? [state.lead] : []
      if (isTable(this.table, schema.homeEntitlements)) return state.entitlement ? [state.entitlement] : []
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
      if (isTable(this.table, schema.homePaymentEvents)) {
        const duplicate = state.paymentEvents.some(e =>
          e.provider === this.inserted.provider && e.providerEventId === this.inserted.providerEventId
        )
        if (duplicate) return []
        state.paymentEvents.push(this.inserted)
        return [{ id: ids.paymentEvent }]
      }
      if (isTable(this.table, schema.homeEntitlements)) {
        state.entitlement = {
          id: ids.entitlement,
          leadId: this.inserted.leadId,
          status: this.inserted.status,
          currentPeriodEnd: this.inserted.currentPeriodEnd,
          providerRef: this.inserted.providerRef,
        }
        return [{ id: ids.entitlement }]
      }
      if (isTable(this.table, schema.homeEntitlementEvents)) {
        state.entitlementEvents.push(this.inserted)
        return [{ id: 'audit-event-1' }]
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
        const updated = { ...state.entitlement, ...this.patch }
        state.entitlement = updated
        return [{ id: updated.id }]
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
      entitlementEvents: state.entitlementEvents.map(e => ({ ...e })),
      paymentEvents: state.paymentEvents.map(e => ({ ...e })),
    }
    try {
      return await fn(db)
    } catch (err) {
      state.entitlement = snapshot.entitlement
      state.entitlementEvents = snapshot.entitlementEvents
      state.paymentEvents = snapshot.paymentEvents
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

async function withPaymentApp(fn: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify()
  await app.register(homePaymentWebhookRoutes, { prefix: '/api/home' })
  await app.ready()
  try { await fn(app) } finally { await app.close() }
}

function signedHeaders(body: PaymentBody) {
  return { 'X-Rozumko-Payment-Signature': createPaymentWebhookSignature(body, SECRET) }
}

test('payment webhook: без секрету fail-closed і не пише entitlement', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  const oldSecret = process.env.HOME_PAYMENT_WEBHOOK_SECRET
  delete process.env.HOME_PAYMENT_WEBHOOK_SECRET
  try {
    await withPaymentApp(async (app) => {
      const res = await app.inject({ method: 'POST', url: '/api/home/payment/webhook', payload: validBody() })
      assert.equal(res.statusCode, 503)
      assert.equal(state.paymentEvents.length, 0)
      assert.equal(state.entitlement, null)
      assert.equal(state.entitlementEvents.length, 0)
    })
  } finally {
    if (oldSecret !== undefined) process.env.HOME_PAYMENT_WEBHOOK_SECRET = oldSecret
    restore()
  }
})

test('payment webhook: неправильний підпис блокує зміну доступу', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  process.env.HOME_PAYMENT_WEBHOOK_SECRET = SECRET
  try {
    await withPaymentApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: { 'X-Rozumko-Payment-Signature': 'sha256=' + '0'.repeat(64) },
        payload: validBody(),
      })
      assert.equal(res.statusCode, 401)
      assert.equal(state.paymentEvents.length, 0)
      assert.equal(state.entitlement, null)
      assert.equal(state.entitlementEvents.length, 0)
    })
  } finally { restore() }
})

test('payment webhook: невідомий leadId не створює платіжну подію і entitlement', async () => {
  const state = createState()
  state.lead = null
  const restore = installFakeDb(state)
  process.env.HOME_PAYMENT_WEBHOOK_SECRET = SECRET
  const body = validBody()
  try {
    await withPaymentApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: signedHeaders(body),
        payload: body,
      })
      assert.equal(res.statusCode, 404)
      assert.equal(state.paymentEvents.length, 0)
      assert.equal(state.entitlement, null)
    })
  } finally { restore() }
})

test('payment webhook: active без currentPeriodEnd відкочується повністю', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  process.env.HOME_PAYMENT_WEBHOOK_SECRET = SECRET
  const body = validBody({ eventId: 'evt_missing_period', currentPeriodEnd: null })
  try {
    await withPaymentApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: signedHeaders(body),
        payload: body,
      })
      assert.equal(res.statusCode, 400)
      assert.equal(state.paymentEvents.length, 0)
      assert.equal(state.entitlement, null)
      assert.equal(state.entitlementEvents.length, 0)
    })
  } finally { restore() }
})

test('payment webhook: валідна подія змінює entitlement через provider audit', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  process.env.HOME_PAYMENT_WEBHOOK_SECRET = SECRET
  const body = validBody({ eventId: 'evt_paid', providerRef: 'sub_paid' })
  try {
    await withPaymentApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: signedHeaders(body),
        payload: body,
      })
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json().duplicate, false)
      assert.equal(state.paymentEvents.length, 1)
      assert.equal(state.entitlement?.status, 'active')
      assert.equal(state.entitlement?.providerRef, 'sub_paid')
      assert.equal(state.entitlementEvents.length, 1)
      assert.equal(state.entitlementEvents[0].actor, 'provider')
      assert.equal(state.entitlementEvents[0].toStatus, 'active')
      assert.equal(state.entitlementEvents[0].reason, 'payment:test-provider:evt_paid')
    })
  } finally { restore() }
})

test('payment webhook: duplicate provider event is idempotent', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  process.env.HOME_PAYMENT_WEBHOOK_SECRET = SECRET
  const body = validBody({ eventId: 'evt_duplicate' })
  try {
    await withPaymentApp(async (app) => {
      const first = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: signedHeaders(body),
        payload: body,
      })
      const second = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: signedHeaders(body),
        payload: body,
      })
      assert.equal(first.statusCode, 200, first.body)
      assert.equal(second.statusCode, 200, second.body)
      assert.equal(second.json().duplicate, true)
      assert.equal(state.paymentEvents.length, 1)
      assert.equal(state.entitlementEvents.length, 1)
    })
  } finally { restore() }
})

test('payment webhook: \\n у підписаних полях відхиляється (без field-boundary replay)', async () => {
  const state = createState()
  const restore = installFakeDb(state)
  process.env.HOME_PAYMENT_WEBHOOK_SECRET = SECRET
  // Легітимно підписане тіло з provider="a\nb": канонічний рядок збігається з
  // тілом provider="a", eventId="b\n<...>" — інша пара (provider, eventId)
  // обійшла б UNIQUE-ідемпотентність тим самим підписом. Схема мусить
  // відхилити пробільні символи в підписаних полях ДО перевірки підпису.
  const smuggled = validBody({ provider: 'a\nb', eventId: 'evt_smuggle' })
  try {
    await withPaymentApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/payment/webhook',
        headers: signedHeaders(smuggled),
        payload: smuggled,
      })
      assert.equal(res.statusCode, 400, res.body)
      assert.equal(state.paymentEvents.length, 0)
      assert.equal(state.entitlement, null)
    })
  } finally { restore() }
})

test('payment webhook-модуль не торкається скорингу, питань і ключів відповідей', () => {
  const src = readFileSync(new URL('./home-payment-webhook.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /scoreAttempt|questions|correct|answer/i)
})
