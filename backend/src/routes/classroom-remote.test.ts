import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type InjectOptions } from 'fastify'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { classroomRemoteRoutes, classroomRemoteRunRoutes } = await import('./classroom-remote.js')

const RUN_ID = '00000000-0000-4000-8000-000000000002'
const KEY = `crk_${'1'.repeat(32)}_${'A'.repeat(43)}`

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(classroomRemoteRoutes, { prefix: '/api/teacher/classroom-remote' })
  await app.register(classroomRemoteRunRoutes, { prefix: '/api/teacher/lesson-runs' })
  await app.ready()
  try {
    await run(app)
  } finally {
    await app.close()
    if (previous === undefined) delete process.env.LESSON_ENGINE_ENABLED
    else process.env.LESSON_ENGINE_ENABLED = previous
  }
}

const ROUTES: InjectOptions[] = [
  { method: 'GET', url: '/api/teacher/classroom-remote' },
  { method: 'PUT', url: '/api/teacher/classroom-remote', payload: { key: KEY } },
  { method: 'DELETE', url: '/api/teacher/classroom-remote' },
  { method: 'GET', url: `/api/teacher/lesson-runs/${RUN_ID}/classroom-remote` },
  { method: 'POST', url: `/api/teacher/lesson-runs/${RUN_ID}/classroom-remote/open` },
]

test('Classroom Remote routes are dark with the flag off and need a teacher with it on', async () => {
  await withApp(undefined, async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 404, route.url as string)
  })
  await withApp('true', async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 401, route.url as string)
  })
})

test('a malformed key or run id is refused before authentication or any outbound call', async () => {
  await withApp('true', async app => {
    for (const key of ['', 'crk_short', `${KEY}x`, 'https://evil.test/']) {
      const response = await app.inject({ method: 'PUT', url: '/api/teacher/classroom-remote', payload: { key } })
      assert.equal(response.statusCode, 400, key)
    }
    const response = await app.inject({ method: 'POST', url: '/api/teacher/lesson-runs/not-a-uuid/classroom-remote/open' })
    assert.equal(response.statusCode, 400)
  })
})
