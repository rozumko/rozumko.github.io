import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validatePathMapPoints, bumpChangedStepVersions } from './path-map-validation.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SEED_MAPS = JSON.parse(readFileSync(join(HERE, '../db/seed/path-maps.json'), 'utf8')) as
  Array<{ pathId: string; grade: number; points: unknown[] }>

test('усі seed-карти проходять адмін-валідацію', () => {
  for (const map of SEED_MAPS) {
    assert.doesNotThrow(() => validatePathMapPoints(map.points), `${map.pathId} не проходить`)
  }
})

const g2 = SEED_MAPS.find(map => map.pathId === 'grade-2')!
const clone = () => JSON.parse(JSON.stringify(g2.points)) as Array<Record<string, unknown>>

test('валідація fail-closed: цикл, два старти, битий unlockAfter, невідомий kind', () => {
  const cycle = clone()
  ;(cycle[0].unlockAfter as string[]).push(cycle[cycle.length - 1].id as string)
  assert.throws(() => validatePathMapPoints(cycle), /цикл|стартову/)

  const twoStarts = clone()
  ;(twoStarts[1].unlockAfter as string[]).length = 0
  assert.throws(() => validatePathMapPoints(twoStarts), /одну стартову/)

  const badDep = clone()
  ;(badDep[1].unlockAfter as string[])[0] = 'g2-neisnuye'
  assert.throws(() => validatePathMapPoints(badDep), /не існує/)

  const badKind = clone()
  ;((badKind[0].activities as Array<Record<string, unknown>>)[0].activity as Record<string, unknown>).kind = 'teleport'
  assert.throws(() => validatePathMapPoints(badKind), /невідомий kind/)

  const badAccess = clone()
  badAccess[0].access = 'premium'
  assert.throws(() => validatePathMapPoints(badAccess), /free або club/)

  const noRequired = clone()
  for (const step of badRequiredSteps(noRequired)) step.required = false
  assert.throws(() => validatePathMapPoints(noRequired), /обовʼязковий крок/)
})

function badRequiredSteps(points: Array<Record<string, unknown>>) {
  return points[0].activities as Array<Record<string, unknown> & { required: boolean }>
}

test('bumpChangedStepVersions: зміна активності бампає, ідентичність — ні, новий крок — v1', () => {
  const prev = validatePathMapPoints(clone())
  const same = bumpChangedStepVersions(prev, validatePathMapPoints(clone()))
  assert.deepEqual(same.bumped, [])
  assert.deepEqual(same.points, prev)

  const edited = clone()
  const algorithms = edited.find(point => point.id === 'g2-ct-algorithms')!
  const steps = algorithms.activities as Array<Record<string, unknown>>
  ;(steps.find(step => step.id === 'algorithms-sequence')!.activity as Record<string, unknown>).count = 4
  steps.push({
    id: 'bonus-puzzles', version: 1, title: 'Бонус',
    activity: { kind: 'puzzles', count: 2 }, required: false,
  })
  const result = bumpChangedStepVersions(prev, validatePathMapPoints(edited))
  assert.deepEqual(result.bumped, ['g2-ct-algorithms:algorithms-sequence'])
  const savedSteps = result.points.find(point => point.id === 'g2-ct-algorithms')!.activities
  assert.equal(savedSteps.find(step => step.id === 'algorithms-sequence')!.version, 2)
  assert.equal(savedSteps.find(step => step.id === 'bonus-puzzles')!.version, 1)
  // Клієнтський version у запиті ігнорується на користь prev+1 — редактор
  // не може «відкотити» версію кроку.
  const forged = JSON.parse(JSON.stringify(edited)) as Array<Record<string, unknown>>
  ;(forged.find(p => p.id === 'g2-ct-algorithms')!.activities as Array<Record<string, unknown>>)
    .find(step => step.id === 'algorithms-sequence')!.version = 99
  const forgedResult = bumpChangedStepVersions(prev, validatePathMapPoints(forged))
  assert.equal(forgedResult.points.find(p => p.id === 'g2-ct-algorithms')!
    .activities.find(step => step.id === 'algorithms-sequence')!.version, 2)
})
