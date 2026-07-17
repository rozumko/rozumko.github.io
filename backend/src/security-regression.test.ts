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

test('student traffic keeps classroom NAT capacity and verified-token isolation wired into routes', () => {
  const studentSource = readFileSync(new URL('./routes/student.ts', import.meta.url), 'utf8')
  const attemptSource = readFileSync(new URL('./routes/attempt.ts', import.meta.url), 'utf8')
  const schoolSource = readFileSync(new URL('./routes/school.ts', import.meta.url), 'utf8')

  assert.equal((studentSource.match(/RATE_LIMIT_MAX\.classroomStart/g) ?? []).length, 2)
  assert.equal((schoolSource.match(/RATE_LIMIT_MAX\.classroomStart/g) ?? []).length, 1)
  assert.match(attemptSource, /scope:\s*'attempt-answer'/)
  assert.match(attemptSource, /scope:\s*'attempt-finish'/)
  assert.match(attemptSource, /scope:\s*'attempt-heartbeat'/)
  assert.match(attemptSource, /config:\s*\{\s*rateLimit:\s*attemptHeartbeatRateLimit\s*\}/)
  assert.match(schoolSource, /scope:\s*'school-participant-session'/)
  assert.match(schoolSource, /scope:\s*'school-participant-avatar'/)
  assert.match(schoolSource, /scope:\s*'school-participant-answer'/)
  assert.match(schoolSource, /config:\s*\{\s*rateLimit:\s*participantSessionRateLimit\s*\}/)
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

  const customDomainPreflight = await app.inject({
    method: 'OPTIONS',
    url: '/probe',
    headers: {
      origin: 'https://rozumko.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'x-lead-token',
    },
  })
  assert.equal(customDomainPreflight.statusCode, 204)

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

    const defaultSafe = await app.inject({
      method: 'GET',
      url: '/api/questions?isOlympiad=false&count=1&track=ai-basics',
    })
    assert.equal(defaultSafe.statusCode, 200)
    const [defaultQuestion] = defaultSafe.json().questions
    assert.equal('correct' in defaultQuestion, false)
    assert.equal('explanation' in defaultQuestion, false)
    assert.equal('correctOrder' in defaultQuestion.options, false)

    const explicitFalse = await app.inject({
      method: 'GET',
      url: '/api/questions?isOlympiad=false&count=1&track=ai-basics&hideAnswers=false',
    })
    assert.equal(explicitFalse.statusCode, 200)
    const [explicitQuestion] = explicitFalse.json().questions
    assert.equal('correct' in explicitQuestion, false)
    assert.equal('explanation' in explicitQuestion, false)
    assert.equal('correctOrder' in explicitQuestion.options, false)
  } finally {
    db.select = originalSelect
    await app.close()
  }

  const sql = db
    .select({ id: questions.id })
    .from(questions)
    .where(capturedWhere as any)
    .toSQL()
  assert.deepEqual(sql.params, [false, 'published', 'ai-basics'])
})

test('критичні UUID-параметри відхиляються до звернення до БД', async () => {
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })
  await app.register(teacherRoutes, { prefix: '/api/teacher' })
  await app.ready()

  const cases: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string; payload?: Record<string, unknown> }[] = [
    { method: 'PUT', url: '/api/admin/teachers/not-a-uuid/status', payload: { status: 'active' } },
    { method: 'PUT', url: '/api/admin/questions/not-a-uuid', payload: {} },
    { method: 'PUT', url: '/api/admin/questions/not-a-uuid/status', payload: { status: 'draft', expectedEditVersion: 1 } },
    { method: 'GET', url: '/api/admin/questions/not-a-uuid/revisions' },
    { method: 'POST', url: '/api/admin/questions/not-a-uuid/restore', payload: { revisionEditVersion: 1, expectedEditVersion: 1 } },
    { method: 'DELETE', url: '/api/admin/questions/not-a-uuid' },
    { method: 'DELETE', url: '/api/teacher/registrations/not-a-uuid' },
    { method: 'GET', url: '/api/teacher/codes?registrationId=not-a-uuid' },
    { method: 'GET', url: '/api/teacher/classes/not-a-uuid/students' },
    { method: 'POST', url: '/api/teacher/classes/not-a-uuid/students', payload: { label: 'Учень' } },
    { method: 'PUT', url: '/api/teacher/students/not-a-uuid', payload: { label: 'Учень' } },
    { method: 'DELETE', url: '/api/teacher/students/not-a-uuid' },
    { method: 'GET', url: '/api/admin/questions?grade=not-a-grade' },
    { method: 'GET', url: '/api/admin/events/00000000-0000-4000-8000-000000000001/questions?grade=9' },
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

test('application tables have an RLS enablement migration', () => {
  const migration = readFileSync(new URL('../drizzle/0028_enable_rls_all_application_tables.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  const applicationTables = [
    'questions',
    'olympiad_events',
    'event_questions',
    'access_codes',
    'attempts',
    'attempt_questions',
    'app_users',
    'teacher_classes',
    'class_students',
    'event_registrations',
    'school_sessions',
    'school_session_questions',
    'school_participants',
    'school_answers',
    'missions',
    'home_leads',
    'home_child_profiles',
    'home_demo_attempts',
    'home_demo_reports',
    'home_entitlements',
    'home_entitlement_events',
    'home_mission_attempts',
    'home_payment_events',
  ]

  for (const table of applicationTables) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`),
      table,
    )
  }
  assert.match(journal, /"tag": "0028_enable_rls_all_application_tables"/)
})

test('question editorial history is RLS-protected and journaled', () => {
  const migration = readFileSync(new URL('../drizzle/0036_add_question_editorial_workflow.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.question_revisions/)
  assert.match(migration, /ALTER TABLE public\.question_revisions ENABLE ROW LEVEL SECURITY;/)
  assert.match(migration, /ALTER COLUMN editorial_status SET DEFAULT 'draft'/)
  assert.match(journal, /"tag": "0036_add_question_editorial_workflow"/)
})

test('lesson editorial history is RLS-protected and journaled', () => {
  const migration = readFileSync(new URL('../drizzle/0037_add_lesson_editorial_workflow.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.micro_lesson_revisions/)
  assert.match(migration, /ALTER TABLE public\.micro_lesson_revisions ENABLE ROW LEVEL SECURITY;/)
  assert.match(migration, /published_snapshot = jsonb_build_object/)
  assert.match(journal, /"tag": "0037_add_lesson_editorial_workflow"/)
})

test('mission editorial history is RLS-protected and journaled', () => {
  const migration = readFileSync(new URL('../drizzle/0038_add_mission_editorial_workflow.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mission_revisions/)
  assert.match(migration, /ALTER TABLE public\.mission_revisions ENABLE ROW LEVEL SECURITY;/)
  assert.match(migration, /ALTER COLUMN status SET DEFAULT 'draft'/)
  assert.match(migration, /published_snapshot = jsonb_build_object/)
  assert.match(journal, /"tag": "0038_add_mission_editorial_workflow"/)
})

test('sequence and scenario content registry seed is journaled and revision-aware', () => {
  const migration = readFileSync(new URL('../drizzle/0039_seed_sequence_scenario_missions.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /'sequence-game'/)
  assert.match(migration, /'scenario-game'/)
  assert.match(migration, /INSERT INTO public\.mission_revisions/)
  assert.match(journal, /"tag": "0039_seed_sequence_scenario_missions"/)
})

test('fact-opinion content registry seed is journaled and revision-aware', () => {
  const migration = readFileSync(new URL('../drizzle/0042_seed_fact_opinion_missions.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /'fact-opinion-game'/)
  assert.match(migration, /INSERT INTO public\.mission_revisions/)
  assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/)
  assert.match(journal, /"tag": "0042_seed_fact_opinion_missions"/)
})

test('click-trainer content registry seed is journaled and revision-aware', () => {
  const migration = readFileSync(new URL('../drizzle/0043_seed_click_trainer_missions.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /'click-trainer-game'/)
  assert.match(migration, /INSERT INTO public\.mission_revisions/)
  assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/)
  assert.match(journal, /"tag": "0043_seed_click_trainer_missions"/)
})

test('simulator content registry seed keeps mechanics code-owned and is journaled', () => {
  const migration = readFileSync(new URL('../drizzle/0040_seed_simulator_missions.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /'simulator-game'/)
  assert.match(migration, /'mechanicsVersion', 1/)
  assert.match(migration, /INSERT INTO public\.mission_revisions/)
  assert.match(journal, /"tag": "0040_seed_simulator_missions"/)
})

test('content publication queue is constrained, RLS-protected and journaled', () => {
  const migration = readFileSync(new URL('../drizzle/0041_add_content_publications.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.content_publications/)
  assert.match(migration, /WHERE status IN \('queued', 'running'\)/)
  assert.match(migration, /expected_manifest_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(migration, /ALTER TABLE public\.content_publications ENABLE ROW LEVEL SECURITY;/)
  assert.match(journal, /"tag": "0041_add_content_publications"/)
  assert.match(workflow, /EXPECTED_MANIFEST_SHA256/)
  assert.match(workflow, /secrets\.CONTENT_EXPORT_DATABASE_URL/)
  assert.match(workflow, /cancel-in-progress:\s*false/)
  assert.match(workflow, /queue:\s*max/)
  assert.match(workflow, /Verify content export configuration/)
  assert.match(workflow, /publication-callback\.mjs succeeded/)
  assert.doesNotMatch(workflow, /CONTENT_PUBLISH_GITHUB_TOKEN/)
})

test('supply-chain guardrails are configured for npm dependencies', () => {
  const dependabot = readFileSync(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../../.github/workflows/supply-chain.yml', import.meta.url), 'utf8')

  assert.match(dependabot, /package-ecosystem:\s*npm/)
  assert.match(dependabot, /directory:\s*\/\s/)
  assert.match(dependabot, /directory:\s*\/backend/)
  assert.match(dependabot, /interval:\s*weekly/)

  assert.match(workflow, /actions\/dependency-review-action@v4/)
  assert.match(workflow, /fail-on-severity:\s*high/)
  assert.match(workflow, /npm audit --audit-level=high/)
  assert.match(workflow, /lockfile:\s*package-lock\.json/)
  assert.match(workflow, /lockfile:\s*backend\/package-lock\.json/)
})

test('Render startup fails closed on migration drift without applying SQL', () => {
  const renderBlueprint = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8')
  const backendPackage = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const healthRoute = readFileSync(new URL('./routes/health.ts', import.meta.url), 'utf8')

  assert.match(renderBlueprint, /startCommand: npm run db:migrate:check:prod && node dist\/server\.js/)
  assert.doesNotMatch(renderBlueprint, /startCommand:.*db:migrate:prod(?:\s|&)/)
  assert.match(backendPackage, /"db:migrate:check:prod": "node dist\/db\/check-migrations\.js"/)
  assert.match(healthRoute, /db: 'migration_required'/)
})

test('operational security evidence runbook covers external controls', () => {
  const evidence = readFileSync(new URL('../../docs/security-ops-evidence.md', import.meta.url), 'utf8')
  const smokeTest = readFileSync(new URL('../../docs/smoke-test.md', import.meta.url), 'utf8')
  const securityModel = readFileSync(new URL('../../docs/security-model.md', import.meta.url), 'utf8')

  for (const required of [
    'Supabase Auth',
    'Turnstile',
    'Signup rate limits',
    'Password login rate limits',
    'Supabase Database',
    'RLS',
    'GitHub',
    'Branch protection',
    'Required checks',
    'Render Backend',
    'numInstances = 1',
    'RATE_LIMIT_STORE=memory',
    'Post-Deploy Security Smoke',
    'Teacher session',
  ]) {
    assert.match(evidence, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), required)
  }

  assert.match(smokeTest, /docs\/security-ops-evidence\.md/)
  assert.match(securityModel, /docs\/security-ops-evidence\.md/)
  assert.match(evidence, /Do not commit screenshots, secrets, tokens/)
})

test('attempt finalization is protected against late answer races', () => {
  const answerRoute = readFileSync(new URL('./routes/attempt.ts', import.meta.url), 'utf8')
  const finalization = readFileSync(new URL('./routes/attempt-finalization.ts', import.meta.url), 'utf8')

  assert.match(answerRoute, /eq\(attempts\.status,\s*'in_progress'\)/)
  assert.match(answerRoute, /\.returning\(\{\s*id:\s*attempts\.id\s*\}\)/)
  assert.match(finalization, /db\.transaction/)
  assert.match(finalization, /\.for\('update'\)/)
})

test('JWT verification pins audience and rejects anonymous sign-ins in both auth paths', () => {
  const teacherAuth = readFileSync(new URL('./lib/auth.ts', import.meta.url), 'utf8')
  const parentAuth = readFileSync(new URL('./lib/parent-auth.ts', import.meta.url), 'utf8')

  assert.match(teacherAuth, /audience:\s*'authenticated'/)
  assert.match(parentAuth, /audience:\s*'authenticated'/)
  assert.match(teacherAuth, /is_anonymous === true/)
  assert.match(parentAuth, /is_anonymous === true/)
})

test('parent email verification never reads the user-writable JWT claim', () => {
  const parentRoute = readFileSync(new URL('./routes/parent.ts', import.meta.url), 'utf8')

  // user_metadata.email_verified is raw_user_meta_data: any authenticated user
  // can set it via PUT /auth/v1/user. Source of truth is auth.users only.
  assert.doesNotMatch(parentRoute, /payload\.user_metadata/)
  assert.match(parentRoute, /email_confirmed_at from auth\.users/)
})

test('requireAuth is read-only; teacher rows appear only via explicit register-request', () => {
  const authLib = readFileSync(new URL('./lib/auth.ts', import.meta.url), 'utf8')
  const teacherRoute = readFileSync(new URL('./routes/teacher.ts', import.meta.url), 'utf8')

  // A parent (or any Supabase user) hitting a teacher endpoint must not
  // create app_users rows as a side effect of authentication.
  assert.doesNotMatch(authLib, /\.insert\(/)
  assert.match(authLib, /ACCOUNT_UNKNOWN/)
  assert.match(teacherRoute, /'\/register-request'/)
  assert.match(teacherRoute, /role:\s*'teacher',\s*status:\s*'pending'/)
  assert.match(teacherRoute, /onConflictDoNothing\(\{\s*target:\s*appUsers\.authUserId\s*\}\)/)
})

test('admin teacher-status route cannot touch admin accounts', () => {
  const adminRoute = readFileSync(new URL('./routes/admin.ts', import.meta.url), 'utf8')
  assert.match(adminRoute, /eq\(appUsers\.id,\s*id\),\s*eq\(appUsers\.role,\s*'teacher'\)/)
})

test('admin parent directory is admin-only and excludes child identity fields', () => {
  const adminRoute = readFileSync(new URL('./routes/admin.ts', import.meta.url), 'utf8')
  const parentDirectory = readFileSync(new URL('./routes/admin-parents.ts', import.meta.url), 'utf8')

  assert.match(adminRoute, /app\.get\('\/parents',\s*\{\s*preHandler:\s*requireAdmin\s*\}/)
  assert.match(parentDirectory, /profileCount:\s*count\(homeChildProfiles\.id\)/)
  assert.doesNotMatch(parentDirectory, /displayName|authUserId|grade|progress|report/i)
})
