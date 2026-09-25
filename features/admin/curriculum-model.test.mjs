import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  EDITOR_MECHANICS,
  activityTemplate,
  addActivityOutcome,
  addLessonOutcome,
  describeLessonIssue,
  groupIssues,
  moveBlock,
  moveBlockTo,
  newBlock,
  newLesson,
  nextBlockId,
  outcomeCoverage,
  removeLessonOutcome,
  renameLesson,
  setOnBoard,
  setStudentAudience,
  shortTextFromLines,
  withoutAnswerKeys,
} from './curriculum-model.ts'
import { ACTIVITY_MECHANICS, LESSON_BLOCK_TYPES } from '../lesson-engine/types.ts'
import { validateLessonAgainstPack, validateLessonDefinition } from '../../backend/src/lib/curriculum-lesson-schema.ts'
import { SCHOOL_ACTIVITIES } from '../../backend/src/lib/school-activities.ts'

// The informatics pack as the admin /packs route and resolveSubjectPack() describe it.
const PILOT_OUTCOMES = JSON.parse(readFileSync(new URL('../../backend/src/lib/curriculum-fixtures/pilot-outcomes.json', import.meta.url), 'utf8'))
const GAMES = ['key-puzzle', 'maze', 'windows']
const PACK_INFO = {
  id: 'informatics-ua-primary',
  subject: 'informatics',
  gradeRange: { min: 1, max: 4 },
  tools: [{ key: 'itnauka-windows' }],
  games: GAMES.map(key => ({ key, levels: SCHOOL_ACTIVITIES[key].levels.map(l => l.id) })),
}
const SERVER_PACK = {
  ...PACK_INFO,
  title: { uk: 'Інформатика' },
  curriculumRefs: [],
  externalTools: { 'itnauka-windows': { url: 'https://itnauka.org/x', integration: 'launch-only', title: { uk: 'Вікна' } } },
  games: GAMES,
  outcomes: PILOT_OUTCOMES,
}

function assertValid(lesson, label) {
  const result = validateLessonDefinition(structuredClone(lesson))
  assert.ok(result.ok, `${label}: ${JSON.stringify(!result.ok && result.errors)}`)
  assert.deepEqual(validateLessonAgainstPack(result.lesson, SERVER_PACK), [], label)
}

test('the editor offers exactly the mechanics the lesson schema knows', () => {
  assert.deepEqual([...EDITOR_MECHANICS], [...ACTIVITY_MECHANICS])
})

test('a new lesson and every block template pass the server validator (a visual needs an asset)', () => {
  const lesson = newLesson({ id: 'g3-m1-l2', title: 'Алгоритми', grade: 3, pack: PACK_INFO })
  assertValid(lesson, 'new lesson')
  for (const type of LESSON_BLOCK_TYPES) {
    const block = newBlock(type, lesson, PACK_INFO)
    if (type === 'visual') {
      lesson.assets = [{ id: 'img1', kind: 'image', src: '/curriculum-lessons/assets/x.svg', alt: { uk: 'Опис' } }]
      block.content.assetId = 'img1'
    }
    lesson.blocks.push(block)
  }
  assertValid(lesson, 'every block type')
  assert.equal(new Set(lesson.blocks.map(b => b.id)).size, lesson.blocks.length)
  const note = lesson.blocks.find(b => b.type === 'teacher-note')
  assert.deepEqual([note.audience.student, note.views.presentation, note.presentation], [false, false, undefined])
})

test('every activity mechanic template passes the server validator', () => {
  for (const mechanic of EDITOR_MECHANICS) {
    const lesson = newLesson({ id: 'g3-m1-l2', title: 'Урок', grade: 3, pack: PACK_INFO })
    const block = newBlock('activity', lesson, PACK_INFO)
    block.activity = activityTemplate(mechanic, 'act-1', PACK_INFO)
    lesson.blocks.push(block)
    assertValid(lesson, mechanic)
  }
})

test('block ids are never renumbered or reused: the next id follows the highest, reserved ids included', () => {
  const lesson = newLesson({ id: 'g2-m1-l1', title: 'Урок', grade: 2, pack: PACK_INFO })
  lesson.blocks.push(newBlock('explanation', lesson, PACK_INFO))
  lesson.blocks.push(newBlock('reflection', lesson, PACK_INFO))
  assert.deepEqual(lesson.blocks.map(b => b.id), ['g2-m1-l1-b01', 'g2-m1-l1-b02', 'g2-m1-l1-b03'])
  assert.equal(moveBlock(lesson, 2, -1), true)
  assert.equal(moveBlock(lesson, 0, -1), false)
  const [removed] = lesson.blocks.splice(1, 1)
  assert.equal(removed.id, 'g2-m1-l1-b03')
  assert.equal(nextBlockId(lesson, [removed.id]), 'g2-m1-l1-b04', 'a deleted id is not handed to a new block')
  assert.equal(newBlock('break', lesson, PACK_INFO, ['g2-m1-l1-b07', 'other-b09']).id, 'g2-m1-l1-b08')
  const renamed = renameLesson(lesson, 'g2-m1-l9')
  assert.deepEqual(renamed.blocks.map(b => b.id), ['g2-m1-l9-b01', 'g2-m1-l9-b02'])
  assert.equal(renamed.slug, 'g2-m1-l9')
  assert.equal(lesson.id, 'g2-m1-l1', 'rename returns a copy')
})

test('linking an outcome to an activity lists it on the lesson; coverage says whether it is measured', () => {
  const lesson = newLesson({ id: 'g2-m2-l8', title: 'Файли', grade: 2, pack: PACK_INFO })
  const practice = newBlock('activity', lesson, PACK_INFO)
  lesson.blocks.push(practice)
  const evidence = newBlock('activity', lesson, PACK_INFO)
  evidence.activity.telemetry = 'evidence'
  lesson.blocks.push(evidence)

  assert.equal(addActivityOutcome(lesson, 1, 'int-files-organize'), true)
  assert.equal(addActivityOutcome(lesson, 1, 'int-files-organize'), false, 'no duplicate link')
  assert.deepEqual(lesson.learningOutcomes, [{ outcomeId: 'int-files-organize', role: 'practised' }])
  addActivityOutcome(lesson, 2, 'int-files-name-extension')
  assert.deepEqual(lesson.learningOutcomes[1], { outcomeId: 'int-files-name-extension', role: 'assessed' })
  addLessonOutcome(lesson, 'int-files-extra')

  const coverage = outcomeCoverage(lesson)
  assert.deepEqual(coverage.map(c => [c.outcomeId, c.activities.length, c.measured]), [
    ['int-files-organize', 1, false],
    ['int-files-name-extension', 1, true],
    ['int-files-extra', 0, false],
  ])

  removeLessonOutcome(lesson, 'int-files-extra')
  assertValid(lesson, 'linked outcomes')

  removeLessonOutcome(lesson, 'int-files-name-extension')
  assert.equal(lesson.blocks[2].activity.outcomes, undefined)
})

test('a game can only be supporting evidence', () => {
  const lesson = newLesson({ id: 'g2-m2-l8', title: 'Файли', grade: 2, pack: PACK_INFO })
  const block = newBlock('activity', lesson, PACK_INFO)
  block.activity = activityTemplate('game', 'game-1', PACK_INFO)
  lesson.blocks.push(block)
  addActivityOutcome(lesson, 1, 'int-files-organize')
  assert.equal(block.activity.outcomes[0].evidenceRole, 'supporting')
})

test('teacher-only blocks leave the board; the board needs children to see the block', () => {
  const lesson = newLesson({ id: 'g2-m2-l8', title: 'Файли', grade: 2, pack: PACK_INFO })
  const block = newBlock('explanation', lesson, PACK_INFO)
  setStudentAudience(block, false)
  assert.deepEqual([block.views.presentation, block.presentation], [false, undefined])
  setOnBoard(block, true)
  assert.equal(block.views.presentation, false, 'stays off while teacher-only')
  setStudentAudience(block, true)
  setOnBoard(block, true)
  assert.deepEqual(block.presentation, { layout: 'concept' })
  assert.deepEqual(shortTextFromLines(' a \n\n b\nc\nd\ne\nf '), ['a', 'b', 'c', 'd', 'e'].map(uk => ({ uk })))
  assert.equal(shortTextFromLines(' \n '), undefined)
})

test('preview drops answer keys; issues are grouped per block and read in Ukrainian', () => {
  const lesson = newLesson({ id: 'g2-m2-l8', title: 'Файли', grade: 2, pack: PACK_INFO })
  lesson.blocks.push(newBlock('activity', lesson, PACK_INFO))
  assert.equal(withoutAnswerKeys(lesson).blocks[1].activity.scoring.key, undefined)
  assert.ok(lesson.blocks[1].activity.scoring.key, 'the draft keeps its key')

  const { lesson: top, blocks } = groupIssues([
    { path: 'title.uk', message: 'must be a non-empty string' },
    { path: 'blocks[2].content.paragraphs[0].uk', message: 'must not contain HTML markup' },
    { path: 'blocks[2]', message: 'must be an object' },
    { path: 'objectives[1].text.uk', message: 'must be a non-empty string' },
  ])
  assert.deepEqual(top.map(describeLessonIssue), ['Назва: не може бути порожнім', 'Цілі 2 → text.uk: не може бути порожнім'])
  assert.deepEqual(blocks.get(2), [
    { path: 'content.paragraphs[0].uk', message: 'must not contain HTML markup' },
    { path: '', message: 'must be an object' },
  ])
})

test('drag and drop moves a block to any position and ignores no-op or out-of-range moves', () => {
  const lesson = newLesson({ id: 'g2-m1-l1', title: 'Урок', grade: 2, pack: PACK_INFO })
  for (const type of ['explanation', 'canvas', 'reflection']) lesson.blocks.push(newBlock(type, lesson, PACK_INFO))
  const ids = () => lesson.blocks.map(b => b.id.slice(-3))
  assert.equal(moveBlockTo(lesson, 3, 0), true)
  assert.deepEqual(ids(), ['b04', 'b01', 'b02', 'b03'])
  assert.equal(moveBlockTo(lesson, 0, 2), true)
  assert.deepEqual(ids(), ['b01', 'b02', 'b04', 'b03'])
  assert.equal(moveBlockTo(lesson, 1, 1), false)
  assert.equal(moveBlockTo(lesson, 0, 4), false)
  assert.equal(moveBlockTo(lesson, -1, 0), false)
  assert.deepEqual(ids(), ['b01', 'b02', 'b04', 'b03'])
})
