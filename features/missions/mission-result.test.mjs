import test from 'node:test'
import assert from 'node:assert/strict'

import { missionSummary, encouragement } from './mission-result.ts'

test('missionSummary: звичайний підрахунок відсотка', () => {
  assert.deepEqual(missionSummary(7, 10), { correct: 7, total: 10, percent: 70 })
})

test('missionSummary: total=0 не ділить на нуль', () => {
  assert.deepEqual(missionSummary(0, 0), { correct: 0, total: 0, percent: 0 })
})

test('missionSummary: correct обрізається до total', () => {
  assert.deepEqual(missionSummary(15, 10), { correct: 10, total: 10, percent: 100 })
})

test('missionSummary: відʼємний correct → 0', () => {
  assert.deepEqual(missionSummary(-3, 10), { correct: 0, total: 10, percent: 0 })
})

test('missionSummary: відсоток округлюється', () => {
  assert.equal(missionSummary(1, 3).percent, 33)
  assert.equal(missionSummary(2, 3).percent, 67)
})

test('encouragement: рівні за відсотком', () => {
  assert.match(encouragement(100), /майстер/)
  assert.match(encouragement(75), /Чудова/)
  assert.match(encouragement(50), /старт/)
  assert.match(encouragement(10), /спробував/)
})
