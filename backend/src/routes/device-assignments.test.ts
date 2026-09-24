import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type InjectOptions } from 'fastify'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { deviceAssignmentRoutes } = await import('./device-assignments.js')

const CLASS_ID = '00000000-0000-4000-8000-000000000002'
const STUDENT_ID = '00000000-0000-4000-8000-000000000003'

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(deviceAssignmentRoutes, { prefix: '/api/teacher/classes' })
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
  { method: 'GET', url: `/api/teacher/classes/${CLASS_ID}/device-assignments` },
  { method: 'PUT', url: `/api/teacher/classes/${CLASS_ID}/device-assignments`, payload: { assignments: [] } },
]

test('device assignment routes are dark with the flag off and need a teacher with it on', async () => {
  await withApp(undefined, async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 404)
  })
  await withApp('true', async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 401)
  })
})

test('assignment bodies are validated before auth or database access', async () => {
  await withApp('true', async app => {
    for (const payload of [
      {},
      { assignments: [{ remoteDeviceId: 'PC 01', classStudentId: STUDENT_ID }] },
      { assignments: [{ remoteDeviceId: 'PC-01', classStudentId: 'nope' }] },
      { assignments: Array.from({ length: 61 }, (_, i) => ({ remoteDeviceId: `PC-${i}`, classStudentId: STUDENT_ID })) },
    ]) {
      const response = await app.inject({ method: 'PUT', url: `/api/teacher/classes/${CLASS_ID}/device-assignments`, payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload).slice(0, 80))
    }
    assert.equal((await app.inject({ method: 'GET', url: '/api/teacher/classes/nope/device-assignments' })).statusCode, 400)
  })
})
