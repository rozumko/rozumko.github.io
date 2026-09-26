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
  convertToCanvas,
  CONVERTIBLE_TYPES,
  newBlock,
  newLesson,
  nextBlockId,
  outcomeCoverage,
  outcomeItemChoices,
  removeLessonOutcome,
  setOutcomeItems,
  MIN_ITEMS_PER_OUTCOME,
  activityReadiness,
  addClassifyCategory,
  addClassifyItem,
  cardsLabel,
  moveClassifyItem,
  removeClassifyCategory,
  removeClassifyItem,
  setActivityPurpose,
  toggleItemOutcome,
  addChoiceOption,
  addStatement,
  removeChoiceOption,
  removeStatement,
  setChoiceCorrect,
  setStatementAnswer,
  renameLesson,
  setOnBoard,
  setStudentAudience,
  shortTextFromLines,
  withoutAnswerKeys,
} from './curriculum-model.ts'
import { ACTIVITY_MECHANICS, LESSON_BLOCK_TYPES } from '../lesson-engine/types.ts'
import { MIN_ITEMS_PER_OUTCOME as SERVER_MIN_ITEMS, validateLessonAgainstPack, validateLessonDefinition } from '../../backend/src/lib/curriculum-lesson-schema.ts'
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
  assert.deepEqual(outcomeItemChoices(block.activity), [], 'a game has no items to split evidence by')
})

test('an outcome link narrows to chosen classify items; all items means the whole activity', () => {
  const activity = activityTemplate('classify', 'sort-1', PACK_INFO)
  activity.config.items.push({ id: 'i3', label: { uk: 'Предмет 3' } })
  activity.scoring.key.placement.i3 = 'c1'
  const link = { outcomeId: 'int-files-organize', evidenceRole: 'primary' }
  assert.deepEqual(outcomeItemChoices(activity).map(c => c.label), ['Предмет 1', 'Предмет 2', 'Предмет 3'])

  setOutcomeItems(activity, link, ['i3', 'i1', 'ghost'])
  assert.deepEqual(link.items, ['i1', 'i3'], 'config order, unknown ids dropped')
  setOutcomeItems(activity, link, ['i1', 'i2', 'i3'])
  assert.equal('items' in link, false)
  assert.deepEqual(outcomeItemChoices({ ...activity, scoring: { mode: 'client-unverified' } }), [])
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

const REFERENCE_LESSON = JSON.parse(readFileSync(new URL('../../backend/src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8'))

test('every old-style block of the reference lesson converts into a valid «Текст і медіа» block', () => {
  const lesson = structuredClone(REFERENCE_LESSON)
  const before = lesson.blocks.map(b => ({ id: b.id, type: b.type, step: b.runtime?.step, board: b.views.presentation, student: b.audience.student }))
  let converted = 0
  for (const block of lesson.blocks) if (convertToCanvas(block, lesson)) converted++
  assert.ok(converted >= 5, `converted ${converted}`)
  assertValid(lesson, 'converted reference lesson')
  lesson.blocks.forEach((block, i) => {
    const old = before[i]
    assert.equal(block.id, old.id, 'ids and order are kept')
    if (!CONVERTIBLE_TYPES.has(old.type)) return assert.equal(block.type, old.type)
    assert.equal(block.type, 'canvas')
    assert.equal(block.runtime?.step, old.step, `${old.id}: step kept`)
    // A slide stays a slide, a teacher-only block stays off the board.
    assert.equal(block.views.presentation, old.board && old.student, `${old.id}: board kept`)
    if (!old.student) assert.equal(block.audience.student, false)
  })
})

test('conversion keeps the expected answer for the teacher only and carries slide points to the board', () => {
  const lesson = structuredClone(REFERENCE_LESSON)
  const block = newBlock('discussion', lesson, PACK_INFO)
  block.content = { heading: { uk: 'Обговорімо' }, prompt: { uk: 'Де зберігаються файли?' }, expectedResponse: { uk: 'У папках.' } }
  block.presentation = { layout: 'question', shortText: [{ uk: 'Папка' }, { uk: 'Файл' }], speakerNotes: { uk: 'Дайте хвилину.' } }
  lesson.blocks.push(block)
  assert.equal(convertToCanvas(block, lesson), true)
  const json = (items) => JSON.stringify(items)
  assert.ok(json(block.content.teacher).includes('Очікувана відповідь: У папках.'))
  assert.ok(!json(block.content.board).includes('У папках'))
  assert.deepEqual(block.content.board, [{ type: 'list', items: [{ uk: 'Папка' }, { uk: 'Файл' }] }])
  assert.deepEqual(block.presentation, { layout: 'question', speakerNotes: { uk: 'Дайте хвилину.' } })
  assert.equal(block.content.heading.uk, 'Обговорімо')
  assertValid(lesson, 'converted discussion')

  const activity = newBlock('activity', lesson, PACK_INFO)
  assert.equal(convertToCanvas(activity, lesson), false)
  assert.equal(activity.type, 'activity')
})

// ── Activity dialog ─────────────────────────────────────────────────────────

test('card labels agree in number; the editor and the server ask for the same card minimum', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(cardsLabel), ['1 картка', '2 картки', '5 карток', '11 карток', '21 картка', '22 картки', '25 карток'])
  assert.equal(MIN_ITEMS_PER_OUTCOME, SERVER_MIN_ITEMS)
})

function sortingLesson() {
  const lesson = newLesson({ id: 'g1-m2-l9', title: 'Пристрої', grade: 1, pack: PACK_INFO })
  const block = newBlock('activity', lesson, PACK_INFO)
  block.activity = activityTemplate('classify', 'sort-devices', PACK_INFO)
  lesson.blocks.push(block)
  for (const [label, group] of [['Клавіатура', 'c1'], ['Монітор', 'c2'], ['Сканер', 'c1'], ['Проєктор', 'c2']]) {
    const id = addClassifyItem(block.activity, group)
    block.activity.config.items.find(item => item.id === id).label = { uk: label }
  }
  return { lesson, block, index: lesson.blocks.length - 1 }
}

const code = id => id.toUpperCase()

test('outcomes on a practice task are flagged; one purpose switch makes it valid evidence on devices', () => {
  const { lesson, block, index } = sortingLesson()
  block.activity.attempts = { max: 10 }
  addActivityOutcome(lesson, index, 'int-files-organize')
  const before = activityReadiness(block, code)
  assert.equal(before.find(c => c.fix)?.fix, 'make-evidence')

  setActivityPurpose(lesson, block, 'evidence')
  assert.equal(block.activity.telemetry, 'evidence')
  assert.equal('attempts' in block.activity, false, 'evidence falls back to one attempt')
  assert.equal(block.views.remote, true)
  assert.equal(lesson.learningOutcomes.find(l => l.outcomeId === 'int-files-organize').role, 'assessed')
  assert.deepEqual(activityReadiness(block, code).filter(c => c.level === 'warn'), [])
  assertValid(lesson, 'evidence sorting')

  block.views.remote = false
  assert.equal(activityReadiness(block, code).find(c => c.fix)?.fix, 'send-to-devices')
})

test('card tags split one sorting between two skills and the result passes the server validator', () => {
  const { lesson, block, index } = sortingLesson()
  addActivityOutcome(lesson, index, 'int-files-organize')
  addActivityOutcome(lesson, index, 'int-files-name-extension')
  setActivityPurpose(lesson, block, 'evidence')
  const [familiar, fresh] = block.activity.outcomes
  const ids = block.activity.config.items.map(item => item.id)
  for (const id of ids.slice(3)) toggleItemOutcome(block.activity, familiar, id)
  for (const id of ids.slice(0, 3)) toggleItemOutcome(block.activity, fresh, id)
  assert.deepEqual(familiar.items, ids.slice(0, 3))
  assert.deepEqual(fresh.items, ids.slice(3))
  assert.deepEqual(activityReadiness(block, code).filter(c => c.level === 'warn'), [])
  assertValid(lesson, 'split sorting')

  // The template brings two cards, so there are six: leave one for the second skill.
  toggleItemOutcome(block.activity, fresh, ids[4])
  toggleItemOutcome(block.activity, fresh, ids[5])
  const warns = activityReadiness(block, code).filter(c => c.level === 'warn').map(c => c.text)
  assert.ok(warns.some(t => t.startsWith('INT-FILES-NAME-EXTENSION: потрібно щонайменше 2')), warns.join('\n'))
  assert.ok(warns.some(t => t.startsWith('Не рахується в жодне вміння')), warns.join('\n'))
})

test('cards move between groups; removing a card or a group keeps the key and the tags consistent', () => {
  const { lesson, block, index } = sortingLesson()
  const activity = block.activity
  addActivityOutcome(lesson, index, 'int-files-organize')
  const link = activity.outcomes[0]
  const [first, second] = activity.config.items.map(item => item.id)
  toggleItemOutcome(activity, link, second)
  moveClassifyItem(activity, first, 'c2')
  assert.equal(activity.scoring.key.placement[first], 'c2')
  moveClassifyItem(activity, first, 'nope')
  assert.equal(activity.scoring.key.placement[first], 'c2', 'unknown groups are ignored')

  assert.equal(removeClassifyItem(activity, first), true)
  assert.equal(first in activity.scoring.key.placement, false)
  assert.equal(link.items.includes(first), false)

  const extra = addClassifyCategory(activity)
  moveClassifyItem(activity, second, extra)
  assert.equal(removeClassifyCategory(activity, extra), true)
  assert.equal(activity.scoring.key.placement[second], 'c1', 'orphaned cards move to the first group')
  assert.equal(removeClassifyCategory(activity, 'c2'), false, 'two groups is the minimum')
  assertValid(lesson, 'edited sorting')
})

test('choice options: two to six, removing the right answer moves it, readiness sees empty text', () => {
  const lesson = newLesson({ id: 'g1-m2-l9', title: 'Пристрої', grade: 1, pack: PACK_INFO })
  const block = newBlock('activity', lesson, PACK_INFO)
  block.activity = activityTemplate('choice', 'pick-1', PACK_INFO)
  lesson.blocks.push(block)
  const activity = block.activity
  assert.equal(removeChoiceOption(activity, 'b'), false, 'two options is the minimum')
  const c = addChoiceOption(activity)
  assert.ok(activityReadiness(block, code).some(check => check.text === 'Є варіант без тексту.'))
  activity.config.options.find(o => o.id === c).text = { uk: 'Варіант В' }
  setChoiceCorrect(activity, c)
  assert.equal(activity.scoring.key.correctOptionId, c)
  setChoiceCorrect(activity, 'ghost')
  assert.equal(activity.scoring.key.correctOptionId, c, 'unknown ids are ignored')
  assert.equal(removeChoiceOption(activity, c), true)
  assert.equal(activity.scoring.key.correctOptionId, 'a', 'the first remaining option becomes right')
  while (addChoiceOption(activity)) { /* fill up */ }
  assert.equal(activity.config.options.length, 6)
  for (const option of activity.config.options) if (!option.text.uk) option.text = { uk: 'Варіант' }
  assertValid(lesson, 'six options')
})

test('truefalse statements: answers and outcome tags follow adds and removals', () => {
  const lesson = newLesson({ id: 'g1-m2-l9', title: 'Пристрої', grade: 1, pack: PACK_INFO })
  const block = newBlock('activity', lesson, PACK_INFO)
  block.activity = activityTemplate('truefalse', 'tf-1', PACK_INFO)
  lesson.blocks.push(block)
  const activity = block.activity
  const index = lesson.blocks.length - 1
  assert.equal(removeStatement(activity, 's1'), false, 'one statement is the minimum')
  const s2 = addStatement(activity)
  const s3 = addStatement(activity)
  assert.equal(activity.scoring.key.answers[s2], true, 'a new statement starts as «Так»')
  setStatementAnswer(activity, s2, false)
  assert.equal(activity.scoring.key.answers[s2], false)
  for (const s of activity.config.statements) s.text = { uk: `Твердження ${s.id}` }

  addActivityOutcome(lesson, index, 'int-files-organize')
  setActivityPurpose(lesson, block, 'evidence')
  const link = activity.outcomes[0]
  toggleItemOutcome(activity, link, 's1')
  assert.deepEqual(link.items, [s2, s3])
  assertValid(lesson, 'tagged statements')

  assert.equal(removeStatement(activity, s3), true)
  assert.equal(s3 in activity.scoring.key.answers, false)
  assert.deepEqual(link.items, [s2])
  assert.ok(activityReadiness(block, code).some(check => check.level === 'warn' && check.text.includes('щонайменше 2')))
})
