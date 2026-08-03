import assert from 'node:assert/strict'
import test from 'node:test'
import { SPRINT_LEVEL_IDS, SPRINT_SECONDS, resolveSprintLevel } from './typing-sprint-data.ts'
import { createBag } from '../typing-core/round.ts'

// Speed rides on the difficulty here, so the level id is the only thing that
// separates a calm first-grade round from a fast one.

test('every offered level resolves to a set and a travel time', () => {
  for (const id of SPRINT_LEVEL_IDS) {
    const level = resolveSprintLevel(id)
    assert.ok(level.items.length >= 10, `set ${id} is too small: ${level.items.length}`)
    assert.ok(level.travelMs > 0)
    // A target must not outlive the whole run.
    assert.ok(level.travelMs < SPRINT_SECONDS * 1000, `set ${id} gives a target more than a minute`)
  }
})

test('harder means faster, longer targets mean more time', () => {
  const keysEasy = resolveSprintLevel('keys-easy').travelMs
  const keysMedium = resolveSprintLevel('keys-medium').travelMs
  const keysHard = resolveSprintLevel('keys-hard').travelMs
  assert.ok(keysEasy > keysMedium && keysMedium > keysHard)
  // A whole word at the same difficulty has to stay on the field longer than
  // a single key, or it is unreachable.
  assert.ok(resolveSprintLevel('words-hard').travelMs > keysHard)
})

test('an unknown level falls back to single keys, not an empty field', () => {
  const level = resolveSprintLevel('nonsense')
  assert.equal(level.mode, 'keys')
  assert.equal(level.difficulty, 'easy')
  assert.ok(level.items.length > 0)
})

test('the target queue shows the whole set before it repeats', () => {
  const level = resolveSprintLevel('combos-easy')
  const bag = createBag(level.items)
  const seen = new Set()
  for (let i = 0; i < level.items.length; i++) seen.add(bag.next())
  assert.equal(seen.size, level.items.length)
})
