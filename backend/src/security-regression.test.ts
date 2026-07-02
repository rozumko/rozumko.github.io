import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { FASTIFY_SECURITY_OPTIONS, CORS_OPTIONS } from './lib/security-config.js'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const [
  { questionsRoutes },
  { adminRoutes },
  { teacherRoutes },
  { db },
  { questions },
] = await Promise.all([
  import('./routes/questions.js'),
  import('./routes/admin.js'),
  import('./routes/teacher.js'),
  import('./db/index.js'),
  import('./db/schema.js'),
])

test('rate-limit не довіряє підробленому лівому X-Forwarded-For', async () => {
  assert.equal(FASTIFY_SECURITY_OPTIONS.trustProxy, 1)

  const app = Fastify(FASTIFY_SECURITY_OPTIONS)
  await app.register(rateLimit, { max: 2, timeWindow: '1 minute' })
  app.get('/probe', async req => ({ ip: req.ip }))
  await app.ready()

  const hit = (spoofedIp: string) => app.inject({
    method: 'GET',
    url: '/probe',
    remoteAddress: '192.0.2.10',
    headers: { 'x-forwarded-for': `${spoofedIp}, 198.51.100.7` },
  })

  const first = await hit('10.0.0.1')
  const second = await hit('10.0.0.2')
  const third = await hit('10.0.0.3')

  assert.equal(first.statusCode, 200)
  assert.equal(first.json().ip, '198.51.100.7')
  assert.equal(second.statusCode, 200)
  assert.equal(third.statusCode, 429)

  await app.close()
})

test('CORS preflight дозволяє кастомні токен-заголовки з дозволеного origin', async () => {
  const app = Fastify()
  await app.register(cors, CORS_OPTIONS)
  app.post('/probe', async () => ({ ok: true }))
  await app.ready()

  // Браузер шле preflight перед POST із кастомним заголовком.
  // inject-тести роутів його не роблять, тому пропущений заголовок
  // в allowedHeaders ламає продакшен непомітно для CI.
  for (const header of ['x-attempt-token', 'x-participant-token', 'x-lead-token']) {
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/probe',
      headers: {
        origin: 'https://rozumko.github.io',
        'access-control-request-method': 'POST',
        'access-control-request-headers': header,
      },
    })
    assert.equal(preflight.statusCode, 204, header)
    const allowed = String(preflight.headers['access-control-allow-headers'] ?? '').toLowerCase()
    assert.ok(allowed.includes(header), `${header} відсутній у access-control-allow-headers`)
  }

  const forbidden = await app.inject({
    method: 'OPTIONS',
    url: '/probe',
    headers: {
      origin: 'https://evil.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'x-participant-token',
    },
  })
  assert.equal(forbidden.statusCode, 403)

  await app.close()
})

test('публічний API питань відхиляє небезпечні query-параметри', async () => {
  const app = Fastify()
  await app.register(questionsRoutes, { prefix: '/api/questions' })
  await app.ready()

  for (const query of [
    'count=abc',
    'count=-5',
    'count=0',
    'count=999',
    'isOlympiad=true',
  ]) {
    const response = await app.inject({ method: 'GET', url: `/api/questions?${query}` })
    assert.equal(response.statusCode, 400, query)
  }

  await app.close()
})

test('публічний API питань фільтрує олімпіадні записи і ховає demo-ключі', async () => {
  const originalSelect = db.select
  let capturedWhere: unknown

  db.select = (() => ({
    from: () => ({
      where: (where: unknown) => {
        capturedWhere = where
        return {
          orderBy: () => ({
            limit: async () => [{
              id: 'practice-1',
              q: 'Тренувальне питання',
              code: null,
              type: 'sort',
              options: { items: ['A', 'B'], correctOrder: [1, 0] },
              correct: null,
              explanation: 'Пояснення',
              difficulty: 'easy',
              track: 'ai-basics',
              grade: 1,
            }],
          }),
        }
      },
    }),
  })) as unknown as typeof db.select

  const app = Fastify()
  try {
    await app.register(questionsRoutes, { prefix: '/api/questions' })
    await app.ready()

    const demo = await app.inject({
      method: 'GET',
      url: '/api/questions?isOlympiad=false&count=1&hideAnswers=true&track=ai-basics',
    })

    assert.equal(demo.statusCode, 200)
    const [question] = demo.json().questions
    assert.equal('correct' in question, false)
    assert.equal('explanation' in question, false)
    assert.equal('correctOrder' in question.options, false)
  } finally {
    db.select = originalSelect
    await app.close()
  }

  const sql = db
    .select({ id: questions.id })
    .from(questions)
    .where(capturedWhere as any)
    .toSQL()
  assert.deepEqual(sql.params, [false, 'ai-basics'])
})

test('критичні UUID-параметри відхиляються до звернення до БД', async () => {
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })
  await app.register(teacherRoutes, { prefix: '/api/teacher' })
  await app.ready()

  const cases: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string; payload?: Record<string, unknown> }[] = [
    { method: 'PUT', url: '/api/admin/teachers/not-a-uuid/status', payload: { status: 'active' } },
    { method: 'PUT', url: '/api/admin/questions/not-a-uuid', payload: {} },
    { method: 'DELETE', url: '/api/admin/questions/not-a-uuid' },
    { method: 'DELETE', url: '/api/teacher/registrations/not-a-uuid' },
    { method: 'GET', url: '/api/teacher/codes?registrationId=not-a-uuid' },
    { method: 'GET', url: '/api/teacher/classes/not-a-uuid/students' },
    { method: 'POST', url: '/api/teacher/classes/not-a-uuid/students', payload: { label: 'Учень' } },
    { method: 'PUT', url: '/api/teacher/students/not-a-uuid', payload: { label: 'Учень' } },
    { method: 'DELETE', url: '/api/teacher/students/not-a-uuid' },
  ]

  for (const request of cases) {
    const response = await app.inject(request)
    assert.equal(response.statusCode, 400, `${request.method} ${request.url}`)
  }

  await app.close()
})

test('Render деплоїть backend лише після проходження CI', () => {
  const blueprint = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8')
  assert.match(blueprint, /^\s+autoDeployTrigger:\s+checksPass\s*$/m)
})

test('attempt finalization is protected against late answer races', () => {
  const answerRoute = readFileSync(new URL('./routes/attempt.ts', import.meta.url), 'utf8')
  const finalization = readFileSync(new URL('./routes/attempt-finalization.ts', import.meta.url), 'utf8')

  assert.match(answerRoute, /eq\(attempts\.status,\s*'in_progress'\)/)
  assert.match(answerRoute, /\.returning\(\{\s*id:\s*attempts\.id\s*\}\)/)
  assert.match(finalization, /db\.transaction/)
  assert.match(finalization, /\.for\('update'\)/)
})
