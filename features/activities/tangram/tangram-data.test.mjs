import assert from 'node:assert/strict'
import test from 'node:test'
import { TANGRAM_PIECES, TANGRAM_PUZZLES } from './tangram-data.ts'

test('every silhouette uses all seven tangram pieces', () => {
  const requiredFamilies = TANGRAM_PIECES.map(piece => piece.family).sort()
  for (const puzzle of TANGRAM_PUZZLES) {
    assert.equal(puzzle.targets.length, 7)
    assert.deepEqual(puzzle.targets.map(target => target.family).sort(), requiredFamilies)
    assert.equal(new Set(puzzle.targets.map(target => target.id)).size, 7)
    for (const target of puzzle.targets) {
      assert.equal(target.angle % 45, 0)
      assert.ok(target.x >= 350 && target.x <= 850)
      assert.ok(target.y >= 20 && target.y <= 480)
    }
  }
})
