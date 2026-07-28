import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SORTING_STATION_BANNED_EMOJI,
  binIdForItem,
  generateSortingStationSet,
} from './sorting-station-data.ts'

const difficulties = ['easy', 'medium', 'hard']

test('sorting station uses stable CSS shapes for grade 1 shape-color tasks', () => {
  for (const difficulty of difficulties) {
    const set = generateSortingStationSet(1, difficulty)
    assert.equal(set.axes[0].id, 'color')
    assert.equal(set.axes[1].id, 'shape')
    assert.ok(set.items.every(item => item.visual.kind === 'shape'))
  }
})

test('sorting station item counts grow with difficulty', () => {
  assert.equal(generateSortingStationSet(2, 'easy').items.length, 8)
  assert.equal(generateSortingStationSet(2, 'medium').items.length, 10)
  assert.equal(generateSortingStationSet(2, 'hard').items.length, 12)
  assert.equal(generateSortingStationSet(4, 'hard').items.length, 12)
})

test('sorting station avoids banned ambiguous emoji', () => {
  for (const grade of [1, 2, 3, 4]) {
    for (const difficulty of difficulties) {
      const set = generateSortingStationSet(grade, difficulty)
      for (const item of set.items) {
        if (item.visual.kind === 'emoji') {
          assert.ok(!SORTING_STATION_BANNED_EMOJI.includes(item.visual.emoji), `${item.id} uses banned emoji`)
        }
      }
    }
  }
})

test('sorting station every item resolves to one visible grid cell', () => {
  for (const grade of [1, 2, 3, 4]) {
    for (const difficulty of difficulties) {
      const set = generateSortingStationSet(grade, difficulty)
      const visibleBins = new Set(
        set.axes[0].values.flatMap(row => set.axes[1].values.map(col => `${row.id}:${col.id}`)),
      )
      for (const item of set.items) {
        assert.ok(visibleBins.has(binIdForItem(set, item)), `${item.id} has no visible bin`)
      }
    }
  }
})

test('sorting station grades 3 and 4 use device role plus data type scenarios', () => {
  for (const grade of [3, 4]) {
    const set = generateSortingStationSet(grade, 'hard')
    assert.deepEqual(set.axes.map(axis => axis.id), ['role', 'data'])
    assert.ok(set.items.some(item => item.traits.role === 'input' && item.traits.data === 'image'))
    assert.ok(set.items.some(item => item.traits.role === 'output' && item.traits.data === 'sound'))
    assert.ok(set.items.every(item => item.label.split(' ').length >= 3))
  }
})
