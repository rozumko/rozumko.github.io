import assert from 'node:assert/strict'
import test from 'node:test'
import { ROUND_SIZE, WORDS_LEVEL_IDS, resolveWordsLevel } from './typing-words-data.ts'
import { buildRound } from '../typing-core/round.ts'

// The level id carries two decisions at once (what to type, how long the items
// are), so a typo in the id must not silently hand the class the wrong pool.

test('every offered level resolves to a pool big enough for one round', () => {
  for (const id of WORDS_LEVEL_IDS) {
    const level = resolveWordsLevel(id)
    assert.ok(level.items.length >= 10, `pool ${id} is too small: ${level.items.length}`)
    assert.equal(buildRound(level.items, ROUND_SIZE[level.mode]).length, ROUND_SIZE[level.mode])
  }
})

test('the composite level id maps to the mode and the difficulty', () => {
  assert.deepEqual(
    WORDS_LEVEL_IDS.map(id => `${resolveWordsLevel(id).mode}/${resolveWordsLevel(id).difficulty}`),
    ['words/easy', 'words/medium', 'words/hard', 'sentences/easy', 'sentences/medium', 'sentences/hard'],
  )
})

test('word pools keep to their length band', () => {
  const bare = word => word.replace(/'/g, '').length
  assert.ok(resolveWordsLevel('words-easy').items.every(w => bare(w) <= 5))
  assert.ok(resolveWordsLevel('words-medium').items.every(w => bare(w) >= 6 && bare(w) <= 8))
  assert.ok(resolveWordsLevel('words-hard').items.every(w => bare(w) >= 9))
})

test('an unknown level falls back to the easiest words instead of an empty round', () => {
  const level = resolveWordsLevel('nonsense')
  assert.equal(level.mode, 'words')
  assert.equal(level.difficulty, 'easy')
  assert.ok(level.items.length > 0)
})

test('sentences carry the punctuation the exercise is about', () => {
  for (const id of ['sentences-easy', 'sentences-medium', 'sentences-hard']) {
    assert.ok(resolveWordsLevel(id).items.every(s => /[.!?]$/.test(s)), `${id} has an unfinished sentence`)
  }
})
