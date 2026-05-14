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

test('scoreAttempt з порожніми відповідями дає 0', () => {
  const result = scoreAttempt([
    { id: 'q1', correct: 1, explanation: null },
    { id: 'q2', correct: 2, explanation: null },
  ], {})

  assert.equal(result.score, 0)
  assert.equal(result.results.q1.isCorrect, false)
  assert.equal(result.results.q2.isCorrect, false)
})

test('scoreAttempt всі правильні', () => {
  const result = scoreAttempt([
    { id: 'q1', correct: 1, explanation: null },
    { id: 'q2', correct: 3, explanation: null },
    { id: 'q3', correct: 2, explanation: 'пояснення' },
  ], { q1: 1, q2: 3, q3: 2 })

  assert.equal(result.score, 3)
  assert.ok(Object.values(result.results).every(r => r.isCorrect))
})

test('scoreAttempt з порожнім набором питань', () => {
  const result = scoreAttempt([], { q1: 1 })

  assert.equal(result.score, 0)
  assert.equal(Object.keys(result.results).length, 0)
})

test('scoreAttempt зберігає explanation у результаті', () => {
  const result = scoreAttempt([
    { id: 'q1', correct: 1, explanation: 'Тому що так' },
  ], { q1: 2 })

  assert.equal(result.results.q1.explanation, 'Тому що так')
  assert.equal(result.results.q1.isCorrect, false)
  assert.equal(result.results.q1.correct, 1)
})
