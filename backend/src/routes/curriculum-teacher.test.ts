import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Fastify from 'fastify'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { curriculumTeacherRoutes, teacherLessonSummary, teacherLessonView } = await import('./curriculum-teacher.js')

function reference(): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL('../lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8'))
}

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(curriculumTeacherRoutes, { prefix: '/api/teacher/curriculum' })
  await app.ready()
  try {
    await run(app)
  } finally {
    await app.close()
    if (previous === undefined) delete process.env.LESSON_ENGINE_ENABLED
    else process.env.LESSON_ENGINE_ENABLED = previous
  }
}

const URLS = ['/api/teacher/curriculum/lessons', '/api/teacher/curriculum/lessons/g2-m2-l8']

test('teacher lesson routes are a 404 while the flag is off', async () => {
  await withApp(undefined, async app => {
    for (const url of [...URLS, '/api/teacher/curriculum/lessons/BAD']) {
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404, url)
    }
  })
})

test('teacher lesson routes require authentication and validate ids first', async () => {
  await withApp('true', async app => {
    for (const url of URLS) assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401, url)
    assert.equal((await app.inject({ method: 'GET', url: '/api/teacher/curriculum/lessons/Bad_Id' })).statusCode, 400)
  })
})

test('the teacher view never carries answer keys but keeps teacher-only notes', () => {
  const snapshot = reference()
  const view = teacherLessonView(snapshot)
  const serialized = JSON.stringify(view)
  for (const leak of ['"key":', 'correctOptionId', '"explanation":']) {
    assert.ok(!serialized.includes(leak), `${leak} leaked into the teacher view`)
  }
  assert.ok(view.blocks.some(block => block.type === 'teacher-note'))
  assert.ok(JSON.stringify(snapshot).includes('correctOptionId'), 'the stored snapshot must stay intact')
})

test('the lesson summary is built from the published snapshot', () => {
  assert.deepEqual(teacherLessonSummary(reference(), 3), {
    id: 'g2-m2-l8',
    subjectPackId: 'informatics-ua-primary',
    grade: 2,
    moduleId: 'g2-m2',
    lessonNumber: 8,
    title: {
      uk: 'Файли й папки: створення, збереження, перейменування та переміщення',
      en: 'Files and Folders: Create, Save, Rename and Move',
    },
    durationMin: 40,
    publishedVersion: 3,
  })
})
