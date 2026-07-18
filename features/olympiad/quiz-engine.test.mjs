import test from 'node:test'
import assert from 'node:assert/strict'

import { getPublicQuestionRequest } from './public-question-policy.ts'

test('demo використовує лише тренувальний пул без ключів відповідей', () => {
  assert.deepEqual(getPublicQuestionRequest('demo', null), {
    isOlympiad: false,
    channel: 'path',
    difficulty: 'hard',
    hideAnswers: true,
  })
})

test('practice API fallback використовує тренувальний пул без ключів', () => {
  assert.deepEqual(getPublicQuestionRequest('practice', 'medium'), {
    isOlympiad: false,
    channel: 'olympiad_training',
    difficulty: 'medium',
    hideAnswers: true,
  })
})

test('офіційні питання не можна завантажити через публічний loader', () => {
  assert.throws(
    () => getPublicQuestionRequest('olympiad', null),
    /лише через код доступу/,
  )
})
