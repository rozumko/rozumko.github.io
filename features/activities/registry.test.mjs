import assert from 'node:assert/strict'
import test from 'node:test'
import { ACTIVITIES, activityLabel, activityLevelLabel, findActivity, findActivityLevel } from './registry.ts'
import {
  SCHOOL_ACTIVITIES,
  SCHOOL_ACTIVITY_KEYS,
} from '../../backend/src/lib/school-activities.ts'

// The server refuses any activity or level it does not know. If the two
// registries drift, the teacher gets a picker whose options 400 on submit —
// so the drift has to fail here instead.

test('every client activity exists on the server with the same levels', () => {
  for (const activity of ACTIVITIES) {
    const server = SCHOOL_ACTIVITIES[activity.key]
    assert.ok(server, `activity ${activity.key} is missing from the backend registry`)
    assert.deepEqual(
      activity.levels.map(l => l.id),
      server.levels.map(l => l.id),
      `levels of ${activity.key} differ between client and server`,
    )
    assert.equal(activity.device, server.device, `device of ${activity.key} differs`)
  }
})

test('every server activity is offered to the teacher', () => {
  for (const key of SCHOOL_ACTIVITY_KEYS) {
    assert.ok(findActivity(key), `activity ${key} has no client entry`)
  }
})

test('activities carry the labels the teacher and child screens need', () => {
  for (const activity of ACTIVITIES) {
    assert.ok(activity.label.length > 0)
    assert.ok(activity.description.length > 0)
    assert.ok(activity.hint.length > 0)
    assert.ok(activity.minWidth > 0)
    for (const level of activity.levels) {
      assert.ok(level.label.length > 0, `level ${level.id} of ${activity.key} has no label`)
      assert.ok(level.description.length > 0, `level ${level.id} of ${activity.key} has no description`)
    }
  }
})

test('lookups fail soft on unknown input', () => {
  assert.equal(findActivity(null), null)
  assert.equal(findActivity('nope'), null)
  assert.equal(activityLabel('nope'), 'Активність')
  assert.equal(activityLevelLabel('nope', 'easy'), '')
  assert.equal(activityLevelLabel('key-puzzle', 'nope'), '')
  assert.equal(findActivityLevel(ACTIVITIES[0], 'nope'), null)
})
