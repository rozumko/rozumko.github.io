import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  normalizeQuestionEditorialStatus,
  normalizeQuestionMedia,
  questionReadinessIssues,
  questionSnapshot,
  restoredQuestionValues,
} from './question-editorial.js'

test('question editorial status and media fail closed', () => {
  assert.equal(normalizeQuestionEditorialStatus('review'), 'review')
  assert.throws(() => normalizeQuestionEditorialStatus('active'), /статус/)
  assert.deepEqual(normalizeQuestionMedia('/assets/task.svg', 'Схема завдання'), {
    img: '/assets/task.svg', imageAlt: 'Схема завдання',
  })
  assert.throws(() => normalizeQuestionMedia('javascript:alert(1)', 'x'), /https/)
  assert.throws(() => normalizeQuestionMedia('/task.svg', ''), /alt-текст/)
})

test('published question readiness requires taxonomy and a valid answer shape', () => {
  const base = {
    q: 'Що далі?', type: 'choice', options: ['А', 'Б'], correct: 0,
    grade: 2, difficulty: 'medium', track: 'computational-thinking', topic: 'patterns',
    img: null, imageAlt: null, isOlympiad: false, channels: ['path'] as const,
  }
  assert.deepEqual(questionReadinessIssues(base), [])
  assert.match(questionReadinessIssues({ ...base, topic: null }).join(' '), /тему/)
  assert.match(questionReadinessIssues({ ...base, correct: 9 }).join(' '), /correct/)
  assert.match(questionReadinessIssues({ ...base, channels: [] }).join(' '), /розділу/)
})

test('snapshots serialize dates and restore only authored content', () => {
  const snapshot = questionSnapshot({ q: 'Текст', editorialStatus: 'published', updatedAt: new Date('2026-07-16T10:00:00Z') })
  assert.equal(snapshot.updatedAt, '2026-07-16T10:00:00.000Z')
  assert.deepEqual(restoredQuestionValues({ ...snapshot, correct: 0, updatedBy: 'admin' }), { q: 'Текст', correct: 0 })
})

// Regression: nullable fields were declared as oneOf [{type}, {null}], and with
// Fastify's default AJV coercion `null` matched BOTH branches → every match/sort/input
// question save (correct: null) failed schema validation with a generic 400.
// Schema validation runs BEFORE preHandler, so a payload that passes the schema
// on an unauthenticated request must reach auth and get 401, not a schema 400.
test('admin question body schema accepts nulls in nullable fields', async () => {
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  const [{ default: Fastify }, { adminRoutes }] = await Promise.all([
    import('fastify'),
    import('./admin.js'),
  ])
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })

  const matchQuestion = {
    q: 'Зʼєднай джерело інформації з тим, як ми нею користуємось.',
    type: 'match',
    options: { left: ['Книжка', 'Радіо'], right: ['Читаємо', 'Слухаємо'], pairs: [0, 1] },
    correct: null,
    grade: 1, difficulty: 'medium',
    track: null, topic: null, conceptKey: null, progressionBand: null,
    isOlympiad: false, channels: [],
    explanation: 'Текст читаємо, звук слухаємо.',
    img: null, imageAlt: null,
  }
  const questionUrl = '/api/admin/questions/00000000-0000-4000-8000-0000000000c1'

  const updated = await app.inject({ method: 'PUT', url: questionUrl, payload: { ...matchQuestion, expectedEditVersion: 1 } })
  assert.equal(updated.statusCode, 401)

  const created = await app.inject({ method: 'POST', url: '/api/admin/questions', payload: matchQuestion })
  assert.equal(created.statusCode, 401)

  // Invalid values must still be rejected by the schema itself
  for (const bad of [{ correct: -1 }, { track: 'unknown-track' }, { progressionBand: 'guess' }]) {
    const rejected = await app.inject({ method: 'PUT', url: questionUrl, payload: { ...matchQuestion, ...bad, expectedEditVersion: 1 } })
    assert.equal(rejected.statusCode, 400, JSON.stringify(bad))
  }
  await app.close()
})

// The section counters exist to show what the OTHER sections hold, so they must
// accept the shared filters and refuse a section filter of their own.
test('question bank counters share the list filters but never take a section', async () => {
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  const [{ default: Fastify }, { adminRoutes }] = await Promise.all([
    import('fastify'),
    import('./admin.js'),
  ])
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })

  // Schema validation runs before auth: 401 means the query was accepted.
  const shared = await app.inject({ method: 'GET', url: '/api/admin/questions/counts?grade=2&status=published&search=алгоритм' })
  assert.equal(shared.statusCode, 401, shared.body)
  const invalid = await app.inject({ method: 'GET', url: '/api/admin/questions/counts?grade=9' })
  assert.equal(invalid.statusCode, 400, invalid.body)
  for (const section of ['channel=class_game', 'isOlympiad=true', 'unassigned=true']) {
    const accepted = await app.inject({ method: 'GET', url: `/api/admin/questions?${section}` })
    assert.equal(accepted.statusCode, 401, section)
  }
  // "Delivered nowhere" is a section, not a toggle: only the true form exists
  const ambiguous = await app.inject({ method: 'GET', url: '/api/admin/questions?unassigned=false' })
  assert.equal(ambiguous.statusCode, 400, ambiguous.body)

  // The coverage matrix keeps the section but drops the axes it draws
  const scoped = await app.inject({ method: 'GET', url: '/api/admin/questions/matrix?channel=class_game&status=published' })
  assert.equal(scoped.statusCode, 401, scoped.body)

  // Undeclared query properties are stripped, not honoured, so the contract is
  // the declared schema: the counters take the shared filters unchanged, and the
  // matrix declares neither grade nor topic — otherwise it could never show an
  // empty cell.
  const admin = readFileSync(new URL('./admin.ts', import.meta.url), 'utf8')
  assert.match(admin, /'\/questions\/counts', \{\s*preHandler: requireAdmin,\s*schema: \{ querystring: \{ \.\.\.questionBankQuerystring \} \},/)
  const matrix = admin.slice(admin.indexOf("'/questions/matrix'"), admin.indexOf('// GET /api/admin/questions?grade='))
  const matrixQuery = matrix.slice(0, matrix.indexOf('async (req, reply)'))
  assert.doesNotMatch(matrixQuery, /\bgrade:/)
  assert.doesNotMatch(matrixQuery, /\btopic:/)
  assert.match(matrix, /groupBy\(questions\.grade, questions\.topic\)/)

  await app.close()
})

// Delivery is not authored content: this route may move published rows between
// sections, so its guards are the whole safety story (docs/security-model.md).
test('bulk channel changes stay narrow, audited and fail closed', async () => {
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  const [{ default: Fastify }, { adminRoutes }] = await Promise.all([
    import('fastify'),
    import('./admin.js'),
  ])
  const app = Fastify()
  await app.register(adminRoutes, { prefix: '/api/admin' })

  const id = '00000000-0000-4000-8000-0000000000d1'
  const valid = { ids: [id], channel: 'class_game', action: 'add' }
  const accepted = await app.inject({ method: 'POST', url: '/api/admin/questions/channels', payload: valid })
  assert.equal(accepted.statusCode, 401, accepted.body)

  // One channel, add or remove, nothing else
  for (const bad of [
    { ...valid, channel: 'main_round' },
    { ...valid, channel: 'public' },
    { ...valid, action: 'replace' },
    { ...valid, ids: [] },
    { ...valid, ids: ['not-a-uuid'] },
    { ...valid, ids: Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) },
  ]) {
    const rejected = await app.inject({ method: 'POST', url: '/api/admin/questions/channels', payload: bad })
    assert.equal(rejected.statusCode, 400, JSON.stringify(bad).slice(0, 120))
  }
  await app.close()

  const admin = readFileSync(new URL('./admin.ts', import.meta.url), 'utf8')
  const route = admin.slice(admin.indexOf("'/questions/channels'"), admin.indexOf("'/questions/:id/status'"))
  // Main-round rows keep no channels, published rows keep at least one, every
  // change is optimistically locked and snapshotted.
  assert.match(route, /if \(row\.isOlympiad\)/)
  assert.match(route, /if \(!next\.length && row\.editorialStatus === 'published'\)/)
  assert.match(route, /eq\(questions\.editVersion, row\.editVersion\)/)
  assert.match(route, /action: 'channels'/)
  assert.match(route, /snapshot: questionSnapshot\(saved\)/)
  // Content fields cannot ride along: the body allows nothing else
  // (additionalProperties: false) and the update writes delivery columns only.
  assert.match(route, /additionalProperties: false/)
  const update = route.slice(route.indexOf('.set({'), route.indexOf('.where(and(eq(questions.id, row.id)'))
  assert.deepEqual(
    [...update.matchAll(/^\s{12}(\w+):/gm)].map(match => match[1]),
    ['channels', 'version', 'editVersion', 'updatedAt', 'updatedBy'],
  )
})

test('published question rows are immutable and child issuance is publication-gated', () => {
  const admin = readFileSync(new URL('./admin.ts', import.meta.url), 'utf8')
  const publicQuestions = readFileSync(new URL('./questions.ts', import.meta.url), 'utf8')
  const home = readFileSync(new URL('./home.ts', import.meta.url), 'utf8')
  const school = readFileSync(new URL('./school.ts', import.meta.url), 'utf8')
  assert.match(admin, /if \(current\.publishedAt\)/)
  assert.match(admin, /Опубліковане питання незмінне/)
  assert.match(publicQuestions, /eq\(questions\.editorialStatus, 'published'\)/)
  assert.match(publicQuestions, /const channel\s+= req\.query\.channel \?\? 'path'/)
  assert.match(publicQuestions, /arrayContains\(questions\.channels, \[channel\]\)/)
  assert.match(home, /eq\(questions\.editorialStatus, 'published'\)/)
  assert.match(home, /arrayContains\(questions\.channels, \['path'\]\)/)
  assert.match(home, /inArray\(questions\.editorialStatus, \['published', 'archived'\]\)/)
  assert.match(school, /eq\(questions\.editorialStatus, 'published'\)/)
  assert.match(school, /arrayContains\(questions\.channels, \['class_game'\]\)/)
})
