import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// The bulk routes exist to replace a per-question modal loop, so the risk is that
// they become a way around the guards the single-question routes enforce. These
// tests pin both halves: the schema fails closed, and the handler still refuses
// what the single route refuses.
async function buildApp() {
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  const [{ default: Fastify }, { adminRoutes }] = await Promise.all([
    import('fastify'),
    import('./admin.js'),
  ])
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })
  return app
}

const ids = ['10efe71c-e9b8-4768-95fb-d7b512345678', '20efe71c-e9b8-4768-95fb-d7b512345679']

// Schema runs before preHandler: a well-formed payload reaches auth (401),
// a malformed one is rejected outright (400).
test('bulk status schema fails closed on the status value and the id list', async () => {
  const app = await buildApp()
  const post = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/api/admin/questions/status', payload: payload as object })

  assert.equal((await post({ ids, status: 'published' })).statusCode, 401)
  assert.equal((await post({ ids, status: 'active' })).statusCode, 400, 'невідомий статус')
  assert.equal((await post({ ids: [], status: 'published' })).statusCode, 400, 'порожній список')
  assert.equal((await post({ ids: ['not-a-uuid'], status: 'published' })).statusCode, 400, 'не UUID')
  assert.equal((await post({ ids: [ids[0], ids[0]], status: 'published' })).statusCode, 400, 'дублікати')
  // additionalProperties: false strips unknown fields rather than rejecting them
  // (Fastify runs ajv with removeAdditional), so the request still reaches auth —
  // and the handler only ever reads ids and status.
  assert.equal((await post({ ids, status: 'published', extra: 1 })).statusCode, 401, 'зайве поле вирізається')
  await app.close()
})

test('bulk delete schema fails closed on the id list', async () => {
  const app = await buildApp()
  const post = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/api/admin/questions/delete', payload: payload as object })

  assert.equal((await post({ ids })).statusCode, 401)
  assert.equal((await post({ ids: [] })).statusCode, 400, 'порожній список')
  assert.equal((await post({ ids: ['nope'] })).statusCode, 400, 'не UUID')
  assert.equal((await post({ ids, status: 'published' })).statusCode, 401, 'зайве поле вирізається')
  await app.close()
})

test('bulk routes are admin-only and capped like the channel route', async () => {
  const app = await buildApp()
  // 201 ids is over the cap the channel route already sets.
  const tooMany = Array.from({ length: 201 }, (_, i) =>
    `1111111a-2222-4333-8444-${String(i).padStart(12, '0')}`)
  for (const url of ['/api/admin/questions/status', '/api/admin/questions/delete']) {
    const payload = url.endsWith('/status') ? { ids: tooMany, status: 'published' } : { ids: tooMany }
    assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 400, url)
  }
  await app.close()
})

// Guard parity is what keeps the bulk path honest; assert it against the source
// so a future edit that drops a check from one side is visible here.
test('bulk status repeats every guard the single-question route applies', () => {
  const source = readFileSync(new URL('./admin.ts', import.meta.url), 'utf8')
  const bulk = source.slice(source.indexOf("'/questions/status'"))
  for (const guard of [
    /publishedAt && !\['published', 'archived'\]\.includes\(status\)/,
    /questionReadinessIssues\(row\)/,
    /questionIsLocked\(row\.id\) \|\| await questionHasEventReference\(row\.id\)/,
    /eq\(questions\.editVersion, row\.editVersion\)/,   // optimistic lock
    /action: 'status'/,                                  // audit trail
  ]) {
    assert.match(bulk, guard)
  }
})

test('bulk delete stays limited to drafts that nothing references', () => {
  const source = readFileSync(new URL('./admin.ts', import.meta.url), 'utf8')
  const bulk = source.slice(source.indexOf("'/questions/delete'"))
  assert.match(bulk, /row\.status !== 'draft'/)
  assert.match(bulk, /questionIsLocked\(row\.id\)/)
  assert.match(bulk, /'23503'/)  // FK violation surfaces as a skip, not a 500
})
