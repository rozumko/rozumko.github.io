import test from 'node:test'
import assert from 'node:assert/strict'
import { practiceFilterPlan } from './home-validation.js'

// Regression guard для product-boundary багу (M-3): раніше маршрут мав
// `track && !difficulty`, тож платний Club-запит track=X&difficulty=hard
// мовчки віддавав питання з ЧУЖИХ треків. track має фільтруватися ЗАВЖДИ.

test('practiceFilterPlan: track фільтрується навіть разом із difficulty (Club не змішує треки)', () => {
  const plan = practiceFilterPlan({ grade: 2, track: 'ai-basics', difficulty: 'hard' })
  assert.ok(
    plan.some(f => f.column === 'track' && f.value === 'ai-basics'),
    'track має лишатися у фільтрах разом із difficulty',
  )
  assert.ok(plan.some(f => f.column === 'difficulty' && f.value === 'hard'))
})

test('practiceFilterPlan: завжди обмежує тренувальний пул (isOlympiad=false) і grade', () => {
  const plan = practiceFilterPlan({ grade: 3 })
  assert.ok(plan.some(f => f.column === 'isOlympiad' && f.value === false))
  assert.ok(plan.some(f => f.column === 'grade' && f.value === 3))
})

test('practiceFilterPlan: без track/difficulty — лише базові фільтри (isOlympiad+grade)', () => {
  const plan = practiceFilterPlan({ grade: 1 })
  assert.equal(plan.length, 2)
  assert.ok(!plan.some(f => f.column === 'track'))
  assert.ok(!plan.some(f => f.column === 'difficulty'))
})

test('practiceFilterPlan: лише track (демо-стиль) — track присутній, difficulty відсутній', () => {
  const plan = practiceFilterPlan({ grade: 2, track: 'informatics' })
  assert.ok(plan.some(f => f.column === 'track' && f.value === 'informatics'))
  assert.ok(!plan.some(f => f.column === 'difficulty'))
})

test('practiceFilterPlan: порожній/undefined track не додає фільтр треку', () => {
  assert.ok(!practiceFilterPlan({ grade: 2, track: null }).some(f => f.column === 'track'))
  assert.ok(!practiceFilterPlan({ grade: 2, track: '' }).some(f => f.column === 'track'))
})
