import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  NEEDS_ATTENTION_BELOW,
  attemptLimit,
  choiceWrongPattern,
  liveCellState,
  liveSnapshot,
  scoreStudentAttempt,
  studentActivityView,
} from './lesson-live.js'
import { ActivityAnswerError } from './curriculum-activity-scoring.js'
import { findSubjectPack } from './subject-packs.js'
import type { ActivitySpec, LessonDefinitionV1 } from './curriculum-lesson-schema.js'

const lesson = JSON.parse(readFileSync(new URL('./curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8')) as LessonDefinitionV1
const activity = (id: string) => lesson.blocks.flatMap(b => b.type === 'activity' ? [b.activity] : []).find(a => a.instanceId === id)!
const practice = activity('try-meaningful-name')
const evidence = activity('self-check-extension')
const external = activity('windows-trainer')
const game: ActivitySpec = {
  instanceId: 'windows-game', mechanic: 'game', telemetry: 'practice',
  config: { gameKey: 'windows', level: 'easy' }, scoring: { mode: 'client-unverified' },
}

test('attempt limits: evidence once, practice generously, lesson overrides win', () => {
  assert.equal(attemptLimit(evidence), 1)
  assert.equal(attemptLimit(practice), 10)
  assert.equal(attemptLimit({ ...practice, attempts: { max: 2 } }), 2)
})

test('devices see config without any key; external tools resolve through the pack allowlist', () => {
  const view = studentActivityView(evidence, findSubjectPack('informatics-ua-primary'))
  const serialized = JSON.stringify(view)
  assert.ok(!serialized.includes('correctOptionId') && !serialized.includes('explanation'))
  assert.deepEqual(Object.keys(view.scoring), ['mode'])
  const ext = studentActivityView(external, findSubjectPack('informatics-ua-primary'))
  assert.match(ext.external!.url, /^https:\/\/itnauka\.org\//)
  assert.equal(studentActivityView(external, null).external, undefined)
})

test('student scoring: practice gets feedback, evidence gets none, external takes no answers', () => {
  const p = scoreStudentAttempt(practice, { answer: { optionId: 'b' } })
  assert.equal(p.result.trust, 'server-verified'); assert.equal(p.result.correct, 1); assert.ok(p.feedback?.explanation)
  const e = scoreStudentAttempt(evidence, { answer: { optionId: 'a' } })
  assert.equal(e.feedback, null); assert.equal(e.result.correct, 0)
  assert.deepEqual(e.answerPayload, { answer: { optionId: 'a' } })
  assert.throws(() => scoreStudentAttempt(external, { answer: {} }), ActivityAnswerError)
  assert.throws(() => scoreStudentAttempt(practice, { answer: { optionId: 'zzz' } }), ActivityAnswerError)
})

test('game results are bounded by the registry and stay client-unverified', () => {
  const ok = scoreStudentAttempt(game, { gameResult: { correct: 9, total: 10, mistakes: 1, durationSec: 60 } })
  assert.equal(ok.result.trust, 'client-unverified'); assert.equal(ok.result.normalizedScore, 0.9); assert.equal(ok.feedback, null)
  for (const bad of [
    { correct: 11, total: 10, mistakes: 0, durationSec: 60 },
    { correct: 5, total: 999, mistakes: 0, durationSec: 60 },
    { correct: 5, total: 10, mistakes: 0, durationSec: 1 },
    undefined,
  ]) {
    assert.throws(() => scoreStudentAttempt(game, { gameResult: bad }), ActivityAnswerError, JSON.stringify(bad))
  }
})

test('live cell states cover every case the teacher needs to see', () => {
  const openedAt = new Date('2026-09-24T10:00:00Z')
  const now = new Date('2026-09-24T10:01:00Z')
  const base = { dispatchOpen: true, dispatchOpenedAt: openedAt, now }
  assert.equal(liveCellState({ ...base, attempts: [{ normalizedScore: 1 }], deviceLastSeenAt: null }), 'completed')
  assert.equal(liveCellState({ ...base, attempts: [{ normalizedScore: NEEDS_ATTENTION_BELOW - 0.01 }], deviceLastSeenAt: null }), 'needs-attention')
  assert.equal(liveCellState({ ...base, attempts: [], deviceLastSeenAt: new Date('2026-09-24T10:00:55Z') }), 'working')
  assert.equal(liveCellState({ ...base, attempts: [], deviceLastSeenAt: new Date('2026-09-24T09:59:59Z') }), 'offline')
  assert.equal(liveCellState({ ...base, attempts: [], deviceLastSeenAt: null }), 'offline')
  assert.equal(liveCellState({ ...base, now: new Date('2026-09-24T10:00:10Z'), attempts: [], deviceLastSeenAt: new Date('2026-09-24T09:59:55Z') }), 'not-started')
  assert.equal(liveCellState({ ...base, dispatchOpen: false, attempts: [], deviceLastSeenAt: now }), 'skipped')
})

test('a shared wrong choice is surfaced as evidence for the teacher', () => {
  const latest = [
    { answerPayload: { answer: { optionId: 'a' } }, normalizedScore: 0 },
    { answerPayload: { answer: { optionId: 'a' } }, normalizedScore: 0 },
    { answerPayload: { answer: { optionId: 'c' } }, normalizedScore: 0 },
    { answerPayload: { answer: { optionId: 'b' } }, normalizedScore: 1 },
  ]
  const pattern = choiceWrongPattern(evidence, latest)!
  assert.equal(pattern.optionId, 'a'); assert.equal(pattern.count, 2); assert.equal(pattern.of, 4)
  assert.equal(choiceWrongPattern(evidence, latest.slice(2)), null, 'one wrong answer is not a pattern')
  assert.equal(choiceWrongPattern(game, latest), null)
})

test('the live snapshot builds a student × activity grid and hides deleted students', () => {
  const openedAt = new Date('2026-09-24T10:00:00Z')
  const now = new Date('2026-09-24T10:00:30Z')
  const snapshot = liveSnapshot({
    activities: new Map([[practice.instanceId, practice]]),
    dispatches: [{ id: 'd1', blockId: 'g2-m2-l8-b07', activityInstanceId: practice.instanceId, openedAt, closedAt: null }],
    students: [{ id: 's1', label: 'Марко' }, { id: 's2', label: 'Софія' }, { id: 's3', label: null }],
    devices: [{ lessonRunStudentId: 's1', lastSeenAt: now }, { lessonRunStudentId: 's2', lastSeenAt: now }],
    attempts: [
      { dispatchId: 'd1', lessonRunStudentId: 's1', attemptNo: 2, normalizedScore: 1, correct: 1, total: 1, answerPayload: {} },
      { dispatchId: 'd1', lessonRunStudentId: 's1', attemptNo: 1, normalizedScore: 0, correct: 0, total: 1, answerPayload: {} },
    ],
    now,
  })
  assert.equal(snapshot.students.length, 2)
  assert.deepEqual(snapshot.students[0]!.cells.d1, { state: 'completed', attempts: 2, correct: 1, total: 1 })
  assert.equal(snapshot.students[1]!.cells.d1!.state, 'working')
  assert.equal(snapshot.students[1]!.online, true)
  assert.equal(snapshot.dispatches[0]!.open, true)
})
