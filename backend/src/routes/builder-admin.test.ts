import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type FastifyRequest, type InjectOptions } from 'fastify'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { builderAdminRoutes } = await import('./builder-admin.js')
const { db } = await import('../db/index.js')

const OWNER = '00000000-0000-4000-8000-00000000000a'
const BOARD = '00000000-0000-4000-8000-00000000000b'
const MATERIAL = '00000000-0000-4000-8000-00000000000c'
const dialect = new PgDialect()

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>, authenticated = false) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(builderAdminRoutes, {
    prefix: '/api/admin/builder',
    ...(authenticated ? { authenticate: async (req: FastifyRequest) => { req.user = { id: OWNER, authUserId: 'auth', role: 'admin', name: 'Адмін', email: 'a@example.test' } } } : {}),
  })
  await app.ready()
  try { await run(app) } finally {
    await app.close()
    if (previous === undefined) delete process.env.LESSON_ENGINE_ENABLED
    else process.env.LESSON_ENGINE_ENABLED = previous
  }
}

const TEXT = [{ type: 'paragraph', text: { uk: 'Як працює інтернет' } }]
const ROUTES: InjectOptions[] = [
  { method: 'GET', url: '/api/admin/builder/boards' },
  { method: 'POST', url: '/api/admin/builder/boards', payload: { title: 'Інтернет' } },
  { method: 'PATCH', url: `/api/admin/builder/boards/${BOARD}`, payload: { title: 'Космос' } },
  { method: 'DELETE', url: `/api/admin/builder/boards/${BOARD}` },
  { method: 'GET', url: `/api/admin/builder/boards/${BOARD}/materials` },
  { method: 'GET', url: '/api/admin/builder/materials?q=супутник' },
  { method: 'POST', url: `/api/admin/builder/boards/${BOARD}/materials`, payload: { title: 'Текст', items: TEXT, x: 0, y: 0 } },
  { method: 'PATCH', url: `/api/admin/builder/materials/${MATERIAL}`, payload: { x: 10 } },
  { method: 'PUT', url: `/api/admin/builder/boards/${BOARD}/positions`, payload: { positions: [{ id: MATERIAL, x: 1, y: 2 }] } },
  { method: 'POST', url: '/api/admin/builder/materials/delete', payload: { ids: [MATERIAL] } },
]

test('with the Lesson Engine flag off every builder route is a 404', async () => {
  await withApp(undefined, async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 404, `${route.method} ${route.url}`)
  })
})

test('without an admin session every builder route is refused', async () => {
  await withApp('true', async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 401, `${route.method} ${route.url}`)
  })
})

test('malformed IDs, coordinates and bodies are rejected before auth or any database access', async () => {
  await withApp('true', async app => {
    for (const route of [
      { method: 'GET', url: '/api/admin/builder/boards/not-a-uuid/materials' },
      { method: 'PATCH', url: `/api/admin/builder/boards/${BOARD}`, payload: { title: 'x'.repeat(121) } },
      { method: 'POST', url: '/api/admin/builder/boards', payload: {} },
      { method: 'POST', url: `/api/admin/builder/boards/${BOARD}/materials`, payload: { title: 'Текст', items: TEXT, x: 100001, y: 0 } },
      { method: 'POST', url: `/api/admin/builder/boards/${BOARD}/materials`, payload: { title: 'Текст', items: TEXT, x: 1.5, y: 0 } },
      { method: 'PATCH', url: `/api/admin/builder/materials/${MATERIAL}`, payload: {} },
      { method: 'PATCH', url: `/api/admin/builder/materials/${MATERIAL}`, payload: { boardId: 'other' } },
      { method: 'PUT', url: `/api/admin/builder/boards/${BOARD}/positions`, payload: { positions: [{ id: 'x', x: 1, y: 2 }] } },
      { method: 'POST', url: '/api/admin/builder/materials/delete', payload: { ids: [MATERIAL, MATERIAL] } },
      { method: 'GET', url: '/api/admin/builder/materials?q=a' },
    ] as InjectOptions[]) {
      assert.equal((await app.inject(route)).statusCode, 400, `${route.method} ${route.url} ${JSON.stringify(route.payload)}`)
    }
  })
})

/** A fake query builder that records every WHERE clause as SQL text and parameters. */
function recordQueries(rows: (table: unknown) => unknown[]) {
  const clauses: { sql: string; params: unknown[] }[] = []
  const chain = (table?: unknown) => {
    const query: Record<string, unknown> = {
      from(t: unknown) { table = t; return query },
      innerJoin() { return query }, orderBy() { return query }, limit() { return query },
      set() { return query }, values() { return query }, returning() { return query },
      where(condition: SQL) { clauses.push(dialect.sqlToQuery(condition)); return query },
      then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(rows(table)).then(resolve) },
    }
    return query
  }
  const mocks = [
    mock.method(db, 'select', () => chain()),
    mock.method(db, 'update', (table: unknown) => chain(table)),
    mock.method(db, 'delete', (table: unknown) => chain(table)),
    mock.method(db, 'insert', () => { throw new Error('unexpected insert') }),
  ]
  return { clauses, restore: () => mocks.forEach(m => m.mock.restore()) }
}

test('a board of another owner is indistinguishable from a missing one', async () => {
  const recorded = recordQueries(() => [])
  try {
    await withApp('true', async app => {
      const response = await app.inject({ method: 'GET', url: `/api/admin/builder/boards/${BOARD}/materials` })
      assert.equal(response.statusCode, 404)
      const denied = await app.inject({ method: 'POST', url: `/api/admin/builder/boards/${BOARD}/materials`, payload: { title: 'Текст', items: TEXT, x: 0, y: 0 } })
      assert.equal(denied.statusCode, 404)
    }, true)
    assert.ok(recorded.clauses.length >= 2)
    for (const clause of recorded.clauses) assert.ok(clause.params.includes(OWNER), clause.sql)
  } finally { recorded.restore() }
})

test('invalid material content is refused before the board is even looked up', async () => {
  const recorded = recordQueries(() => [])
  try {
    await withApp('true', async app => {
      const response = await app.inject({
        method: 'POST', url: `/api/admin/builder/boards/${BOARD}/materials`,
        payload: { title: 'Текст', items: [{ type: 'paragraph', text: { uk: '<img src=x onerror=alert(1)>' } }], x: 0, y: 0 },
      })
      assert.equal(response.statusCode, 400)
      assert.ok(response.json().issues.length > 0)
    }, true)
    assert.equal(recorded.clauses.length, 0)
  } finally { recorded.restore() }
})

test('search is owner-scoped and treats % and _ as literal characters', async () => {
  const recorded = recordQueries(() => [])
  try {
    await withApp('true', async app => {
      const response = await app.inject({ method: 'GET', url: `/api/admin/builder/materials?q=${encodeURIComponent('50%_Супутник')}` })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { materials: [] })
    }, true)
    const [clause] = recorded.clauses
    assert.ok(clause!.params.includes(OWNER))
    assert.ok(clause!.params.includes('%50\\%\\_супутник%'), JSON.stringify(clause!.params))
  } finally { recorded.restore() }
})

test('deleting materials is scoped to the owner', async () => {
  const recorded = recordQueries(() => [])
  try {
    await withApp('true', async app => {
      const response = await app.inject({ method: 'POST', url: '/api/admin/builder/materials/delete', payload: { ids: [MATERIAL] } })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { deleted: [] })
    }, true)
    assert.ok(recorded.clauses[0]!.params.includes(OWNER))
    assert.ok(recorded.clauses[0]!.params.includes(MATERIAL))
  } finally { recorded.restore() }
})
