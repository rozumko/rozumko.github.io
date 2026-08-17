import assert from 'node:assert/strict'
import test from 'node:test'
import { SCHOOL_TOPIC_GROUPS, SCHOOL_TOPICS, getSchoolTopicConfig } from './school-topics.ts'
import { CANONICAL_SCHOOL_TOPIC_IDS, resolveSchoolTopicSelection } from '../../backend/src/lib/school-topics.ts'

test('question cards expose one canonical card per distinct server pool', () => {
  assert.deepEqual(SCHOOL_TOPICS.map(topic => topic.id), CANONICAL_SCHOOL_TOPIC_IDS)
  assert.deepEqual(SCHOOL_TOPIC_GROUPS.map(group => group.id), [
    'information',
    'tools',
    'algorithms',
    'internet',
  ])
  assert.equal(new Set(SCHOOL_TOPICS.map(topic => `${topic.sessionFilter.track}/${topic.sessionFilter.topic}`)).size, SCHOOL_TOPICS.length)
})

test('every question card has presentation and grade guidance', () => {
  for (const topic of SCHOOL_TOPICS) {
    assert.ok(SCHOOL_TOPIC_GROUPS.some(group => group.id === topic.group))
    assert.match(topic.icon, /^fa-[a-z0-9-]+$/)
    assert.ok(topic.label.length > 0)
    assert.ok(topic.description.length > 0)
    assert.ok(topic.sessionId.length > 0)
    for (const grade of [1, 2, 3, 4]) assert.ok(topic.grades[grade])
  }
})

test('legacy split topic ids remain compatible but resolve to canonical pools', () => {
  assert.deepEqual(resolveSchoolTopicSelection('files-environment'), resolveSchoolTopicSelection('digital-tools'))
  assert.deepEqual(resolveSchoolTopicSelection('digital-creation'), resolveSchoolTopicSelection('digital-tools'))
  assert.deepEqual(resolveSchoolTopicSelection('algorithms-executors'), resolveSchoolTopicSelection('algorithms-programming'))
  assert.deepEqual(resolveSchoolTopicSelection('programming-scratch'), resolveSchoolTopicSelection('algorithms-programming'))
  assert.equal(getSchoolTopicConfig('files-environment'), undefined)
  assert.equal(getSchoolTopicConfig('digital-tools')?.sessionId, 'files-environment')
  assert.equal(getSchoolTopicConfig('algorithms-programming')?.sessionId, 'algorithms-executors')
})
