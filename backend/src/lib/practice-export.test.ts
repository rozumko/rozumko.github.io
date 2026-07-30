import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeForStaticBundle, groupByGrade, type ExportableQuestionRow } from './practice-export.js'

function row(overrides: Partial<ExportableQuestionRow> = {}): ExportableQuestionRow {
  return {
    id: 'q-1', q: '2+2?', code: null, type: 'choice', options: ['4', '5'],
    correct: 0, explanation: null, difficulty: 'easy', track: null, topic: null,
    img: null, imageAlt: null, conceptKey: null, progressionBand: null, version: 1,
    grade: 1, isOlympiad: false, channels: ['olympiad_training'], meta: null,
    ...overrides,
  }
}

test('sanitizeForStaticBundle: олімпіадне питання валить експорт (fail closed)', () => {
  assert.throws(
    () => sanitizeForStaticBundle([row(), row({ id: 'q-2', isOlympiad: true })]),
    /not explicitly marked as training/,
  )
})

test('sanitizeForStaticBundle: only explicit isOlympiad=false passes and the field is stripped', () => {
  const out = sanitizeForStaticBundle([row()])
  assert.equal(out.length, 1)
  for (const q of out) {
    assert.equal('isOlympiad' in q, false)
    assert.equal('channels' in q, false)
  }
})

test('sanitizeForStaticBundle: legacy null isOlympiad fails closed', () => {
  const legacy = { ...row(), isOlympiad: null } as unknown as ExportableQuestionRow
  assert.throws(() => sanitizeForStaticBundle([legacy]), /not explicitly marked as training/)
})

test('sanitizeForStaticBundle: question outside olympiad_training fails closed', () => {
  assert.throws(() => sanitizeForStaticBundle([row({ channels: ['path'] })]), /olympiad_training/)
})

test('sanitizeForStaticBundle: a server-scored demo question fails the export closed', () => {
  assert.throws(
    () => sanitizeForStaticBundle([
      row(),
      row({ id: 'q-2', meta: { purpose: 'olympiad-demo', slotId: 'g1-demo-01' } }),
    ]),
    /server-scored olympiad demo/,
  )
})

test('sanitizeForStaticBundle: editorial metadata never reaches the static bundle', () => {
  const out = sanitizeForStaticBundle([row({ meta: { source: 'authored', templateId: 'g1-t01' } })])
  assert.equal(out.length, 1)
  assert.equal('meta' in out[0]!, false)
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
