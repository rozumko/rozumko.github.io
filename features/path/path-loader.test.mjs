import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeMapBundle } from './path-loader.ts'
import { PATHS_BY_GRADE } from './path-data.ts'

function bundleFor(grade) {
  const map = PATHS_BY_GRADE[grade]
  return JSON.parse(JSON.stringify({ pathId: `grade-${grade}`, grade, version: map.version, title: map.title, points: map.points }))
}

function linearPoints(count) {
  const base = bundleFor(2).points[0]
  return Array.from({ length: count }, (_, index) => ({
    ...JSON.parse(JSON.stringify(base)),
    id: `g2-year-point-${index + 1}`,
    title: `Річна точка ${index + 1}`,
    unlockAfter: index === 0 ? [] : [`g2-year-point-${index}`],
    x: [50, 18, 82, 34, 66][index % 5],
    y: Math.min(94, 6 + (index % 9) * 10),
  }))
}

test('вбудовані карти проходять нормалізацію бандла (формат export:path сумісний)', () => {
  for (const grade of [1, 2, 3, 4]) {
    const map = normalizeMapBundle(bundleFor(grade), grade)
    assert.ok(map, `grade-${grade} не пройшла`)
    assert.equal(map.points.length, PATHS_BY_GRADE[grade].points.length)
  }
})

test('битий бандл → null (лишаємось на фолбеку)', () => {
  assert.equal(normalizeMapBundle(null, 2), null)
  assert.equal(normalizeMapBundle({}, 2), null)

  const wrongGrade = bundleFor(2)
  assert.equal(normalizeMapBundle(wrongGrade, 3), null, 'бандл іншого класу')

  const dupIds = bundleFor(2)
  dupIds.points[1].id = dupIds.points[0].id
  assert.equal(normalizeMapBundle(dupIds, 2), null, 'дубль id')

  const badDep = bundleFor(2)
  badDep.points[1].unlockAfter = ['g2-neisnuye']
  assert.equal(normalizeMapBundle(badDep, 2), null, 'unlockAfter в нікуди')

  const twoStarts = bundleFor(2)
  twoStarts.points[1].unlockAfter = []
  assert.equal(normalizeMapBundle(twoStarts, 2), null, 'дві стартові')

  const noRequired = bundleFor(2)
  for (const step of noRequired.points[0].activities) step.required = false
  assert.equal(normalizeMapBundle(noRequired, 2), null, 'точка без required-кроку')

  const badStep = bundleFor(2)
  delete badStep.points[0].activities[0].version
  assert.equal(normalizeMapBundle(badStep, 2), null, 'крок без version')

  const badMapVersion = bundleFor(2)
  badMapVersion.version = 0
  assert.equal(normalizeMapBundle(badMapVersion, 2), null, 'карта без додатної version')
})

test('поле access приймає free/club/відсутнє, інше — ні', () => {
  const withAccess = bundleFor(2)
  withAccess.points[0].access = 'club'
  assert.ok(normalizeMapBundle(withAccess, 2))

  const badAccess = bundleFor(2)
  badAccess.points[0].access = 'premium'
  assert.equal(normalizeMapBundle(badAccess, 2), null)
})

test('bundle accepts registry mission references and rejects malformed ones', () => {
  const bundle = bundleFor(2)
  bundle.points[0].activities[0].activity = {
    kind: 'mission-ref',
    missionId: 'game-sorting-information-grade2',
    missionKind: 'sorting-game',
    gameKey: 'infosort-g2',
    missionVersion: 1,
  }
  assert.ok(normalizeMapBundle(bundle, 2))

  const badGameKey = bundleFor(2)
  badGameKey.points[0].activities[0].activity = {
    kind: 'mission-ref',
    missionId: 'game-sorting-information-grade2',
    missionKind: 'sorting-game',
    gameKey: '../bad',
  }
  assert.equal(normalizeMapBundle(badGameKey, 2), null)

  const badVersion = bundleFor(2)
  badVersion.points[0].activities[0].activity = {
    kind: 'mission-ref',
    missionId: 'game-sorting-information-grade2',
    missionKind: 'sorting-game',
    gameKey: 'infosort-g2',
    missionVersion: 0,
  }
  assert.equal(normalizeMapBundle(badVersion, 2), null)
})

test('річний bundle приймає до 40 точок і відхиляє 41', () => {
  const forty = bundleFor(2)
  forty.points = linearPoints(40)
  assert.equal(normalizeMapBundle(forty, 2)?.points.length, 40)

  const fortyOne = bundleFor(2)
  fortyOne.points = linearPoints(41)
  assert.equal(normalizeMapBundle(fortyOne, 2), null)
})

test('повна bundle-валідація відхиляє цикл, битий activity shape і координати', () => {
  const cycle = bundleFor(2)
  cycle.points[0].unlockAfter = [cycle.points.at(-1).id]
  assert.equal(normalizeMapBundle(cycle, 2), null, 'цикл')

  const badActivity = bundleFor(2)
  badActivity.points[0].activities[0].activity = { kind: 'sorting', game: 'broken' }
  assert.equal(normalizeMapBundle(badActivity, 2), null, 'невідома гра')

  const badCoordinates = bundleFor(2)
  badCoordinates.points[0].x = 101
  assert.equal(normalizeMapBundle(badCoordinates, 2), null, 'координати поза картою')
})
