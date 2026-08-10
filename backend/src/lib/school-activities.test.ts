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
  assert.equal(resolveActivityDefinition('maze').key, 'maze')
  assert.throws(() => resolveActivityDefinition('mouse103'))
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

test('maze: levels carry their own ceiling and mistake budget', () => {
  const activity = SCHOOL_ACTIVITIES['maze']
  const beginner = resolveActivityLevel(activity, 'beginner')
  const master = resolveActivityLevel(activity, 'master')
  assert.equal(beginner.maxTotal, 5)
  assert.equal(master.maxTotal, 10)
  // A beginner run cannot claim the master level's count
  assert.throws(() => normalizeActivityResult(activity, beginner, { correct: 10, total: 10, mistakes: 0, durationSec: 90 }))

  const stars = (level: typeof master, input: { correct: number; total: number; mistakes: number }) =>
    normalizeActivityResult(activity, level, { ...input, durationSec: 90 }).stars
  // Full campaign: the mistake budget scales with the number of levels
  assert.equal(stars(master, { correct: 10, total: 10, mistakes: 8 }), 3)
  assert.equal(stars(master, { correct: 10, total: 10, mistakes: 25 }), 2)
  assert.equal(stars(master, { correct: 10, total: 10, mistakes: 60 }), 1)
  assert.equal(stars(beginner, { correct: 5, total: 5, mistakes: 8 }), 2)
  // Cut short: how far the child got decides
  assert.equal(stars(master, { correct: 8, total: 10, mistakes: 0 }), 2)
  assert.equal(stars(master, { correct: 1, total: 10, mistakes: 0 }), 0)
})

test('windows: accuracy rubric, since the child always reaches the last window', () => {
  const activity = SCHOOL_ACTIVITIES['windows']
  const easy = resolveActivityLevel(activity, 'easy')
  const hard = resolveActivityLevel(activity, 'hard')
  assert.equal(easy.maxTotal, 10)
  assert.equal(hard.maxTotal, 20)
  // An easy run cannot claim the twenty windows of the hard level
  assert.throws(() => normalizeActivityResult(activity, easy, { correct: 20, total: 20, mistakes: 0, durationSec: 90 }))

  const stars = (correct: number) =>
    normalizeActivityResult(activity, easy, { correct, total: 10, mistakes: 10 - correct, durationSec: 90 }).stars
  assert.equal(stars(10), 3)
  assert.equal(stars(9), 3)
  assert.equal(stars(7), 2)
  assert.equal(stars(4), 1)
  assert.equal(stars(2), 0)
})

test('mouse-buttons: accuracy over the obstacles that actually arrived', () => {
  const activity = SCHOOL_ACTIVITIES['mouse-buttons']
  const beginner = resolveActivityLevel(activity, 'beginner')
  const master = resolveActivityLevel(activity, 'master')

  // A measured full master run produced ~331 obstacles; the ceiling has room
  assert.ok(master.maxTotal > 362, 'master ceiling must clear the theoretical maximum')
  // A short run cannot be claimed: the level is timed, so the duration is known
  assert.throws(() => normalizeActivityResult(activity, master, { correct: 10, total: 10, mistakes: 0, durationSec: 30 }))
  assert.throws(() => normalizeActivityResult(activity, beginner, { correct: 200, total: 200, mistakes: 0, durationSec: 70 }))

  const stars = (correct: number, total: number) =>
    normalizeActivityResult(activity, beginner, { correct, total, mistakes: total - correct, durationSec: 70 }).stars
  assert.equal(stars(30, 30), 3)
  assert.equal(stars(24, 30), 2)
  assert.equal(stars(15, 30), 1)
  assert.equal(stars(5, 30), 0)
})

test('typing-sprint: a fixed-minute run cannot report an early result', () => {
  const activity = SCHOOL_ACTIVITIES['typing-sprint']
  for (const levelId of activity.levels.map(level => level.id)) {
    const level = resolveActivityLevel(activity, levelId)
    assert.equal(level.minDurationSec, 55)
    assert.throws(() => normalizeActivityResult(activity, level,
      { correct: 1, total: 1, mistakes: 0, durationSec: 54 }))
    assert.equal(normalizeActivityResult(activity, level,
      { correct: 1, total: 1, mistakes: 0, durationSec: 60 }).correct, 1)
  }
})

test('school puzzle activities: fixed totals and percentage rubrics', () => {
  const magic = SCHOOL_ACTIVITIES['magic-squares']
  const magicLevel = resolveActivityLevel(magic, 'easy')
  assert.equal(magicLevel.maxTotal, 3)
  assert.equal(normalizeActivityResult(magic, magicLevel, { correct: 3, total: 3, mistakes: 0, durationSec: 20 }).stars, 3)
  assert.equal(normalizeActivityResult(magic, magicLevel, { correct: 2, total: 3, mistakes: 1, durationSec: 20 }).stars, 2)
  assert.throws(() => normalizeActivityResult(magic, magicLevel, { correct: 4, total: 4, mistakes: 0, durationSec: 20 }))

  const symbols = SCHOOL_ACTIVITIES['symbol-logic']
  const symbolsLevel = resolveActivityLevel(symbols, 'hard')
  assert.equal(symbolsLevel.maxTotal, 5)
  assert.equal(normalizeActivityResult(symbols, symbolsLevel, { correct: 5, total: 5, mistakes: 0, durationSec: 20 }).stars, 3)
  assert.equal(normalizeActivityResult(symbols, symbolsLevel, { correct: 3, total: 5, mistakes: 2, durationSec: 20 }).stars, 2)
  assert.throws(() => normalizeActivityResult(symbols, symbolsLevel, { correct: 6, total: 6, mistakes: 0, durationSec: 20 }))
})

// message-coding and sorting-station retry each item until it is right, so a
// finished run always reports 100% and only the mistake count can separate one
// child from another. A percentage rubric would award the same stars for three
// mistakes and for thirty.
test('message-coding: fixed classroom total and mistake-aware rubric', () => {
  const activity = SCHOOL_ACTIVITIES['message-coding']
  const level = resolveActivityLevel(activity, 'medium')
  assert.equal(level.maxTotal, 5)
  assert.equal(level.minDurationSec, 5)
  const stars = (mistakes: number) =>
    normalizeActivityResult(activity, level, { correct: 5, total: 5, mistakes, durationSec: 20 }).stars
  assert.equal(stars(0), 3)
  assert.equal(stars(2), 2)
  assert.equal(stars(4), 1)
  assert.equal(stars(9), 0)
  assert.throws(() => normalizeActivityResult(activity, level, { correct: 6, total: 6, mistakes: 0, durationSec: 20 }))
  assert.throws(() => normalizeActivityResult(activity, level, { correct: 5, total: 5, mistakes: 0, durationSec: 4 }))
})

test('sorting-station: per-level totals and mistake-aware rubric', () => {
  const activity = SCHOOL_ACTIVITIES['sorting-station']
  // Each level ships a different number of objects; the ceilings must follow,
  // or an easy run could claim a hard one's workload.
  assert.equal(resolveActivityLevel(activity, 'easy').maxTotal, 8)
  assert.equal(resolveActivityLevel(activity, 'medium').maxTotal, 10)
  const level = resolveActivityLevel(activity, 'hard')
  assert.equal(level.maxTotal, 12)
  assert.equal(level.minDurationSec, 12)
  assert.throws(() => normalizeActivityResult(activity, resolveActivityLevel(activity, 'easy'),
    { correct: 12, total: 12, mistakes: 0, durationSec: 20 }))

  const stars = (mistakes: number) =>
    normalizeActivityResult(activity, level, { correct: 12, total: 12, mistakes, durationSec: 20 }).stars
  assert.equal(stars(0), 3)
  assert.equal(stars(3), 2)
  assert.equal(stars(7), 1)
  assert.equal(stars(30), 0)
  assert.throws(() => normalizeActivityResult(activity, level, { correct: 13, total: 13, mistakes: 0, durationSec: 20 }))
  assert.throws(() => normalizeActivityResult(activity, level, { correct: 12, total: 12, mistakes: 0, durationSec: 10 }))
})

test('single-session activities have fixed ceilings and expected rubrics', () => {
  const precise = SCHOOL_ACTIVITIES['precise-click']
  const preciseLevel = resolveActivityLevel(precise, 'session')
  assert.equal(preciseLevel.maxTotal, 43)
  assert.equal(normalizeActivityResult(precise, preciseLevel,
    { correct: 39, total: 43, mistakes: 4, durationSec: 60 }).stars, 3)

  const factOpinion = SCHOOL_ACTIVITIES['fact-or-opinion']
  const factLevel = resolveActivityLevel(factOpinion, 'session')
  assert.equal(factLevel.maxTotal, 10)
  assert.equal(normalizeActivityResult(factOpinion, factLevel,
    { correct: 7, total: 10, mistakes: 3, durationSec: 60 }).stars, 2)

  assert.equal(resolveActivityLevel(SCHOOL_ACTIVITIES.tangram, 'session').maxTotal, 21)
  assert.equal(resolveActivityLevel(SCHOOL_ACTIVITIES.fireflies, 'session').maxTotal, 30)
})

test('retry activities: more mistakes never score better than fewer', () => {
  for (const key of ['message-coding', 'sorting-station', 'tangram', 'fireflies'] as const) {
    const activity = SCHOOL_ACTIVITIES[key]
    for (const levelId of activity.levels.map(l => l.id)) {
      const level = resolveActivityLevel(activity, levelId)
      const total = level.maxTotal
      const seen = new Set<number>()
      let previous = 4
      for (let mistakes = 0; mistakes <= total * 3; mistakes++) {
        const { stars } = normalizeActivityResult(activity, level,
          { correct: total, total, mistakes, durationSec: level.minDurationSec + 10 })
        assert.ok(stars <= previous, `${key}/${levelId}: stars rose at ${mistakes} mistakes`)
        previous = stars
        seen.add(stars)
      }
      // A rubric that cannot reach the low end tells the teacher nothing about
      // a child who guessed their way through.
      assert.ok(seen.size >= 3, `${key}/${levelId}: only ${seen.size} distinct star values reachable`)
    }
  }
})

test('normalizeActivityResult: stars stay clamped even if a rubric misbehaves', () => {
  const level = resolveActivityLevel(SCHOOL_ACTIVITIES['key-puzzle'], 'easy')
  const rogue = { ...SCHOOL_ACTIVITIES['key-puzzle'], stars: () => 99 }
  const result = normalizeActivityResult(rogue, level, { correct: 1, total: 2, mistakes: 0, durationSec: 90 })
  assert.equal(result.stars, 3)
})
