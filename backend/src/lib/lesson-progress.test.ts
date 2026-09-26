import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ActivitySpec, LessonDefinitionV1 } from './curriculum-lesson-schema.js'
import { holdsLessonAssignment, validateLessonProgress } from './lesson-progress.js'
import { studentPresentationSlide } from './lesson-student-material.js'

const lesson = JSON.parse(readFileSync(new URL('./curriculum-fixtures/g2-devices-pilot.lesson.json', import.meta.url), 'utf8')) as LessonDefinitionV1
const activity = lesson.blocks.flatMap(block => block.type === 'activity' && block.activity.mechanic === 'classify' ? [block.activity] : [])[0]!

test('incomplete classification is recovery data; foreign items and answer keys are refused', () => {
  const config = activity.config as { items: { id: string }[]; categories: { id: string }[] }
  const draft = { selection: { [config.items[0]!.id]: config.categories[0]!.id } }
  assert.deepEqual(validateLessonProgress(activity, draft), draft)
  assert.deepEqual(validateLessonProgress(activity, { selection: {} }), { selection: {} })
  assert.throws(() => validateLessonProgress(activity, { selection: { stranger: 'input' } }))
  assert.throws(() => validateLessonProgress(activity, { ...draft, correct: 100 }))
})

test('a laptop that stays on loses write authority on transfer, including transfer back', () => {
  assert.equal(holdsLessonAssignment({ lessonRunStudentId: 'student', assignmentVersion: 1 }, 'student', 1), true)
  assert.equal(holdsLessonAssignment({ lessonRunStudentId: null, assignmentVersion: 2 }, 'student', 1), false)
  assert.equal(holdsLessonAssignment({ lessonRunStudentId: 'other', assignmentVersion: 2 }, 'student', 1), false)
  assert.equal(holdsLessonAssignment({ lessonRunStudentId: 'student', assignmentVersion: 3 }, 'student', 1), false)
})

test('game checkpoints cannot invent a score outside the registry bounds', () => {
  const game: ActivitySpec = { instanceId: 'typing', mechanic: 'game', telemetry: 'practice', config: { gameKey: 'typing-words', level: 'words-easy' }, scoring: { mode: 'client-unverified' } }
  const progress = { gameState: { version: 1 }, gameResult: { correct: 2, total: 18, mistakes: 1, durationSec: 20 }, finished: false }
  assert.deepEqual(validateLessonProgress(game, progress), progress)
  assert.doesNotThrow(() => validateLessonProgress(game, { ...progress, gameResult: { ...progress.gameResult, durationSec: 0 } }))
  assert.throws(() => validateLessonProgress(game, { ...progress, gameResult: { ...progress.gameResult, correct: 900 } }))
  assert.throws(() => validateLessonProgress(game, { ...progress, gameState: { large: 'x'.repeat(32768) } }))
})

test('remote slides expose projector fields only, never notes, expected answers, answer keys or outcome mappings', () => {
  const copy = structuredClone(lesson)
  const block = copy.blocks.find(block => block.presentation && block.audience.student)!
  block.presentation!.speakerNotes = { uk: 'private speaker notes' }
  Object.assign(block.content, { expectedResponse: { uk: 'private expected answer' }, teacherHint: 'secret' })
  const slide = studentPresentationSlide(copy, block.id)
  assert.ok(slide)
  const json = JSON.stringify(slide)
  assert.equal(json.includes('private'), false)
  assert.equal(json.includes('secret'), false)
  assert.equal(json.includes('scoring'), false)
  const activityBlock = copy.blocks.find(block => block.type === 'activity')!
  const projected = studentPresentationSlide(copy, activityBlock.id)
  assert.ok(projected)
  assert.equal(JSON.stringify(projected).includes('correctCategoryByItem'), false)
  assert.equal(JSON.stringify(projected).includes('outcomes'), false)
  assert.equal(JSON.stringify(projected?.activity?.scoring).includes('key'), false)
  block.audience.student = false
  assert.equal(studentPresentationSlide(copy, block.id), null)
})
