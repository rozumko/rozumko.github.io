import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { normalizeLesson } from './lesson-loader.ts'
import { PATHS_BY_GRADE } from '../path/path-data.ts'

const validRaw = {
  id: 'demo-lesson',
  version: 2,
  title: 'Демо-урок',
  cards: [
    { title: 'Картка 1', text: 'Текст першої картки', image: '/lessons/assets/demo.svg', imageAlt: 'Демо' },
    { text: 'Картка без заголовка' },
  ],
  videoUrl: 'https://cdn.example.com/lesson.mp4',
  check: [
    { question: 'Питання?', options: ['А', 'Б', 'В'], correct: 1, explanation: 'Бо так.' },
  ],
}

test('normalizeLesson: валідний урок проходить без втрат', () => {
  const lesson = normalizeLesson(validRaw, 'fallback-id')
  assert.ok(lesson)
  assert.equal(lesson.id, 'demo-lesson')
  assert.equal(lesson.version, 2)
  assert.equal(lesson.cards.length, 2)
  assert.equal(lesson.cards[0].image, '/lessons/assets/demo.svg')
  assert.equal(lesson.videoUrl, 'https://cdn.example.com/lesson.mp4')
  assert.equal(lesson.check.length, 1)
  assert.equal(lesson.check[0].correct, 1)
})

test('normalizeLesson: урок без карток невалідний', () => {
  assert.equal(normalizeLesson({ title: 'X', cards: [] }, 'id'), null)
  assert.equal(normalizeLesson({ title: 'X' }, 'id'), null)
  assert.equal(normalizeLesson(null, 'id'), null)
  assert.equal(normalizeLesson('строка', 'id'), null)
})

test('normalizeLesson: биті картки відкидаються, валідні лишаються', () => {
  const lesson = normalizeLesson({
    cards: [{ text: 'ok' }, { text: '' }, { title: 'без тексту' }, 'мотлох', null],
  }, 'id')
  assert.ok(lesson)
  assert.equal(lesson.cards.length, 1)
  assert.equal(lesson.cards[0].text, 'ok')
})

test('normalizeLesson: fallback для id, версії та заголовка', () => {
  const lesson = normalizeLesson({ cards: [{ text: 'ok' }], version: -3 }, 'from-path')
  assert.ok(lesson)
  assert.equal(lesson.id, 'from-path')
  assert.equal(lesson.version, 1)
  assert.equal(lesson.title, 'Урок')
  assert.deepEqual(lesson.check, [])
})

test('normalizeLesson: correct клампиться до меж options', () => {
  const lesson = normalizeLesson({
    cards: [{ text: 'ok' }],
    check: [
      { question: 'Q1?', options: ['А', 'Б'], correct: 99 },
      { question: 'Q2?', options: ['А', 'Б'], correct: -5 },
      { question: 'Q3?', options: ['А', 'Б'], correct: 1.5 },
    ],
  }, 'id')
  assert.ok(lesson)
  assert.equal(lesson.check[0].correct, 1)
  assert.equal(lesson.check[1].correct, 0)
  assert.equal(lesson.check[2].correct, 0)
})

test('normalizeLesson: питання без двох опцій або без тексту відкидається', () => {
  const lesson = normalizeLesson({
    cards: [{ text: 'ok' }],
    check: [
      { question: 'Одна опція?', options: ['А'], correct: 0 },
      { question: '', options: ['А', 'Б'], correct: 0 },
      { question: 'Опції-сміття', options: [1, null, 'Б'], correct: 0 },
    ],
  }, 'id')
  assert.ok(lesson)
  assert.equal(lesson.check.length, 0)
})

// Guard: кожен lessonId, на який посилається карта шляху, має існувати
// в public/lessons/ і проходити нормалізацію. Ловить одруки в lessonId
// і биті JSON до того, як їх побачить дитина.
test('усі lesson-кроки карт шляху мають валідний файл у public/lessons/', () => {
  for (const map of Object.values(PATHS_BY_GRADE)) {
    for (const point of map.points) {
      for (const step of point.activities) {
        if (step.activity.kind !== 'lesson') continue
        const { lessonId } = step.activity
        const url = new URL(`../../public/lessons/${lessonId}.json`, import.meta.url)
        let raw
        assert.doesNotThrow(() => {
          raw = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
        }, `Grade ${map.grade}, точка "${point.id}": файл уроку "${lessonId}" відсутній або битий JSON`)
        const lesson = normalizeLesson(raw, lessonId)
        assert.ok(lesson, `Grade ${map.grade}, точка "${point.id}": урок "${lessonId}" не проходить нормалізацію`)
        assert.equal(lesson.id, lessonId, `Урок "${lessonId}": поле id у файлі не збігається з іменем файлу`)
      }
    }
  }
})

test('normalizeLesson: небезпечні URL медіа відкидаються', () => {
  const lesson = normalizeLesson({
    cards: [
      { text: 'ok', image: 'javascript:alert(1)' },
      { text: 'ok2', image: 'http://insecure.example.com/x.png' },
      { text: 'ok3', image: './assets/local.svg' },
    ],
    videoUrl: 'data:text/html,<script>1</script>',
  }, 'id')
  assert.ok(lesson)
  assert.equal(lesson.cards[0].image, undefined)
  assert.equal(lesson.cards[1].image, undefined)
  assert.equal(lesson.cards[2].image, './assets/local.svg')
  assert.equal(lesson.videoUrl, undefined)
})
