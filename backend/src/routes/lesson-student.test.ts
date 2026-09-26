import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type InjectOptions } from 'fastify'

process.env.ATTEMPT_SECRET ??= 'a'.repeat(64)

const { lessonStudentRoutes } = await import('./lesson-student.js')
const { db } = await import('../db/index.js')
const { lessonRunDevices, lessonRuns } = await import('../db/schema.js')
const { generateDeviceToken } = await import('../lib/lesson-device.js')

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

const ATTEMPT = {
  lessonRunStudentId: DEVICE,
  assignmentVersion: 0,
  deviceId: DEVICE,
  deviceToken: 'b'.repeat(64),
  dispatchId: '00000000-0000-4000-8000-000000000002',
  clientAttemptId: '00000000-0000-4000-8000-000000000003',
}

test('progress requires valid IDs, assignment version and a genuine token before any DB access', async () => {
  const payload = { ...ATTEMPT, revision: 0, progress: { selection: {} } }
  const { clientAttemptId: _unused, ...progress } = payload
  await withApp('true', async app => {
    for (const body of [
      { ...progress, lessonRunStudentId: 'not-a-uuid' },
      { ...progress, dispatchId: 'not-a-uuid' },
      { ...progress, assignmentVersion: -1 },
      { ...progress, revision: -1 },
      { ...progress, progress: [] },
    ]) assert.equal((await app.inject({ method: 'POST', url: '/api/student/lesson/progress', payload: body })).statusCode, 400)
    assert.equal((await app.inject({ method: 'POST', url: '/api/student/lesson/progress', payload: progress })).statusCode, 401)
  })
  await withApp(undefined, async app => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/student/lesson/progress', payload: progress })).statusCode, 404)
  })
})

test('both progress and attempts re-read the assignment after acquiring the run lock and refuse a still-running old laptop', async () => {
  let runLocked = false
  let rereads = 0
  const replacement = { id: DEVICE, lessonRunId: DEVICE, lessonRunStudentId: DEVICE, assignmentVersion: 3, revokedAt: null, expiresAt: new Date(Date.now() + 60000) }
  const transaction = mock.method(db, 'transaction', async (fn: (tx: unknown) => Promise<unknown>) => fn({
    select() {
      let rows: unknown[] = []
      const query = {
        from(table: unknown) {
          if (table === lessonRuns) { runLocked = true; rows = [{ id: DEVICE }] }
          else if (table === lessonRunDevices && !runLocked) rows = [{ runId: DEVICE }]
          else { assert.equal(runLocked, true); rereads++; rows = [{ device: replacement, runStatus: 'active', lessonSnapshot: {} }] }
          return query
        },
        innerJoin() { return query }, where() { return query }, limit() { return query }, for() { return query },
        then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve) },
      }
      return query
    },
    insert() { assert.fail('a stale assignment must not write') },
  }) as never)
  try {
    await withApp('true', async app => {
      const body = { ...ATTEMPT, assignmentVersion: 1, deviceToken: generateDeviceToken(DEVICE) }
      const { clientAttemptId: _unused, ...progress } = body
      const saved = await app.inject({ method: 'POST', url: '/api/student/lesson/progress', payload: { ...progress, revision: 0, progress: { selection: {} } } })
      assert.equal(saved.statusCode, 409)
      assert.equal(saved.json().code, 'ASSIGNMENT_CHANGED')
      runLocked = false
      const attempted = await app.inject({ method: 'POST', url: '/api/student/lesson/attempt', payload: { ...body, answer: { optionId: 'b' } } })
      assert.equal(attempted.statusCode, 401)
      assert.equal(rereads, 2)
    })
  } finally { transaction.mock.restore() }
})

test('attempts are validated before any database access and need a genuine device token', async () => {
  await withApp('true', async app => {
    for (const payload of [
      { ...ATTEMPT, clientAttemptId: 'not-a-uuid' },
      { ...ATTEMPT, dispatchId: 'nope' },
      { ...ATTEMPT, answer: 'b' },
      { ...ATTEMPT, gameResult: { correct: 'lots', total: 1, mistakes: 0, durationSec: 5 } },
      { deviceId: DEVICE, deviceToken: 'b'.repeat(64) },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/student/lesson/attempt', payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
    const forged = await app.inject({ method: 'POST', url: '/api/student/lesson/attempt', payload: { ...ATTEMPT, answer: { optionId: 'b' } } })
    assert.equal(forged.statusCode, 401)
  })
})

test('launch-token exchange validates the token shape before any database access', async () => {
  await withApp('true', async app => {
    for (const payload of [{}, { launchToken: 'short' }, { launchToken: '+'.repeat(43) }]) {
      const response = await app.inject({ method: 'POST', url: '/api/student/lesson/launch', payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
  })
  await withApp(undefined, async app => {
    const response = await app.inject({ method: 'POST', url: '/api/student/lesson/launch', payload: { launchToken: 'a'.repeat(43) } })
    assert.equal(response.statusCode, 404)
  })
})

test('a class-link join validates its shape and refuses a forged key before any database access', async () => {
  const { classLinkKey } = await import('../lib/lesson-device.js')
  const classId = '00000000-0000-4000-8000-00000000c1a5'
  const genuine = { classId, version: 1, key: classLinkKey(classId, 1) }
  await withApp(undefined, async app => {
    const response = await app.inject({ method: 'POST', url: '/api/student/lesson/join-class', payload: genuine })
    assert.equal(response.statusCode, 404)
  })
  await withApp('true', async app => {
    for (const payload of [
      {},
      { ...genuine, classId: 'nope' },
      { ...genuine, version: 0 },
      { ...genuine, key: 'short' },
      { ...genuine, seat: 'short' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/student/lesson/join-class', payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
    for (const payload of [
      { ...genuine, key: classLinkKey(classId, 2) }, // another version's key
      { ...genuine, classId: '00000000-0000-4000-8000-00000000c1a6' }, // another class
      { ...genuine, key: 'A'.repeat(43) },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/student/lesson/join-class', payload })
      assert.equal(response.statusCode, 404, JSON.stringify(payload))
      assert.equal(response.json().code, 'LINK_INVALID')
    }
  })
})

test('a code join accepts only a well-formed seat', async () => {
  await withApp('true', async app => {
    for (const seat of ['short', '+'.repeat(43), 'a'.repeat(44)]) {
      const response = await app.inject({ method: 'POST', url: '/api/student/lesson/join', payload: { code: '123456', seat } })
      assert.equal(response.statusCode, 400, seat)
    }
  })
})
