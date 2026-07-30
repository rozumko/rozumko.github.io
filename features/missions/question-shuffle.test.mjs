import test from 'node:test'
import assert from 'node:assert/strict'
import { shuffleDeck } from './question-shuffle.ts'

const makeQuestions = () => [
  { id: 'q1', type: 'choice', options: ['A', 'B', 'C', 'D'], a: ['A', 'B', 'C', 'D'] },
  { id: 'q2', type: 'truefalse', options: [] },
  { id: 'q3', type: 'sequence', choices: ['1', '2', '3', '4'], given: ['x'] },
  { id: 'q4', type: 'input' },
  { id: 'q5', type: 'choice', options: ['П', 'Р', 'О'], a: ['П', 'Р', 'О'] },
]

test('shuffleDeck: детермінований для одного seed', () => {
  const a = shuffleDeck(makeQuestions(), 'participant-1')
  const b = shuffleDeck(makeQuestions(), 'participant-1')
  assert.deepEqual(a.questions, b.questions)
})

test('shuffleDeck: різні учасники — різний порядок (відомі сіди)', () => {
  const ids = ['p-a', 'p-b', 'p-c', 'p-d', 'p-e']
  const orders = new Set(ids.map(id =>
    shuffleDeck(makeQuestions(), id).questions.map(q => q.id).join(',')
  ))
  assert.ok(orders.size > 1, 'усі 5 сідів дали однаковий порядок — PRNG зламано')
})

test('shuffleDeck: зберігає всі питання без втрат і дублів', () => {
  const deck = shuffleDeck(makeQuestions(), 'seed')
  assert.deepEqual(deck.questions.map(q => q.id).sort(), ['q1', 'q2', 'q3', 'q4', 'q5'])
})

test('shuffleDeck: toOriginalAnswer вертає індекс оригінального варіанта', () => {
  const original = makeQuestions()
  const deck = shuffleDeck(original, 'any-participant')
  for (const q of deck.questions) {
    const src = original.find(o => o.id === q.id)
    const list = q.type === 'sequence' ? q.choices : q.options
    const srcList = q.type === 'sequence' ? src.choices : src.options
    if (!Array.isArray(list) || list.length < 2 || q.type === 'truefalse') continue
    list.forEach((text, shuffledIdx) => {
      const originalIdx = deck.toOriginalAnswer(q.id, shuffledIdx)
      assert.equal(srcList[originalIdx], text)
    })
  }
})

test('shuffleDeck: truefalse та нечислові відповіді проходять без змін', () => {
  const deck = shuffleDeck(makeQuestions(), 'seed')
  assert.equal(deck.toOriginalAnswer('q2', 1), 1)
  assert.equal(deck.toOriginalAnswer('q4', 'сім'), 'сім')
  assert.deepEqual(deck.toOriginalAnswer('missing', [2, 0, 1]), [2, 0, 1])
})

test('shuffleDeck: локальний correct переїжджає разом із варіантом', () => {
  const qs = [{ id: 'p1', type: 'choice', options: ['A', 'B', 'C', 'D'], a: ['A', 'B', 'C', 'D'], correct: 2 }]
  const deck = shuffleDeck(qs, 'practice-seed')
  const q = deck.questions[0]
  assert.equal(q.options[q.correct], 'C')
})

test('shuffleDeck maps multi-select answers back to original option indexes', () => {
  const original = [{
    id: 'multi',
    type: 'multi_select',
    options: { choices: ['A', 'B', 'C', 'D'], correctAnswers: [0, 2] },
    choices: ['A', 'B', 'C', 'D'],
    correctAnswers: [0, 2],
  }]
  const deck = shuffleDeck(original, 'multi-seed')
  const question = deck.questions[0]
  const selected = question.correctAnswers
  const mapped = deck.toOriginalAnswer(question.id, selected)
  assert.deepEqual(mapped, [0, 2])
  assert.deepEqual(selected.map(index => question.choices[index]).sort(), ['A', 'C'])
})
