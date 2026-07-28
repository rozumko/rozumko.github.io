import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageInfo, pageRange } from './pagination.js'

test('page range falls back to the default and never exceeds the cap', () => {
  assert.deepEqual(pageRange({}), { limit: DEFAULT_PAGE_SIZE, offset: 0 })
  assert.deepEqual(pageRange({ limit: 20, offset: 40 }), { limit: 20, offset: 40 })
  assert.equal(pageRange({ limit: 10_000 }).limit, MAX_PAGE_SIZE)
  assert.equal(pageRange({ limit: 0 }).limit, 1)
  assert.equal(pageRange({ offset: -5 }).offset, 0)
  assert.equal(pageRange({ limit: 12.5 as number }).limit, DEFAULT_PAGE_SIZE)
  assert.deepEqual(pageInfo({ limit: 50, offset: 0 }, 310), { total: 310, limit: 50, offset: 0 })
})

// The cap is what keeps a bank of thousands of rows off the wire, so the schema
// must reject an oversized page instead of silently trimming it.
test('admin list routes validate limit and offset before auth', async () => {
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  const [{ default: Fastify }, { adminRoutes }] = await Promise.all([
    import('fastify'),
    import('../routes/admin.js'),
  ])
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })

  const paginated = ['/api/admin/questions', '/api/admin/results', '/api/admin/teachers', '/api/admin/parents', '/api/admin/events']
  for (const url of paginated) {
    const accepted = await app.inject({ method: 'GET', url: `${url}?limit=50&offset=100` })
    assert.equal(accepted.statusCode, 401, `${url}: valid page must reach auth`)
    for (const bad of ['limit=201', 'limit=0', 'limit=abc', 'offset=-1']) {
      const rejected = await app.inject({ method: 'GET', url: `${url}?${bad}` })
      assert.equal(rejected.statusCode, 400, `${url}?${bad} must be rejected by schema`)
    }
  }
  await app.close()
})

// Regression: the question bank once answered with every row it had. A list
// route that forgets its range brings the admin browser down again.
test('admin list handlers actually apply the range they accepted', () => {
  const admin = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8')
  const parents = readFileSync(new URL('../routes/admin-parents.ts', import.meta.url), 'utf8')

  for (const route of ["'/questions'", "'/results'", "'/teachers'", "'/events'", "'/parents'"]) {
    const start = admin.indexOf(`>(${route}, {`)
    assert.notEqual(start, -1, `${route} must be a schema-carrying route`)
    const handler = admin.slice(start, start + 2000)
    assert.match(handler, /pageRange\(req\.query\)/, `${route} must read the requested page`)
  }
  for (const source of [admin, parents]) {
    assert.match(source, /\.limit\(range\.limit\)\s*\r?\n\s*\.offset\(range\.offset\)/)
  }
  assert.match(parents, /\.limit\(range\.limit\)/)
})
