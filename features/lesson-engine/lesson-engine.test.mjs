import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as frontendTypes from './types.ts'
import * as backendSchema from '../../backend/src/lib/curriculum-lesson-schema.ts'
import { parseRichText } from './rich-text.ts'
import { documentBlocks, presentationSlides, BLOCK_TYPE_LABELS, lessonMetaLine } from './projection.ts'

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
