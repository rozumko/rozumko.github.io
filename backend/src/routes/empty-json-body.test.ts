import assert from 'node:assert/strict'
import test from 'node:test'

// Why this exists: a bodiless DELETE that still declares Content-Type: application/json
// is rejected by Fastify with FST_ERR_CTP_EMPTY_JSON_BODY, and server.ts deliberately
// masks every FST_ERR as a bare "Невірний запит". The admin UI hit exactly this and the
// failure was invisible from both sides — no detail to the browser, no server log.
//
// The fix lives in the frontend client (it no longer sends the header without a body).
// This test pins the server behaviour that made the fix necessary, so the next person
// who sees an unexplained 400 finds the cause here instead of re-deriving it.
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

const ID = '10efe71c-e9b8-4768-95fb-d7b512345678'

test('bodiless DELETE reaches auth when it does not claim to send JSON', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'DELETE', url: `/api/admin/questions/${ID}` })
  // 401, not 400: the request is well-formed and only fails on authorization.
  assert.equal(res.statusCode, 401)
  await app.close()
})

test('an empty body that claims application/json is refused before auth', async () => {
  const app = await buildApp()
  const res = await app.inject({
    method: 'DELETE',
    url: `/api/admin/questions/${ID}`,
    headers: { 'content-type': 'application/json' },
  })
  assert.equal(res.statusCode, 400)
  assert.equal(JSON.parse(res.body).code, 'FST_ERR_CTP_EMPTY_JSON_BODY')
  await app.close()
})
