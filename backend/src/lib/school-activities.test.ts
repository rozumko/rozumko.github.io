import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_MAX_DURATION_SEC,
  SCHOOL_ACTIVITIES,
  SCHOOL_ACTIVITY_KEYS,
  SCHOOL_ACTIVITY_LEVEL_IDS,
  normalizeActivityResult,
  normalizeSessionKind,
  resolveActivityDefinition,
  resolveActivityLevel,
} from './school-activities.js'

test('normalizeSessionKind: default questions, unknown rejected', () => {
  assert.equal(normalizeSessionKind(undefined), 'questions')
  assert.equal(normalizeSessionKind(''), 'questions')
  assert.equal(normalizeSessionKind('questions'), 'questions')
  assert.equal(normalizeSessionKind('activity'), 'activity')
  assert.throws(() => normalizeSessionKind('game'))
  assert.throws(() => normalizeSessionKind(1))
})

test('resolveActivityDefinition: fail-closed on unknown key', () => {
  assert.equal(resolveActivityDefinition('key-puzzle').key, 'key-puzzle')
  assert.throws(() => resolveActivityDefinition('maze'))
  assert.throws(() => resolveActivityDefinition(''))
  assert.throws(() => resolveActivityDefinition(undefined))
  // Prototype-chain keys must not resolve as activities
  assert.throws(() => resolveActivityDefinition('constructor'))
  assert.throws(() => resolveActivityDefinition('toString'))
})

test('resolveActivityLevel: unknown level rejected, empty falls back to first', () => {
  const activity = SCHOOL_ACTIVITIES['key-puzzle']
  assert.equal(resolveActivityLevel(activity, 'hard').id, 'hard')
  assert.equal(resolveActivityLevel(activity, '').id, activity.levels[0]!.id)
  assert.throws(() => resolveActivityLevel(activity, 'insane'))
  assert.throws(() => resolveActivityLevel(activity, 3))
})

test('registry exports stay in sync with the definitions', () => {
  for (const key of SCHOOL_ACTIVITY_KEYS) {
    assert.equal(SCHOOL_ACTIVITIES[key].key, key)
    assert.ok(SCHOOL_ACTIVITIES[key].levels.length > 0)
  }
  const declared = new Set(SCHOOL_ACTIVITY_LEVEL_IDS)
  for (const key of SCHOOL_ACTIVITY_KEYS) {
    for (const level of SCHOOL_ACTIVITIES[key].levels) {
      assert.ok(declared.has(level.id), `level ${level.id} missing from SCHOOL_ACTIVITY_LEVEL_IDS`)
    }
  }
})

test('normalizeActivityResult: key-puzzle stars follow the original rubric', () => {
  const activity = SCHOOL_ACTIVITIES['key-puzzle']
  const level = resolveActivityLevel(activity, 'easy')
  const stars = (input: { correct: number; total: number; mistakes: number }) =>
    normalizeActivityResult(activity, level, { ...input, durationSec: 90 }).stars

  // Fully assembled: the mistake count decides
  assert.equal(stars({ correct: 18, total: 18, mistakes: 0 }), 3)
  assert.equal(stars({ correct: 18, total: 18, mistakes: 4 }), 2)
  assert.equal(stars({ correct: 18, total: 18, mistakes: 12 }), 1)
  // Cut short by the teacher: how far the child got decides
  assert.equal(stars({ correct: 15, total: 18, mistakes: 0 }), 2)
  assert.equal(stars({ correct: 8, total: 18, mistakes: 0 }), 1)
  assert.equal(stars({ correct: 2, total: 18, mistakes: 0 }), 0)
})

test('normalizeActivityResult: rejects implausible client claims', () => {
  const activity = SCHOOL_ACTIVITIES['key-puzzle']
  const level = resolveActivityLevel(activity, 'easy')
  const ok = { correct: 18, total: 18, mistakes: 0, durationSec: 90 }

  // correct above total, negative values, non-integers
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, correct: 19 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, correct: -1 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, correct: 1.5 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, mistakes: -1 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, mistakes: 10_000 }))
  // total beyond the registry ceiling, or empty
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, correct: 0, total: 0 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, correct: 1, total: level.maxTotal + 1 }))
  // instant "win" and a run longer than the session TTL
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, durationSec: level.minDurationSec - 1 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, durationSec: ACTIVITY_MAX_DURATION_SEC + 1 }))
  assert.throws(() => normalizeActivityResult(activity, level, { ...ok, durationSec: Number.NaN }))
})

test('normalizeActivityResult: stars stay clamped even if a rubric misbehaves', () => {
  const level = resolveActivityLevel(SCHOOL_ACTIVITIES['key-puzzle'], 'easy')
  const rogue = { ...SCHOOL_ACTIVITIES['key-puzzle'], stars: () => 99 }
  const result = normalizeActivityResult(rogue, level, { correct: 1, total: 2, mistakes: 0, durationSec: 90 })
  assert.equal(result.stars, 3)
})
