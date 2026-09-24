import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type InjectOptions } from 'fastify'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { classLessonLinkRoutes } = await import('./class-lesson-links.js')

const CLASS_ID = '00000000-0000-4000-8000-000000000002'

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(classLessonLinkRoutes, { prefix: '/api/teacher/classes' })
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
  { method: 'GET', url: `/api/teacher/classes/${CLASS_ID}/lesson-link` },
  { method: 'PUT', url: `/api/teacher/classes/${CLASS_ID}/lesson-link`, payload: { enabled: true } },
  { method: 'POST', url: `/api/teacher/classes/${CLASS_ID}/lesson-link/rotate` },
  { method: 'DELETE', url: `/api/teacher/classes/${CLASS_ID}/lesson-seats` },
]

test('class link routes are dark with the flag off and need a teacher with it on', async () => {
  await withApp(undefined, async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 404, route.url as string)
  })
  await withApp('true', async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 401, route.url as string)
  })
})
