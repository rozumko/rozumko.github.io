import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeLessonSlug, normalizeLessonStatus, normalizeLessonContent, lessonContentChanged,
} from './lesson-validation.js'

const validBody = {
  title: 'Демо-урок',
  cards: [
    { title: 'Картка', text: 'Текст картки', image: '/lessons/assets/x.svg', imageAlt: 'Alt' },
    { text: 'Без заголовка' },
  ],
  videoUrl: 'https://cdn.example.com/v.mp4',
  checkQuestions: [
    { question: 'Питання?', options: ['А', 'Б'], correct: 1, explanation: 'Бо так' },
  ],
}

test('slug: валідні приймаються, невалідні фейляться', () => {
  assert.equal(normalizeLessonSlug('info-senses-g2'), 'info-senses-g2')
  assert.equal(normalizeLessonSlug('a1'), 'a1')
  for (const bad of ['Info-Senses', 'умляут', 'a--b', '-lead', 'trail-', 'a b', '', 42, null, 'x'.repeat(70)]) {
    assert.throws(() => normalizeLessonSlug(bad), `slug "${String(bad)}" мав би падати`)
  }
})

test('status: лише draft/published/archived', () => {
  assert.equal(normalizeLessonStatus('published'), 'published')
  for (const bad of ['active', '', null, 1]) {
    assert.throws(() => normalizeLessonStatus(bad))
  }
})

test('контент: валідне тіло нормалізується з трімом', () => {
  const content = normalizeLessonContent({ ...validBody, title: '  Демо-урок  ' })
  assert.equal(content.title, 'Демо-урок')
  assert.equal(content.cards.length, 2)
  assert.equal(content.videoUrl, 'https://cdn.example.com/v.mp4')
  assert.equal(content.checkQuestions[0].correct, 1)
})

test('контент: fail-closed на битих полях (не мовчазне відкидання)', () => {
  assert.throws(() => normalizeLessonContent({ ...validBody, cards: [] }), /від 1 до/)
  assert.throws(() => normalizeLessonContent({ ...validBody, cards: [{ text: '' }] }), /обовʼязкове/)
  assert.throws(() => normalizeLessonContent({ ...validBody, title: '' }), /обовʼязкове/)
  assert.throws(() => normalizeLessonContent({
    ...validBody,
    checkQuestions: [{ question: 'Q?', options: ['А'], correct: 0 }],
  }), /від 2 до/)
  assert.throws(() => normalizeLessonContent({
    ...validBody,
    checkQuestions: [{ question: 'Q?', options: ['А', 'Б'], correct: 5 }],
  }), /існуючий варіант/)
})

test('медіа: http і javascript: URL відхиляються, https і відносні — ні', () => {
  assert.throws(() => normalizeLessonContent({ ...validBody, videoUrl: 'http://x.com/v.mp4' }), /https/)
  assert.throws(() => normalizeLessonContent({
    ...validBody,
    cards: [{ text: 'ok', image: 'javascript:alert(1)' }],
  }), /https|невалідний/)
  const relative = normalizeLessonContent({ ...validBody, cards: [{ text: 'ok', image: './a.svg' }], videoUrl: '' })
  assert.equal(relative.cards[0].image, './a.svg')
  assert.equal(relative.videoUrl, null)
})

test('lessonContentChanged: зміна контенту детектиться, ідентичний — ні', () => {
  const a = normalizeLessonContent(validBody)
  const same = normalizeLessonContent(JSON.parse(JSON.stringify(validBody)))
  assert.equal(lessonContentChanged(a, same), false)
  const edited = normalizeLessonContent({ ...validBody, title: 'Інша назва' })
  assert.equal(lessonContentChanged(a, edited), true)
})
