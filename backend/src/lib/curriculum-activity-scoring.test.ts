import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ActivityAnswerError, scoreServerActivity } from './curriculum-activity-scoring.js'
import type { ActivitySpec, LessonDefinitionV1 } from './curriculum-lesson-schema.js'

function activity(lessonFile: string, instanceId: string): ActivitySpec {
  const lesson = JSON.parse(readFileSync(new URL(`./curriculum-fixtures/${lessonFile}`, import.meta.url), 'utf8')) as LessonDefinitionV1
  for (const block of lesson.blocks) {
    if (block.type === 'activity' && block.activity.instanceId === instanceId) return block.activity
  }
  throw new Error(`fixture activity ${instanceId} missing`)
}

const choice = activity('g2-m2-l8.lesson.json', 'self-check-extension')
const truefalse = activity('test-subject.lesson.json', 'check-statements')
const classify = activity('test-subject.lesson.json', 'sort-a-b')

test('choice: scores the chosen option and returns the authored explanation, never the key', () => {
  const right = scoreServerActivity(choice, { optionId: 'b' })
  assert.deepEqual(right.result, {
    activityInstanceId: 'self-check-extension', status: 'submitted',
    correct: 1, total: 1, mistakes: 0, normalizedScore: 1, trust: 'server-verified',
  })
  assert.deepEqual(right.feedback.items, [{ id: 'b', correct: true }])
  assert.ok(right.feedback.explanation?.uk)

  const wrong = scoreServerActivity(choice, { optionId: 'a' })
  assert.equal(wrong.result.correct, 0)
  assert.deepEqual(wrong.feedback.items, [{ id: 'a', correct: false }], 'only the submitted option is judged')
  assert.ok(!JSON.stringify(wrong).includes('correctOptionId'))
})

test('truefalse and classify: every item is judged and must be answered exactly once', () => {
  const tf = scoreServerActivity(truefalse, { answers: { s1: true, s2: true } })
  assert.deepEqual(tf.feedback.items, [{ id: 's1', correct: true }, { id: 's2', correct: false }])
  assert.equal(tf.result.normalizedScore, 0.5)
  assert.equal(tf.result.mistakes, 1)

  const cl = scoreServerActivity(classify, { placement: { i1: 'a', i2: 'b' } })
  assert.equal(cl.result.correct, 2)
  assert.ok(!JSON.stringify(cl).includes('placement'))
})

test('malformed or incomplete answers are rejected, never guessed', () => {
  const bad: [ActivitySpec, unknown][] = [
    [choice, { optionId: 'z' }],
    [choice, {}],
    [choice, null],
    [truefalse, { answers: { s1: true } }],
    [truefalse, { answers: { s1: true, s2: 'yes' } }],
    [truefalse, { answers: { s1: true, s2: false, s3: true } }],
    [truefalse, { answers: { s1: true, constructor: false } }],
    [classify, { placement: { i1: 'a', i2: 'zzz' } }],
    [classify, { placement: ['a', 'b'] }],
  ]
  for (const [spec, answer] of bad) {
    assert.throws(() => scoreServerActivity(spec, answer), ActivityAnswerError, JSON.stringify(answer))
  }
})

test('activities without a server key cannot be scored', () => {
  const external = activity('g2-m2-l8.lesson.json', 'windows-trainer')
  assert.throws(() => scoreServerActivity(external, {}), /not server-scored/)
})
