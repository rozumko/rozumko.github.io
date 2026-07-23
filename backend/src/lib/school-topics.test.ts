import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSchoolTopicSelection, SCHOOL_TOPIC_IDS } from './school-topics.js'

test('school topic allowlist exposes the NUSH teacher-facing topic ids', () => {
  assert.deepEqual(SCHOOL_TOPIC_IDS, [
    'information-messages',
    'computer-devices',
    'files-environment',
    'digital-creation',
    'data-tables-charts',
    'algorithms-executors',
    'programming-scratch',
    'internet-networks-search',
    'digital-safety',
  ])
})

test('school topic selection splits algorithms from Scratch through preferred concept keys', () => {
  assert.deepEqual(resolveSchoolTopicSelection('algorithms-executors'), {
    track: 'informatics',
    topic: 'algorithms-programming',
    preferredConceptKeys: ['algorithms', 'debugging'],
  })
  assert.deepEqual(resolveSchoolTopicSelection('programming-scratch'), {
    track: 'informatics',
    topic: 'algorithms-programming',
    preferredConceptKeys: ['repetition', 'decomposition', 'debugging'],
  })
})

test('unknown school topic is rejected fail-closed', () => {
  assert.throws(() => resolveSchoolTopicSelection('cambridge-custom-topic'), /Unknown School topic/)
})
