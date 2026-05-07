import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertQuestionsBelongToGrade,
  normalizeEventQuestionSelection,
} from './event-questions-validation.js'

const ID_1 = '11111111-1111-4111-8111-111111111111'
const ID_2 = '22222222-2222-4222-8222-222222222222'

test('normalizeEventQuestionSelection accepts a valid selection', () => {
  const selection = normalizeEventQuestionSelection({
    grade: 2,
    questionIds: [ID_1, ID_2],
  })

  assert.equal(selection.grade, 2)
  assert.deepEqual(selection.questionIds, [ID_1, ID_2])
})

test('normalizeEventQuestionSelection rejects duplicate question ids', () => {
  assert.throws(
    () => normalizeEventQuestionSelection({ grade: 1, questionIds: [ID_1, ID_1] }),
    /не повинні повторюватися/
  )
})

test('normalizeEventQuestionSelection rejects invalid grade', () => {
  assert.throws(
    () => normalizeEventQuestionSelection({ grade: 5, questionIds: [] }),
    /Клас/
  )
})

test('normalizeEventQuestionSelection rejects invalid uuid', () => {
  assert.throws(
    () => normalizeEventQuestionSelection({ grade: 1, questionIds: ['bad-id'] }),
    /id питання/
  )
})

test('assertQuestionsBelongToGrade rejects missing questions', () => {
  assert.throws(
    () => assertQuestionsBelongToGrade([ID_1, ID_2], [{ id: ID_1, grade: 1 }], 1),
    /не знайдено/
  )
})

test('assertQuestionsBelongToGrade rejects questions from another grade', () => {
  assert.throws(
    () => assertQuestionsBelongToGrade([ID_1], [{ id: ID_1, grade: 2 }], 1),
    /не з цього класу/
  )
})
