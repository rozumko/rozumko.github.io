import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSortingPack } from './sorting-pack-loader.ts'

test('sorting pack accepts a complete versioned level', () => {
  const levels = normalizeSortingPack({
    gameKey: 'demo', version: 2,
    levels: [{ instruction: 'Розклади', bins: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      items: [{ emoji: '1️⃣', bin: 'a' }, { emoji: '2️⃣', label: 'Два', bin: 'b' }] }],
  }, 'demo')
  assert.equal(levels?.[0].items.length, 2)
})

test('sorting pack rejects a wrong key and incomplete classification', () => {
  const raw = { gameKey: 'other', version: 1, levels: [] }
  assert.equal(normalizeSortingPack(raw, 'demo'), null)
  assert.equal(normalizeSortingPack({
    gameKey: 'demo', version: 1,
    levels: [{ instruction: 'Розклади', bins: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      items: [{ emoji: '1️⃣', bin: 'a' }, { emoji: '2️⃣', bin: 'a' }] }],
  }, 'demo'), null)
})
