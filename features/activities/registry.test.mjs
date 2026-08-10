import assert from 'node:assert/strict'
import test from 'node:test'
import { ACTIVITIES, ACTIVITY_GROUPS, activityLabel, activityLevelLabel, findActivity, findActivityLevel } from './registry.ts'
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

test('typing activities name their actual option axis instead of generic difficulty', () => {
  assert.equal(findActivity('typing-keys')?.levelLabel, 'Набір клавіш')
  assert.equal(findActivity('typing-words')?.levelLabel, 'Що друкувати')
  assert.equal(findActivity('typing-sprint')?.levelLabel, 'Цілі та темп')
  assert.equal(findActivity('typing-lessons')?.levelLabel, 'Серія та підказки')
})

test('the card picker has unique keys and populated groups', () => {
  assert.equal(new Set(ACTIVITIES.map(activity => activity.key)).size, ACTIVITIES.length)
  assert.equal(new Set(ACTIVITY_GROUPS.map(group => group.id)).size, ACTIVITY_GROUPS.length)
  for (const group of ACTIVITY_GROUPS) {
    assert.ok(ACTIVITIES.some(activity => activity.group === group.id), `group ${group.id} is empty`)
  }
  for (const activity of ACTIVITIES) {
    assert.match(activity.icon, /^fa-[a-z0-9-]+$/)
    assert.equal(new Set(activity.levels.map(level => level.id)).size, activity.levels.length)
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
