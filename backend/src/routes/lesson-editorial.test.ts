import assert from 'node:assert/strict'
import test from 'node:test'
import { contentFromLessonRevision, lessonPublishedSnapshot, lessonRevisionSnapshot, normalizeLessonEditorialStatus } from './lesson-editorial.js'

const content = {
  title: 'Алгоритм', cards: [{ text: 'Крок за кроком' }], videoUrl: null,
  checkQuestions: [{ question: 'Що спочатку?', options: ['А', 'Б'], correct: 0 }],
}

test('lesson editorial statuses include review and fail closed', () => {
  assert.equal(normalizeLessonEditorialStatus('review'), 'review')
  assert.throws(() => normalizeLessonEditorialStatus('active'), /статус/)
})

test('published lesson snapshot is a complete immutable delivery object', () => {
  assert.deepEqual(lessonPublishedSnapshot('lesson-g2', 3, content), { id: 'lesson-g2', version: 3, ...content })
})

test('lesson revision restores validated content and serializes dates', () => {
  assert.deepEqual(contentFromLessonRevision(content), content)
  assert.equal(lessonRevisionSnapshot({ updatedAt: new Date('2026-07-16T10:00:00Z') }).updatedAt, '2026-07-16T10:00:00.000Z')
})
