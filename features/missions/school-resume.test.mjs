import test from 'node:test'
import assert from 'node:assert/strict'

import { isStaleParticipantError, prepareSchoolMissionResume } from './school-resume.ts'

test('school resume keeps the original progress while filtering answered questions', () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}` }))
  const resume = prepareSchoolMissionResume(questions, ['q1', 'q2', 'q3'], 2)

  assert.deepEqual(resume.remaining.map(q => q.id), ['q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'])
  assert.equal(resume.completedCount, 3)
  assert.equal(resume.priorCorrect, 2)
  assert.equal(resume.totalCount, 10)
})

test('school resume ignores unknown answer ids and clamps an inconsistent score', () => {
  const resume = prepareSchoolMissionResume([{ id: 'q1' }, { id: 'q2' }], ['foreign', 'q1'], 5)

  assert.deepEqual(resume.remaining.map(q => q.id), ['q2'])
  assert.equal(resume.completedCount, 1)
  assert.equal(resume.priorCorrect, 1)
})

test('only invalid or missing participant identities are treated as stale', () => {
  assert.equal(isStaleParticipantError({ status: 403 }), true)
  assert.equal(isStaleParticipantError({ status: 404 }), true)
  assert.equal(isStaleParticipantError({ status: 429 }), false)
  assert.equal(isStaleParticipantError({ status: 503 }), false)
  assert.equal(isStaleParticipantError(new Error('offline')), false)
})
