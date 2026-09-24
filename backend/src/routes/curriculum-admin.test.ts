import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type InjectOptions } from 'fastify'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { curriculumAdminRoutes } = await import('./curriculum-admin.js')
const { isUniqueViolation } = await import('../lib/db-errors.js')

async function buildApp() {
  const app = Fastify()
  await app.register(curriculumAdminRoutes, { prefix: '/api/admin/curriculum' })
  await app.ready()
  return app
}

async function withFlag<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (value === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = value
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.LESSON_ENGINE_ENABLED
    else process.env.LESSON_ENGINE_ENABLED = previous
  }
}

const ROUTES: InjectOptions[] = [
  { method: 'GET', url: '/api/admin/curriculum/lessons' },
  { method: 'GET', url: '/api/admin/curriculum/lessons/g2-m2-l8' },
  { method: 'POST', url: '/api/admin/curriculum/lessons', payload: { definition: {} } },
  { method: 'PUT', url: '/api/admin/curriculum/lessons/g2-m2-l8', payload: { definition: {}, expectedEditVersion: 1 } },
  { method: 'PUT', url: '/api/admin/curriculum/lessons/g2-m2-l8/status', payload: { status: 'review', expectedEditVersion: 1 } },
  { method: 'GET', url: '/api/admin/curriculum/lessons/g2-m2-l8/revisions' },
  { method: 'POST', url: '/api/admin/curriculum/lessons/g2-m2-l8/restore', payload: { revisionEditVersion: 1, expectedEditVersion: 1 } },
  { method: 'GET', url: '/api/admin/curriculum/packs' },
  { method: 'POST', url: '/api/admin/curriculum/lessons/validate', payload: { definition: {} } },
  { method: 'GET', url: '/api/admin/curriculum/outcomes' },
  { method: 'GET', url: '/api/admin/curriculum/outcomes?subjectPackId=informatics-ua-primary' },
  { method: 'POST', url: '/api/admin/curriculum/outcomes', payload: { subjectPackId: 'informatics-ua-primary', outcome: {} } },
  { method: 'PUT', url: '/api/admin/curriculum/outcomes/int-files-organize', payload: { outcome: {}, expectedEditVersion: 1 } },
  { method: 'PUT', url: '/api/admin/curriculum/outcomes/int-files-organize/status', payload: { status: 'archived', expectedEditVersion: 1 } },
  { method: 'GET', url: '/api/admin/curriculum/outcomes/int-files-organize/revisions' },
]

test('with the flag off (default or mistyped) every route is a 404, before validation or auth', async () => {
  for (const flag of [undefined, 'false', 'TRUE', '1', 'yes']) {
    await withFlag(flag, async () => {
      const app = await buildApp()
      try {
        for (const route of [...ROUTES, { method: 'GET', url: '/api/admin/curriculum/lessons/NOT_A_SLUG' } as InjectOptions]) {
          const response = await app.inject(route)
          assert.equal(response.statusCode, 404, `${String(flag)} ${route.method} ${route.url}`)
        }
      } finally {
        await app.close()
      }
    })
  }
})

test('with the flag on, every route requires an authenticated admin', async () => {
  await withFlag('true', async () => {
    const app = await buildApp()
    try {
      for (const route of ROUTES) {
        const response = await app.inject(route)
        assert.equal(response.statusCode, 401, `${route.method} ${route.url}`)
      }
    } finally {
      await app.close()
    }
  })
})

test('malformed IDs and bodies are rejected before auth or database access', async () => {
  await withFlag('true', async () => {
    const app = await buildApp()
    try {
      const cases: InjectOptions[] = [
        { method: 'GET', url: '/api/admin/curriculum/lessons/Not-A-Slug' },
        { method: 'GET', url: `/api/admin/curriculum/lessons/${'a'.repeat(65)}` },
        { method: 'GET', url: '/api/admin/curriculum/lessons/a--b/revisions' },
        { method: 'POST', url: '/api/admin/curriculum/lessons', payload: {} },
        { method: 'POST', url: '/api/admin/curriculum/lessons', payload: { definition: 'text' } },
        { method: 'PUT', url: '/api/admin/curriculum/lessons/g2-m2-l8', payload: { definition: {} } },
        { method: 'PUT', url: '/api/admin/curriculum/lessons/g2-m2-l8', payload: { definition: {}, expectedEditVersion: 0 } },
        { method: 'PUT', url: '/api/admin/curriculum/lessons/g2-m2-l8/status', payload: { status: 'live', expectedEditVersion: 1 } },
        { method: 'POST', url: '/api/admin/curriculum/lessons/g2-m2-l8/restore', payload: { expectedEditVersion: 1 } },
        { method: 'GET', url: '/api/admin/curriculum/outcomes?subjectPackId=Bad_Pack' },
        { method: 'POST', url: '/api/admin/curriculum/lessons/validate', payload: {} },
        { method: 'POST', url: '/api/admin/curriculum/lessons/validate', payload: { definition: {}, lessonId: 'Bad Id' } },
        { method: 'GET', url: '/api/admin/curriculum/outcomes/Not_An_Id/revisions' },
        { method: 'POST', url: '/api/admin/curriculum/outcomes', payload: { outcome: {} } },
        { method: 'POST', url: '/api/admin/curriculum/outcomes', payload: { subjectPackId: 'informatics-ua-primary', outcome: 'text' } },
        { method: 'POST', url: '/api/admin/curriculum/outcomes', payload: { subjectPackId: 'informatics-ua-primary', id: 'Bad Id', outcome: {} } },
        { method: 'PUT', url: '/api/admin/curriculum/outcomes/int-files-organize', payload: { outcome: {} } },
        { method: 'PUT', url: `/api/admin/curriculum/outcomes/${'a'.repeat(65)}`, payload: { outcome: {}, expectedEditVersion: 1 } },
        { method: 'PUT', url: '/api/admin/curriculum/outcomes/int-files-organize/status', payload: { status: 'deleted', expectedEditVersion: 1 } },
      ]
      for (const request of cases) {
        const response = await app.inject(request)
        assert.equal(response.statusCode, 400, `${request.method} ${request.url} ${JSON.stringify(request.payload)}`)
      }
    } finally {
      await app.close()
    }
  })
})

test('duplicate ids surface as a unique violation even when Drizzle wraps the driver error', () => {
  const driverError = Object.assign(new Error('duplicate key'), { code: '23505' })
  assert.equal(isUniqueViolation(driverError), true)
  assert.equal(isUniqueViolation(new Error('Failed query', { cause: driverError })), true)
  assert.equal(isUniqueViolation(Object.assign(new Error('fk'), { code: '23503' })), false)
  assert.equal(isUniqueViolation(null), false)
})
