import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as frontendTypes from './types.ts'
import * as backendSchema from '../../backend/src/lib/curriculum-lesson-schema.ts'
import { parseRichText } from './rich-text.ts'
import { documentBlocks, presentationSlides, BLOCK_TYPE_LABELS, lessonMetaLine } from './projection.ts'
import { answerFromSelection, boardActivityMode, boardQuestions, gameResultEnvelope } from './board-answers.ts'
import { canNavigate, isOpenRun, runLifecycleActions, stepAttachments, stepTitle } from './run-model.ts'
import * as runState from '../../backend/src/lib/lesson-run-state.ts'

const fixture = JSON.parse(readFileSync(
  new URL('../../backend/src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8',
))
/** Exactly what the teacher API serves: the published snapshot without answer keys. */
const servedLesson = backendSchema.toDisplaySafeLesson(fixture)

test('frontend lesson enums stay in sync with the backend schema', () => {
  for (const name of ['LESSON_BLOCK_TYPES', 'PRESENTATION_LAYOUTS', 'ACTIVITY_MECHANICS', 'ACTIVITY_TELEMETRY', 'BLOCK_MODALITIES']) {
    assert.deepEqual([...frontendTypes[name]], [...backendSchema[name]], name)
  }
  assert.deepEqual(Object.keys(BLOCK_TYPE_LABELS).sort(), [...frontendTypes.LESSON_BLOCK_TYPES].sort())
})

test('rich text supports only bold and code; anything tag-like stays plain text', () => {
  assert.deepEqual(parseRichText('Файл **А**: `x.png` і все'), [
    { kind: 'text', text: 'Файл ' },
    { kind: 'strong', text: 'А' },
    { kind: 'text', text: ': ' },
    { kind: 'code', text: 'x.png' },
    { kind: 'text', text: ' і все' },
  ])
  assert.deepEqual(parseRichText('<img src=x onerror=alert(1)>'), [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
  assert.deepEqual(parseRichText('**незакрите'), [{ kind: 'text', text: '**незакрите' }])
  assert.deepEqual(parseRichText(''), [])
})

test('the board shows only student-facing blocks with an authored projection, in lesson order', () => {
  const slides = presentationSlides(servedLesson)
  assert.deepEqual(slides.map(slide => slide.blockId), [
    'g2-m2-l8-b01', 'g2-m2-l8-b03', 'g2-m2-l8-b04', 'g2-m2-l8-b05', 'g2-m2-l8-b06', 'g2-m2-l8-b07',
    'g2-m2-l8-b08', 'g2-m2-l8-b10', 'g2-m2-l8-b11', 'g2-m2-l8-b12', 'g2-m2-l8-b13', 'g2-m2-l8-b14',
  ])
  assert.deepEqual(slides.find(slide => slide.blockId === 'g2-m2-l8-b06').assets.map(asset => asset.id), ['file-flow'])
})

test('a teacher-only block never reaches the board, even with forged view flags', () => {
  const forged = structuredClone(servedLesson)
  const note = forged.blocks.find(block => block.type === 'teacher-note')
  note.views.presentation = true
  note.presentation = { layout: 'concept', headline: { uk: 'секрет' } }
  assert.ok(!presentationSlides(forged).some(slide => slide.blockId === note.id))

  note.audience.student = true
  assert.ok(!presentationSlides(forged).some(slide => slide.blockId === note.id), 'teacher-note is never a slide')
})

test('the teacher document keeps teacher notes and every document block', () => {
  const blocks = documentBlocks(servedLesson)
  assert.equal(blocks.length, servedLesson.blocks.length)
  assert.ok(blocks.some(block => block.type === 'teacher-note'))
})

test('the served lesson used by the views carries no answer keys', () => {
  const serialized = JSON.stringify(servedLesson)
  for (const leak of ['"key":', 'correctOptionId', '"explanation":']) assert.ok(!serialized.includes(leak), leak)
})

test('lesson meta line reads naturally', () => {
  assert.equal(lessonMetaLine(servedLesson), '2 клас · Урок 8 · 40 хв')
  assert.equal(lessonMetaLine({ grade: 1, durationMin: 20 }), '1 клас · 20 хв')
})

// ── Board activities (stage E) ───────────────────────────────────────────────

const activityById = id => servedLesson.blocks.find(block => block.activity?.instanceId === id).activity
const synthetic = backendSchema.toDisplaySafeLesson(JSON.parse(readFileSync(
  new URL('../../backend/src/lib/curriculum-fixtures/test-subject.lesson.json', import.meta.url), 'utf8',
)))
const syntheticActivity = id => synthetic.blocks.find(block => block.activity?.instanceId === id).activity

test('board mode: practice and checkpoints together, evidence by students only, games mounted', () => {
  assert.equal(boardActivityMode(activityById('try-meaningful-name')), 'together')
  assert.equal(boardActivityMode(activityById('self-check-extension')), 'students-only')
  assert.equal(boardActivityMode(activityById('windows-trainer')), 'view-only')
  assert.equal(boardActivityMode(syntheticActivity('check-statements')), 'together')
  assert.equal(boardActivityMode({ ...activityById('windows-trainer'), mechanic: 'game', scoring: { mode: 'client-unverified' } }), 'game')
})

test('board questions use Ukrainian option letters and cover every statement or item', () => {
  const [choice] = boardQuestions(activityById('try-meaningful-name'))
  assert.deepEqual(choice.options.map(option => option.label.slice(0, 2)), ['А)', 'Б)'])
  assert.deepEqual(boardQuestions(syntheticActivity('check-statements')).map(q => q.id), ['s1', 's2'])
  assert.deepEqual(boardQuestions(syntheticActivity('sort-a-b')).map(q => q.options.map(o => o.value)), [['a', 'b'], ['a', 'b']])
})

test('an answer is built only once every question is answered', () => {
  const tf = syntheticActivity('check-statements')
  assert.equal(answerFromSelection(tf, new Map([['s1', 'true']])), null)
  assert.deepEqual(answerFromSelection(tf, new Map([['s1', 'true'], ['s2', 'false']])), { answers: { s1: true, s2: false } })
  assert.deepEqual(answerFromSelection(activityById('try-meaningful-name'), new Map([['choice', 'b']])), { optionId: 'b' })
  assert.deepEqual(
    answerFromSelection(syntheticActivity('sort-a-b'), new Map([['i1', 'a'], ['i2', 'b']])),
    { placement: { i1: 'a', i2: 'b' } },
  )
})

test('a game result is always client-unverified and clamped', () => {
  assert.deepEqual(gameResultEnvelope('g1', { correct: 12, total: 10, mistakes: -3, durationSec: 41.7 }), {
    activityInstanceId: 'g1', status: 'submitted', correct: 10, total: 10, mistakes: 0,
    normalizedScore: 1, durationSec: 41, trust: 'client-unverified',
  })
  assert.equal(gameResultEnvelope('g1', { correct: 0, total: 0, mistakes: 0, durationSec: 0 }).normalizedScore, 0)
})

// ── Run console (stage F) ────────────────────────────────────────────────────

test('console lifecycle buttons match the server state machine exactly', () => {
  for (const status of ['prepared', 'active', 'paused', 'finished', 'cancelled']) {
    const serverAllowed = runState.LESSON_RUN_ACTIONS.filter(action => {
      try { runState.applyRunAction(status, action); return true } catch { return false }
    })
    // The console folds "cancel" away once the lesson has started; finishing covers it.
    const shown = runLifecycleActions(status)
    for (const action of shown) assert.ok(serverAllowed.includes(action), `${status}: ${action} would be refused`)
    assert.equal(canNavigate(status), status === 'active' || status === 'paused')
    assert.equal(isOpenRun(status), ['prepared', 'active', 'paused'].includes(status))
  }
  assert.deepEqual(runLifecycleActions('prepared'), ['start', 'cancel'])
  assert.deepEqual(runLifecycleActions('finished'), [])
})

test('non-step blocks travel with the step they follow', () => {
  const steps = runState.runSteps(fixture)
  const attachments = stepAttachments(servedLesson, steps)
  assert.deepEqual(attachments.get('g2-m2-l8-b01').map(block => block.id), ['g2-m2-l8-b02'])
  assert.deepEqual(attachments.get('g2-m2-l8-b08').map(block => block.id), ['g2-m2-l8-b09'])
  assert.deepEqual(attachments.get('g2-m2-l8-b14').map(block => block.id), ['g2-m2-l8-b15'])
  assert.equal([...attachments.values()].flat().length + steps.length, servedLesson.blocks.length)
})

test('step titles prefer the authored board headline', () => {
  const byId = id => servedLesson.blocks.find(block => block.id === id)
  assert.equal(stepTitle(byId('g2-m2-l8-b07'), 'x'), 'Яка назва краща?')
  assert.equal(stepTitle(undefined, 'fallback'), 'fallback')
})
