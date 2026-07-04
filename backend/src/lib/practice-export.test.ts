import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeForStaticBundle, groupByGrade, type ExportableQuestionRow } from './practice-export.js'

function row(overrides: Partial<ExportableQuestionRow> = {}): ExportableQuestionRow {
  return {
    id: 'q-1', q: '2+2?', code: null, type: 'choice', options: ['4', '5'],
    correct: 0, explanation: null, difficulty: 'easy', track: null, topic: null,
    grade: 1, isOlympiad: false,
    ...overrides,
  }
}

test('sanitizeForStaticBundle: олімпіадне питання валить експорт (fail closed)', () => {
  assert.throws(
    () => sanitizeForStaticBundle([row(), row({ id: 'q-2', isOlympiad: true })]),
    /не може потрапити/,
  )
})

test('sanitizeForStaticBundle: isOlympiad=false і null проходять, поле стрипається', () => {
  const out = sanitizeForStaticBundle([row(), row({ id: 'q-2', isOlympiad: null })])
  assert.equal(out.length, 2)
  for (const q of out) assert.equal('isOlympiad' in q, false)
})

test('sanitizeForStaticBundle: рядки без валідного grade пропускаються', () => {
  const out = sanitizeForStaticBundle([
    row(),
    row({ id: 'q-2', grade: null }),
    row({ id: 'q-3', grade: 7 }),
  ])
  assert.deepEqual(out.map(q => q.id), ['q-1'])
})

test('sanitizeForStaticBundle: сортує за id для стабільних диффів', () => {
  const out = sanitizeForStaticBundle([row({ id: 'b' }), row({ id: 'a' }), row({ id: 'c' })])
  assert.deepEqual(out.map(q => q.id), ['a', 'b', 'c'])
})

test('groupByGrade: завжди повертає всі 4 класи', () => {
  const grouped = groupByGrade(sanitizeForStaticBundle([row({ grade: 2 })]))
  assert.deepEqual([...grouped.keys()], [1, 2, 3, 4])
  assert.equal(grouped.get(2)!.length, 1)
  assert.equal(grouped.get(3)!.length, 0)
})
