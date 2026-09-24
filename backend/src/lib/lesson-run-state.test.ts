import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  LESSON_RUN_ACTIONS,
  LessonRunStateError,
  applyRunAction,
  resolveStep,
  runActionTimestamps,
  runSteps,
} from './lesson-run-state.js'
import type { LessonDefinitionV1 } from './curriculum-lesson-schema.js'
import type { LessonRunStatus } from '../db/schema.js'

const lesson = JSON.parse(readFileSync(new URL('./curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8')) as LessonDefinitionV1
const STATUSES: LessonRunStatus[] = ['prepared', 'active', 'paused', 'finished', 'cancelled']

test('run lifecycle: exactly the documented transitions are allowed', () => {
  const allowed: string[] = []
  for (const status of STATUSES) {
    for (const action of LESSON_RUN_ACTIONS) {
      try {
        allowed.push(`${status} -${action}-> ${applyRunAction(status, action).status}`)
      } catch (err) {
        assert.ok(err instanceof LessonRunStateError)
      }
    }
  }
  assert.deepEqual(allowed.sort(), [
    'active -cancel-> cancelled',
    'active -finish-> finished',
    'active -pause-> paused',
    'paused -cancel-> cancelled',
    'paused -finish-> finished',
    'paused -resume-> active',
    'prepared -cancel-> cancelled',
    'prepared -start-> active',
  ])
})

test('finished and cancelled runs are terminal', () => {
  for (const status of ['finished', 'cancelled'] as const) {
    for (const action of LESSON_RUN_ACTIONS) assert.throws(() => applyRunAction(status, action), LessonRunStateError)
  }
})

test('each action records its lifecycle event and timestamp', () => {
  const now = new Date('2026-09-24T10:00:00Z')
  assert.equal(applyRunAction('prepared', 'start').event, 'run_started')
  assert.equal(applyRunAction('paused', 'resume').event, 'run_resumed')
  assert.deepEqual(runActionTimestamps('start', now), { startedAt: now })
  assert.deepEqual(runActionTimestamps('resume', now), { pausedAt: null })
  assert.deepEqual(runActionTimestamps('cancel', now), { cancelledAt: now })
})

test('steps are the runtime blocks in order; teacher notes and support are not steps', () => {
  const steps = runSteps(lesson)
  assert.equal(steps[0], 'g2-m2-l8-b01')
  assert.ok(!steps.includes('g2-m2-l8-b02'), 'teacher note is not a step')
  assert.ok(!steps.includes('g2-m2-l8-b09'), 'support is not a step')
  assert.equal(steps.length, 12)

  const noSteps = structuredClone(lesson)
  for (const block of noSteps.blocks) delete block.runtime
  assert.deepEqual(runSteps(noSteps), ['g2-m2-l8-b01'])
})

test('navigation works while live or paused, within range, never before start or after the end', () => {
  assert.equal(resolveStep(lesson, 'active', 0), 'g2-m2-l8-b01')
  assert.equal(resolveStep(lesson, 'paused', 3), 'g2-m2-l8-b05')
  for (const status of ['prepared', 'finished', 'cancelled'] as const) {
    assert.throws(() => resolveStep(lesson, status, 0), LessonRunStateError)
  }
  for (const index of [-1, 12, 1.5, Number.NaN]) {
    assert.throws(() => resolveStep(lesson, 'active', index), LessonRunStateError)
  }
})
