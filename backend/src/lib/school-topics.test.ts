import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSchoolTopicSelection, SCHOOL_TOPIC_IDS } from './school-topics.js'

test('school topic allowlist exposes the NUSH teacher-facing topic ids', () => {
  assert.deepEqual(SCHOOL_TOPIC_IDS, [
    'information-messages',
    'data-tables-charts',
    'computer-devices',
    'digital-tools',
    'algorithms-programming',
    'internet-networks-search',
    'digital-safety',
    'files-environment',
    'digital-creation',
    'algorithms-executors',
    'programming-scratch',
  ])
})

test('legacy split topics resolve to the honest canonical pools', () => {
  assert.deepEqual(resolveSchoolTopicSelection('algorithms-programming'), {
    track: 'informatics',
    topic: 'algorithms-programming',
  })
  assert.deepEqual(resolveSchoolTopicSelection('digital-tools'), {
    track: 'informatics',
    topic: 'digital-tools',
  })
  assert.deepEqual(resolveSchoolTopicSelection('algorithms-executors'), resolveSchoolTopicSelection('algorithms-programming'))
  assert.deepEqual(resolveSchoolTopicSelection('programming-scratch'), resolveSchoolTopicSelection('algorithms-programming'))
  assert.deepEqual(resolveSchoolTopicSelection('files-environment'), resolveSchoolTopicSelection('digital-tools'))
  assert.deepEqual(resolveSchoolTopicSelection('digital-creation'), resolveSchoolTopicSelection('digital-tools'))
})

test('unknown school topic is rejected fail-closed', () => {
  assert.throws(() => resolveSchoolTopicSelection('cambridge-custom-topic'), /Unknown School topic/)
})
