import test from 'node:test'
import assert from 'node:assert/strict'
import { validateQuestionShape } from './question-input-validation.js'

test('choice: валідне', () => {
  const r = validateQuestionShape('choice', ['А','Б','В'], 1)
  assert.equal(r.correct, 1)
})
test('choice: correct поза межами', () => {
  assert.throws(() => validateQuestionShape('choice', ['А','Б'], 5), /індекс/)
})
test('choice: <2 варіантів', () => {
  assert.throws(() => validateQuestionShape('choice', ['А'], 0), /2/)
})

test('multi-select normalizes a valid answer key', () => {
  const result = validateQuestionShape(
    'multi_select',
    { choices: ['A', 'B', 'C', 'D'], correctAnswers: [2, 0] },
    null,
  )
  assert.deepEqual((result.options as any).correctAnswers, [0, 2])
})

test('multi-select requires at least two correct and one incorrect option', () => {
  assert.throws(
    () => validateQuestionShape('multi_select', { choices: ['A', 'B', 'C'], correctAnswers: [0] }, null),
    /2 правильні/,
  )
  assert.throws(
    () => validateQuestionShape('multi_select', { choices: ['A', 'B', 'C'], correctAnswers: [0, 1, 2] }, null),
    /1 неправильний/,
  )
})

test('multi-select rejects duplicate or out-of-range answer indexes', () => {
  assert.throws(
    () => validateQuestionShape('multi_select', { choices: ['A', 'B', 'C'], correctAnswers: [0, 0] }, null),
    /повтори/,
  )
  assert.throws(
    () => validateQuestionShape('multi_select', { choices: ['A', 'B', 'C'], correctAnswers: [0, 4] }, null),
    /індексами/,
  )
})

test('truefalse: correct 0/1', () => {
  assert.equal(validateQuestionShape('truefalse', null, 0).correct, 0)
  assert.equal(validateQuestionShape('truefalse', null, 1).correct, 1)
  assert.throws(() => validateQuestionShape('truefalse', null, 2), /0.*1/)
})

test('sequence: валідне', () => {
  const r = validateQuestionShape('sequence', { given: ['🔴','🔵'], choices: ['🔴','🔵','🟢'] }, 1)
  assert.equal(r.correct, 1)
})
test('sequence: correct поза межами', () => {
  assert.throws(() => validateQuestionShape('sequence', { given: ['x'], choices: ['a','b'] }, 9), /індекс/)
})
test('sequence: без choices', () => {
  assert.throws(() => validateQuestionShape('sequence', { given: ['x'] }, 0), /choices|варіант/)
})

test('sort: валідна перестановка', () => {
  const r = validateQuestionShape('sort', { items: ['a','b','c'], correctOrder: [2,0,1] }, null)
  assert.deepEqual((r.options as any).correctOrder, [2,0,1])
})
test('sort: не перестановка', () => {
  assert.throws(() => validateQuestionShape('sort', { items: ['a','b','c'], correctOrder: [0,0,1] }, null), /перестанов/)
})
test('sort: correct не null', () => {
  assert.throws(() => validateQuestionShape('sort', { items: ['a','b'], correctOrder: [1,0] }, 0), /null/)
})
test('sort: не більше 20 елементів', () => {
  const items = Array.from({ length: 21 }, (_, i) => String(i))
  assert.throws(() => validateQuestionShape('sort', { items, correctOrder: items.map((_, i) => i) }, null), /20/)
})

test('match: валідне', () => {
  const r = validateQuestionShape('match', { left: ['x','y'], right: ['1','2'], pairs: [1,0] }, null)
  assert.deepEqual((r.options as any).pairs, [1,0])
})
test('match: pairs не тієї довжини', () => {
  assert.throws(() => validateQuestionShape('match', { left: ['x','y'], right: ['1','2'], pairs: [0] }, null), /pairs/)
})
test('match: pairs індекс поза межами', () => {
  assert.throws(() => validateQuestionShape('match', { left: ['x'], right: ['1'], pairs: [5] }, null), /pairs/)
})
test('match: праві значення мають бути унікальними', () => {
  assert.throws(() => validateQuestionShape('match', { left: ['x'], right: ['1','1'], pairs: [1] }, null), /унікальними/)
})

test('input: число', () => {
  const r = validateQuestionShape('input', { answer: 42, inputType: 'number' }, null)
  assert.equal((r.options as any).answer, 42)
  assert.equal((r.options as any).inputType, 'number')
})
test('input: текст за замовч.', () => {
  const r = validateQuestionShape('input', { answer: 'Кіт' }, null)
  assert.equal((r.options as any).inputType, 'text')
})
test('input: без answer', () => {
  assert.throws(() => validateQuestionShape('input', {}, null), /answer|відповід/)
})
test('input: correct не null', () => {
  assert.throws(() => validateQuestionShape('input', { answer: 'x' }, 0), /null/)
})

test('невідомий тип', () => {
  assert.throws(() => validateQuestionShape('foo' as any, [], 0), /Невідомий тип/)
})
