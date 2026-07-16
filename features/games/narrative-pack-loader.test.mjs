import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFactOpinionPack, normalizeScenarioPack, normalizeSequencePack } from './narrative-pack-loader.ts'

test('sequence pack validates ordered unique steps', () => {
  assert.equal(normalizeSequencePack({ gameKey: 'demo', version: 1, sets: [{
    id: 'tea', title: 'Чай', steps: ['Налити', 'Нагріти', 'Заварити'],
  }] }, 'demo')?.length, 1)
  assert.equal(normalizeSequencePack({ gameKey: 'demo', version: 1, sets: [{
    id: 'tea', title: 'Чай', steps: ['Крок', 'Крок', 'Фініш'],
  }] }, 'demo'), null)
})

test('scenario pack requires one correct option and complete feedback', () => {
  const base = { gameKey: 'demo', version: 1, items: [{ id: 'one', emoji: '💬', text: 'Що робити?', options: [
    { label: 'A', correct: true, feedback: 'Так' }, { label: 'B', correct: false, feedback: 'Ні' },
  ] }] }
  assert.equal(normalizeScenarioPack(base, 'demo')?.length, 1)
  base.items[0].options[1].correct = true
  assert.equal(normalizeScenarioPack(base, 'demo'), null)
})

test('fact-opinion pack requires balanced categories and https-only sources', () => {
  const statements = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `fact-${i + 1}`, category: 'fact', text: `Факт ${i + 1}`, explanation: 'Можна перевірити.' })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `opinion-${i + 1}`, category: 'opinion', text: `Думка ${i + 1}`, explanation: 'Особиста оцінка.' })),
  ]
  assert.equal(normalizeFactOpinionPack({ gameKey: 'level1', version: 1, statements }, 'level1')?.length, 10)
  assert.equal(normalizeFactOpinionPack({ gameKey: 'other', version: 1, statements }, 'level1'), null)
  const httpSource = statements.map((s, i) => i === 0 ? { ...s, sourceTitle: 'Джерело', sourceUrl: 'http://example.com' } : s)
  assert.equal(normalizeFactOpinionPack({ gameKey: 'level1', version: 1, statements: httpSource }, 'level1'), null)
  const singleCategory = statements.map(s => ({ ...s, category: 'fact' }))
  assert.equal(normalizeFactOpinionPack({ gameKey: 'level1', version: 1, statements: singleCategory }, 'level1'), null)
})
