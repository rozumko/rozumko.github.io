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

  const multi = stripOptionKeys({ choices: ['A', 'B', 'C'], correctAnswers: [0, 2] }) as Record<string, unknown>
  assert.deepEqual(multi, { choices: ['A', 'B', 'C'] })
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

// Defence in depth: every call site currently projects the answer columns away
// in its SELECT, so this never fires in production today. It exists so that
// adding `explanation: questions.explanation` to one query — the kind of change
// that looks harmless in review — cannot leak answer keys to a child's browser.
test('sanitizeOlympiadQuestion drops top-level correct and explanation columns', () => {
  const leaked = sanitizeOlympiadQuestion({
    id: 'q1',
    q: '2 + 2?',
    type: 'choice',
    options: ['4', '5'],
    correct: 0,
    explanation: 'Basic addition',
  } as Record<string, unknown> & { options: unknown })

  assert.equal('correct' in leaked, false)
  assert.equal('explanation' in leaked, false)
  assert.equal(leaked.q, '2 + 2?')
  assert.deepEqual(leaked.options, ['4', '5'])
})

test('sanitizeOlympiadQuestion strips answer keys nested in options at the same time', () => {
  const leaked = sanitizeOlympiadQuestion({
    id: 'q2',
    type: 'sort',
    options: { items: ['a', 'b'], correctOrder: [1, 0] },
    correct: null,
  } as Record<string, unknown> & { options: unknown })

  assert.equal('correct' in leaked, false)
  assert.deepEqual(leaked.options, { items: ['a', 'b'] })
})

test('sanitizeOlympiadQuestion exposes only the safe image role from editorial metadata', () => {
  const sanitized = sanitizeOlympiadQuestion({
    id: 'q3',
    q: 'Follow the route shown in the grid.',
    type: 'choice',
    options: ['A', 'B'],
    img: '/questions/route-grid.webp',
    imageAlt: 'A labelled route grid',
    meta: {
      imageRole: 'essential',
      estimatedSeconds: 75,
      templateId: 'private-template-id',
      internalNote: 'editor only',
    },
  })

  assert.equal(sanitized.img, '/questions/route-grid.webp')
  assert.equal(sanitized.imageAlt, 'A labelled route grid')
  assert.equal((sanitized as Record<string, unknown>).imageRole, 'essential')
  assert.equal('meta' in sanitized, false)
})
