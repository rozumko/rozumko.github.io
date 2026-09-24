import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type InjectOptions } from 'fastify'

process.env.ATTEMPT_SECRET ??= 'a'.repeat(64)

const { lessonStudentRoutes } = await import('./lesson-student.js')

const DEVICE = '00000000-0000-4000-8000-000000000001'

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(lessonStudentRoutes, { prefix: '/api/student/lesson' })
  await app.ready()
  try {
    await run(app)
  } finally {
    await app.close()
    if (previous === undefined) delete process.env.LESSON_ENGINE_ENABLED
    else process.env.LESSON_ENGINE_ENABLED = previous
  }
}

test('student lesson routes are a 404 while the flag is off', async () => {
  await withApp(undefined, async app => {
    for (const route of [
      { method: 'POST', url: '/api/student/lesson/join', payload: { code: '123456' } },
      { method: 'POST', url: '/api/student/lesson/state', payload: { deviceId: DEVICE, deviceToken: 'a'.repeat(64) } },
    ] as InjectOptions[]) {
      assert.equal((await app.inject(route)).statusCode, 404)
    }
  })
})

test('malformed join and state bodies are rejected before any database access', async () => {
  await withApp('true', async app => {
    const cases: InjectOptions[] = [
      { method: 'POST', url: '/api/student/lesson/join', payload: {} },
      { method: 'POST', url: '/api/student/lesson/join', payload: { code: '12345' } },
      { method: 'POST', url: '/api/student/lesson/join', payload: { code: '12a456' } },
      { method: 'POST', url: '/api/student/lesson/state', payload: { deviceId: 'nope', deviceToken: 'a'.repeat(64) } },
      { method: 'POST', url: '/api/student/lesson/state', payload: { deviceId: DEVICE, deviceToken: 'short' } },
    ]
    for (const request of cases) {
      assert.equal((await app.inject(request)).statusCode, 400, JSON.stringify(request.payload))
    }
  })
})

test('a well-formed but forged device token is refused before any database access', async () => {
  await withApp('true', async app => {
    const response = await app.inject({
      method: 'POST', url: '/api/student/lesson/state', payload: { deviceId: DEVICE, deviceToken: 'b'.repeat(64) },
    })
    assert.equal(response.statusCode, 401)
    assert.equal(response.json().code, 'DEVICE_INVALID')
  })
})
