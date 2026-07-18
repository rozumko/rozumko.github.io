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
