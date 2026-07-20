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
