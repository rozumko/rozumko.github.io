import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Fastify, { type InjectOptions } from 'fastify'
import type { LessonRunRow } from '../db/schema.js'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { lessonRunRoutes, lessonRunView } = await import('./lesson-runs.js')

const RUN_ID = '00000000-0000-4000-8000-000000000001'
const CLASS_ID = '00000000-0000-4000-8000-000000000002'

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(lessonRunRoutes, { prefix: '/api/teacher/lesson-runs' })
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
  { method: 'GET', url: '/api/teacher/lesson-runs' },
  { method: 'POST', url: '/api/teacher/lesson-runs', payload: { classId: CLASS_ID, lessonId: 'g2-m2-l8' } },
  { method: 'GET', url: `/api/teacher/lesson-runs/${RUN_ID}` },
  { method: 'POST', url: `/api/teacher/lesson-runs/${RUN_ID}/start` },
  { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/step`, payload: { stepIndex: 1 } },
  { method: 'POST', url: `/api/teacher/lesson-runs/${RUN_ID}/join-code` },
  { method: 'DELETE', url: `/api/teacher/lesson-runs/${RUN_ID}/join-code` },
  { method: 'GET', url: `/api/teacher/lesson-runs/${RUN_ID}/devices` },
  { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/devices/${CLASS_ID}`, payload: { lessonRunStudentId: null } },
  { method: 'DELETE', url: `/api/teacher/lesson-runs/${RUN_ID}/devices/${CLASS_ID}` },
]

test('lesson run routes are a 404 while the flag is off', async () => {
  await withApp(undefined, async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 404, `${route.method} ${route.url}`)
  })
})

test('lesson run routes require an authenticated teacher', async () => {
  await withApp('true', async app => {
    for (const route of ROUTES) assert.equal((await app.inject(route)).statusCode, 401, `${route.method} ${route.url}`)
  })
})

test('ids, actions and bodies are validated before auth or database access', async () => {
  await withApp('true', async app => {
    const cases: InjectOptions[] = [
      { method: 'GET', url: '/api/teacher/lesson-runs/not-a-uuid' },
      { method: 'POST', url: `/api/teacher/lesson-runs/${RUN_ID}/explode` },
      { method: 'POST', url: '/api/teacher/lesson-runs/not-a-uuid/start' },
      { method: 'POST', url: '/api/teacher/lesson-runs', payload: { classId: 'nope', lessonId: 'g2-m2-l8' } },
      { method: 'POST', url: '/api/teacher/lesson-runs', payload: { classId: CLASS_ID, lessonId: 'Bad Id' } },
      { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/step`, payload: { stepIndex: -1 } },
      { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/step`, payload: { stepIndex: 'next' } },
      { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/devices/not-a-uuid`, payload: { lessonRunStudentId: null } },
      { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/devices/${CLASS_ID}`, payload: { lessonRunStudentId: 'Марко' } },
      { method: 'PUT', url: `/api/teacher/lesson-runs/${RUN_ID}/devices/${CLASS_ID}`, payload: {} },
      { method: 'DELETE', url: `/api/teacher/lesson-runs/${RUN_ID}/devices/nope` },
    ]
    for (const request of cases) {
      assert.equal((await app.inject(request)).statusCode, 400, `${request.method} ${request.url} ${JSON.stringify(request.payload)}`)
    }
  })
})

test('the run view serves the frozen lesson without answer keys, plus its steps', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8'))
  const row = {
    id: RUN_ID, teacherId: 't', classId: CLASS_ID, lessonId: 'g2-m2-l8', lessonPublishedVersion: 2,
    lessonSnapshot: snapshot, status: 'active', currentStepIndex: 3, currentBlockId: 'g2-m2-l8-b05',
    createdAt: new Date(), startedAt: new Date(), pausedAt: null, finishedAt: null, cancelledAt: null, updatedAt: new Date(),
  } as LessonRunRow
  const view = lessonRunView(row, '2-А', [{ id: 's1', classStudentId: null, label: null, status: 'expected' }])
  assert.equal(view.run.steps.length, 12)
  assert.equal(view.run.steps[3], 'g2-m2-l8-b05')
  assert.equal(view.run.className, '2-А')
  assert.ok(!JSON.stringify(view).includes('correctOptionId'))
  assert.equal('teacherId' in view.run, false)
  assert.ok(JSON.stringify(snapshot).includes('correctOptionId'), 'stored snapshot keeps its keys')
})
