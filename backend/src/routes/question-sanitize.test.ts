import test from 'node:test'
import assert from 'node:assert/strict'
import { stripOptionKeys, sanitizeOlympiadQuestion } from './question-sanitize.js'

test('stripOptionKeys прибирає correctOrder/pairs/answer, лишає решту', () => {
  const sort = stripOptionKeys({ items: ['a','b'], correctOrder: [1,0] }) as Record<string, unknown>
  assert.deepEqual(sort, { items: ['a','b'] })
  assert.equal('correctOrder' in sort, false)

  const match = stripOptionKeys({ left: ['x'], right: ['1'], pairs: [0] }) as Record<string, unknown>
  assert.deepEqual(match, { left: ['x'], right: ['1'] })

  const input = stripOptionKeys({ answer: 42, inputType: 'number' }) as Record<string, unknown>
  assert.deepEqual(input, { inputType: 'number' })
})

test('stripOptionKeys не чіпає масив (choice options) і null', () => {
  assert.deepEqual(stripOptionKeys(['А','Б','В']), ['А','Б','В'])
  assert.equal(stripOptionKeys(null), null)
})

test('sanitizeOlympiadQuestion стрипає лише options, лишає інші поля', () => {
  const q = { id: 'q1', q: 'текст', type: 'sort', options: { items: ['a'], correctOrder: [0] } }
  const s = sanitizeOlympiadQuestion(q)
  assert.equal(s.id, 'q1')
  assert.equal(s.q, 'текст')
  assert.equal((s.options as Record<string, unknown>)['correctOrder'], undefined)
  assert.deepEqual((s.options as Record<string, unknown>)['items'], ['a'])
})
