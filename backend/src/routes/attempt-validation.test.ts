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

test('scoreAttempt зберігає explanation у результаті (hideKeys=false для тренувального режиму)', () => {
  // hideKeys=false — тренувальний режим, ключі відповідей дозволені
  const result = scoreAttempt([
    { id: 'q1', correct: 1, explanation: 'Тому що так' },
  ], { q1: 2 }, false)

  assert.equal(result.results.q1.explanation, 'Тому що так')
  assert.equal(result.results.q1.isCorrect, false)
  assert.equal(result.results.q1.correct, 1)
})

// ── Нові типи: sort / match / input / sequence ───────────────

test('scoreAttempt: sort — масив у правильному порядку', () => {
  const qs = [{ id: 'q1', type: 'sort', correct: null, explanation: null, options: { items: ['a','b','c'], correctOrder: [2,0,1] } }]
  assert.equal(scoreAttempt(qs, { q1: [2,0,1] }).score, 1)
  assert.equal(scoreAttempt(qs, { q1: [0,1,2] }).score, 0)
  assert.equal(scoreAttempt(qs, { q1: [2,0] }).score, 0)      // неповний
  assert.equal(scoreAttempt(qs, { q1: 0 as any }).score, 0)   // не масив
})

test('scoreAttempt: match — масив пар правого стовпця', () => {
  const qs = [{ id: 'q1', type: 'match', correct: null, explanation: null, options: { left: ['x','y'], right: ['1','2'], pairs: [1,0] } }]
  assert.equal(scoreAttempt(qs, { q1: [1,0] }).score, 1)
  assert.equal(scoreAttempt(qs, { q1: [0,1] }).score, 0)
})

test('scoreAttempt: input — число з допуском і текст без регістру', () => {
  const numQ = [{ id: 'q1', type: 'input', correct: null, explanation: null, options: { answer: 42, inputType: 'number' } }]
  assert.equal(scoreAttempt(numQ, { q1: '42' }).score, 1)
  assert.equal(scoreAttempt(numQ, { q1: 42 }).score, 1)
  assert.equal(scoreAttempt(numQ, { q1: '43' }).score, 0)

  const txtQ = [{ id: 'q1', type: 'input', correct: null, explanation: null, options: { answer: 'Клавіатура' } }]
  assert.equal(scoreAttempt(txtQ, { q1: '  клавіатура ' }).score, 1)
  assert.equal(scoreAttempt(txtQ, { q1: 'миша' }).score, 0)
})

test('scoreAttempt: sequence — integer-індекс у correct', () => {
  const qs = [{ id: 'q1', type: 'sequence', correct: 2, explanation: null, options: { given: ['🔴'], choices: ['a','b','c'] } }]
  assert.equal(scoreAttempt(qs, { q1: 2 }).score, 1)
  assert.equal(scoreAttempt(qs, { q1: 1 }).score, 0)
})

test('scoreAttempt: невідповідний тип відповіді не падає', () => {
  const qs = [{ id: 'q1', type: 'sort', correct: null, explanation: null, options: { correctOrder: [0,1] } }]
  assert.doesNotThrow(() => scoreAttempt(qs, { q1: 'не масив' }))
  assert.equal(scoreAttempt(qs, { q1: 'не масив' }).score, 0)
})
