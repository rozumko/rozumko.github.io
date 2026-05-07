import test from 'node:test'
import assert from 'node:assert/strict'
import { isQuestionInAttempt, scoreAttempt } from './attempt-validation.js'

test('isQuestionInAttempt accepts only issued questions', () => {
  assert.equal(isQuestionInAttempt('q1', ['q1', 'q2']), true)
  assert.equal(isQuestionInAttempt('q3', ['q1', 'q2']), false)
})

test('scoreAttempt counts unanswered issued questions as incorrect', () => {
  const result = scoreAttempt([
    { id: 'q1', correct: 1, explanation: 'ok' },
    { id: 'q2', correct: 2, explanation: null },
  ], {
    q1: 1,
  })

  assert.equal(result.score, 1)
  assert.equal(result.results.q1.isCorrect, true)
  assert.equal(result.results.q2.isCorrect, false)
})

test('scoreAttempt ignores answers for questions outside the attempt', () => {
  const result = scoreAttempt([
    { id: 'q1', correct: 1, explanation: null },
  ], {
    q1: 1,
    q999: 0,
  })

  assert.equal(result.score, 1)
  assert.equal(Object.keys(result.results).length, 1)
})
