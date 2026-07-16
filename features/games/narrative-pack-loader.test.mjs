import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeScenarioPack, normalizeSequencePack } from './narrative-pack-loader.ts'

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
