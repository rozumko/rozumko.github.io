import test from 'node:test'
import assert from 'node:assert/strict'

import { getPublicQuestionRequest } from './public-question-policy.ts'

test('demo використовує лише тренувальний пул без ключів відповідей', () => {
  assert.deepEqual(getPublicQuestionRequest('demo', null), {
    isOlympiad: false,
    difficulty: 'hard',
    hideAnswers: true,
  })
})

test('practice використовує тренувальний пул з локальним feedback', () => {
  assert.deepEqual(getPublicQuestionRequest('practice', 'medium'), {
    isOlympiad: false,
    difficulty: 'medium',
    hideAnswers: false,
  })
})

test('офіційні питання не можна завантажити через публічний loader', () => {
  assert.throws(
    () => getPublicQuestionRequest('olympiad', null),
    /лише через код доступу/,
  )
})
