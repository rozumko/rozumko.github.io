import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { evidenceRowsForAttempt, lessonReport, summarizeOutcome, teacherCommentDraft } from './lesson-evidence.js'
import { findSubjectPack } from './subject-packs.js'
import type { ActivitySpec, LessonDefinitionV1 } from './curriculum-lesson-schema.js'

const lesson = JSON.parse(readFileSync(new URL('./curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8')) as LessonDefinitionV1
const activity = (id: string) => lesson.blocks.flatMap(b => b.type === 'activity' ? [b.activity] : []).find(a => a.instanceId === id)!
const evidenceActivity = activity('self-check-extension')
const t = (m: number) => new Date(Date.UTC(2026, 8, 24, 10, m))

test('only evidence activities produce evidence, one row per targeted outcome', () => {
  assert.deepEqual(evidenceRowsForAttempt(activity('try-meaningful-name'), { trust: 'server-verified', normalizedScore: 1 }), [])
  assert.deepEqual(evidenceRowsForAttempt(evidenceActivity, { trust: 'server-verified', normalizedScore: 1 }), [
    { outcomeId: 'int-files-name-extension', evidenceRole: 'primary', trust: 'server-verified', score: 1 },
  ])
})

test('a client-reported result is never recorded as primary evidence', () => {
  const game: ActivitySpec = { ...evidenceActivity, mechanic: 'game', scoring: { mode: 'client-unverified' } }
  assert.equal(evidenceRowsForAttempt(game, { trust: 'client-unverified', normalizedScore: 1 })[0]!.evidenceRole, 'supporting')
})

test('the written rule: only the latest primary verified evidence decides', () => {
  const primary = (score: number, m: number) => ({ evidenceRole: 'primary' as const, trust: 'server-verified' as const, score, observedAt: t(m) })
  assert.equal(summarizeOutcome([]).status, 'not-enough-evidence')
  assert.equal(summarizeOutcome([{ ...primary(1, 1), evidenceRole: 'supporting' }]).status, 'not-enough-evidence')
  assert.equal(summarizeOutcome([{ ...primary(1, 1), trust: 'client-unverified' }]).status, 'not-enough-evidence')
  assert.equal(summarizeOutcome([primary(0.8, 1)]).status, 'demonstrated')
  assert.equal(summarizeOutcome([primary(0.6, 1)]).status, 'progressing')
  assert.equal(summarizeOutcome([primary(0.2, 1)]).status, 'needs-support')
  // Latest wins, whatever the input order.
  assert.equal(summarizeOutcome([primary(1, 5), primary(0, 1)]).status, 'demonstrated')
  assert.match(summarizeOutcome([primary(0.2, 1)]).basis, /20%/)
})

test('comment drafts state only facts from the summaries', () => {
  assert.equal(
    teacherCommentDraft('Марко', [{ title: 'A', status: 'demonstrated' }, { title: 'B', status: 'not-enough-evidence' }], 2),
    'Марко: продемонстрував(ла) «A»; бракує даних: «B»; виконано завдань: 2.',
  )
  assert.equal(teacherCommentDraft('Софія', [{ title: 'A', status: 'not-enough-evidence' }], 0), 'Софія: у цьому уроці результатів немає.')
})

test('the lesson report traces every summary back to attempts and activities', () => {
  const report = lessonReport({
    run: { status: 'finished', className: '2-А', lessonPublishedVersion: 3, startedAt: t(0), finishedAt: t(40) },
    lesson,
    outcomes: findSubjectPack('informatics-ua-primary')!.outcomes,
    students: [{ id: 's1', label: 'Марко' }, { id: 's2', label: 'Софія' }, { id: 's3', label: null }],
    mappedStudentIds: new Set(['s1']),
    dispatches: [{ id: 'd1', blockId: 'g2-m2-l8-b12', activityInstanceId: 'self-check-extension' }],
    attempts: [{
      id: 'a1', dispatchId: 'd1', lessonRunStudentId: 's1', activityInstanceId: 'self-check-extension', attemptNo: 1,
      correct: 1, total: 1, normalizedScore: 1, trust: 'server-verified', answerPayload: { answer: { optionId: 'b' } }, createdAt: t(20),
    }],
    evidence: [{
      lessonRunStudentId: 's1', activityAttemptId: 'a1', outcomeId: 'int-files-name-extension',
      evidenceRole: 'primary', trust: 'server-verified', score: 1, observedAt: t(20),
    }],
  })
  assert.equal(report.students.length, 2, 'deleted students are not listed')
  const [marko, sofia] = report.students
  const outcome = marko!.outcomes.find(o => o.outcomeId === 'int-files-name-extension')!
  assert.equal(outcome.label, 'Продемонстровано')
  assert.deepEqual(
    { attempt: outcome.evidence[0]!.attemptId, activity: outcome.evidence[0]!.activityTitle, no: outcome.evidence[0]!.attemptNo },
    { attempt: 'a1', activity: 'Перевір себе', no: 1 },
  )
  assert.equal(marko!.participated, true)
  assert.equal(sofia!.participated, false)
  assert.deepEqual(sofia!.missing, ['Перевір себе'])
  assert.equal(report.activities[0]!.answered, 1)
  assert.equal(report.run.lessonPublishedVersion, 3)
  assert.equal(report.outcomes[0]!.code, 'INF-2-FILES-1')
})
