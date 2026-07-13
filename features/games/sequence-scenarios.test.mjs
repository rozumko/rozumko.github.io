import test from 'node:test'
import assert from 'node:assert/strict'

import { SEQUENCE_SETS_G2 } from './sequence-data.ts'
import { SCENARIOS_DIGITAL_SAFETY } from './scenarios-data.ts'
import { shuffledOrder, starsFor } from './round-utils.ts'

// Структурні валідатори контенту: биті набори мають падати в CI,
// а не показувати дитині нерозв'язну гру.

test('sequence: кожен набір має 3–5 унікальних непорожніх кроків і унікальний id', () => {
  const ids = new Set()
  for (const set of SEQUENCE_SETS_G2) {
    assert.ok(set.id && !ids.has(set.id), `Дубль або порожній id: ${set.id}`)
    ids.add(set.id)
    assert.ok(set.title.trim(), `Набір ${set.id}: порожній title`)
    assert.ok(set.steps.length >= 3 && set.steps.length <= 5,
      `Набір ${set.id}: ${set.steps.length} кроків (треба 3–5)`)
    const unique = new Set(set.steps.map(s => s.trim()))
    assert.equal(unique.size, set.steps.length, `Набір ${set.id}: кроки повторюються`)
    assert.ok(set.steps.every(s => s.trim().length > 0), `Набір ${set.id}: порожній крок`)
  }
})

test('scenarios: рівно один правильний варіант, всюди є фідбек', () => {
  const ids = new Set()
  for (const item of SCENARIOS_DIGITAL_SAFETY) {
    assert.ok(item.id && !ids.has(item.id), `Дубль або порожній id: ${item.id}`)
    ids.add(item.id)
    assert.ok(item.text.trim(), `Ситуація ${item.id}: порожній текст`)
    assert.ok(item.options.length >= 2, `Ситуація ${item.id}: менше 2 варіантів`)
    const correct = item.options.filter(o => o.correct)
    assert.equal(correct.length, 1, `Ситуація ${item.id}: правильних варіантів ${correct.length}, треба рівно 1`)
    for (const option of item.options) {
      assert.ok(option.label.trim(), `Ситуація ${item.id}: порожній варіант`)
      assert.ok(option.feedback.trim(), `Ситуація ${item.id}: варіант без фідбеку`)
    }
    const labels = new Set(item.options.map(o => o.label))
    assert.equal(labels.size, item.options.length,
      `Ситуація ${item.id}: варіанти повторюються (гра шукає правильну кнопку за текстом)`)
  }
})

test('shuffledOrder: ніколи не повертає правильний порядок і містить всі індекси', () => {
  for (let run = 0; run < 50; run++) {
    const order = shuffledOrder(4)
    assert.equal(order.length, 4)
    assert.deepEqual([...order].sort(), [0, 1, 2, 3])
    assert.ok(!order.every((v, i) => v === i), 'Стартовий порядок збігся з правильним')
  }
  assert.deepEqual(shuffledOrder(1), [0])
  assert.deepEqual(shuffledOrder(0), [])
})

test('starsFor: пороги 100% → 3, ≥75% → 2, інакше 1', () => {
  assert.equal(starsFor(3, 3), 3)
  assert.equal(starsFor(3, 4), 2)
  assert.equal(starsFor(1, 3), 1)
  assert.equal(starsFor(0, 3), 1)
})
