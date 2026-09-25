import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { studentPracticeMaterial } from './lesson-student-material.js'
import { validateLessonDefinition, type CanvasBlock, type LessonDefinitionV1, type PracticeBlock } from './curriculum-lesson-schema.js'

const lesson = JSON.parse(readFileSync(new URL('../../src/lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8')) as LessonDefinitionV1
const blockId = lesson.blocks[0]!.id
const practice: PracticeBlock = {
  id: blockId,
  type: 'practice',
  audience: { teacher: true, student: true },
  views: { document: true, presentation: false, remote: true },
  modality: 'paper',
  runtime: { step: true },
  content: {
    heading: { uk: 'Таблиця' },
    table: { headers: [{ uk: 'Назва' }, { uk: 'Рік' }], rows: [[{ uk: 'Книга' }, { uk: '2025' }]] },
    steps: [{ items: [{ uk: 'Запиши відповідь.' }] }],
  },
}

test('student practice projects the complete structured table without teacher fields', () => {
  const copy = structuredClone(lesson)
  copy.blocks[0] = practice
  const result = validateLessonDefinition(copy)
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors))
  const material = studentPracticeMaterial(copy, blockId)
  assert.equal(material?.kind, 'practice')
  if (material?.kind !== 'practice') return
  assert.deepEqual(material?.table?.rows[0]?.map(cell => cell.uk), ['Книга', '2025'])
  assert.deepEqual(material?.steps[0]?.items[0]?.uk, 'Запиши відповідь.')
  assert.equal(JSON.stringify(material).includes('audience'), false)
  copy.blocks[0] = { ...practice, views: { ...practice.views, remote: false } }
  assert.equal(studentPracticeMaterial(copy, blockId), null)
  copy.blocks[0] = { ...practice, audience: { teacher: true, student: false } }
  assert.equal(studentPracticeMaterial(copy, blockId), null)
})

test('practice table rejects mismatched rows and HTML cells', () => {
  const copy = structuredClone(lesson)
  copy.blocks[0] = { ...practice, content: { ...practice.content, table: { headers: [{ uk: 'A' }, { uk: 'B' }], rows: [[{ uk: 'only one' }]] } } }
  const wrongWidth = validateLessonDefinition(copy)
  assert.equal(wrongWidth.ok, false)
  if (!wrongWidth.ok) assert.ok(wrongWidth.errors.some(error => error.path.endsWith('table.rows[0]')))
  copy.blocks[0] = { ...practice, content: { ...practice.content, table: { headers: [{ uk: 'A' }, { uk: 'B' }], rows: [[{ uk: '<script>alert(1)</script>' }, { uk: 'safe' }]] } } }
  const html = validateLessonDefinition(copy)
  assert.equal(html.ok, false)
  if (!html.ok) assert.ok(html.errors.some(error => error.path.endsWith('table.rows[0][0].uk')))
})

test('canvas keeps teacher, board and student content separate', () => {
  const copy = structuredClone(lesson)
  const canvas: CanvasBlock = {
    id: blockId, type: 'canvas', audience: { teacher: true, student: true },
    views: { document: true, presentation: true, remote: true },
    modality: 'teacher-led', runtime: { step: true },
    presentation: { layout: 'concept' },
    content: {
      heading: { uk: 'Що таке інтернет' },
      teacher: [{ type: 'paragraph', text: { uk: 'Нотатка лише для вчителя' } }],
      board: [{ type: 'video', videoId: 'abc123DEF45' }],
      student: [{ type: 'paragraph', text: { uk: 'Матеріал для учня' } }],
    },
  }
  copy.blocks[0] = canvas
  const valid = validateLessonDefinition(copy)
  assert.equal(valid.ok, true, valid.ok ? '' : JSON.stringify(valid.errors))
  const material = studentPracticeMaterial(copy, blockId)
  assert.equal(material?.kind, 'canvas')
  assert.equal(JSON.stringify(material).includes('Нотатка лише для вчителя'), false)
  assert.equal(JSON.stringify(material).includes('abc123DEF45'), false)
  copy.blocks[0] = { ...canvas, content: { ...canvas.content, board: [{ type: 'paragraph', text: { uk: '<script>bad</script>' } }] } }
  assert.equal(validateLessonDefinition(copy).ok, false)
  copy.blocks[0] = { ...canvas, content: { ...canvas.content, board: [{ type: 'image', src: 'javascript:alert(1)', alt: { uk: 'bad' } }] } }
  assert.equal(validateLessonDefinition(copy).ok, false)
  copy.blocks[0] = { ...canvas, content: { ...canvas.content, student: [{ type: 'image', src: 'http://example.com/a.png', alt: { uk: 'plain http' } }] } }
  assert.equal(validateLessonDefinition(copy).ok, false)
  copy.blocks[0] = { ...canvas, content: { ...canvas.content, student: [{ type: 'image', src: 'https://example.com/a.png', alt: { uk: 'https' } }] } }
  assert.equal(validateLessonDefinition(copy).ok, true)
  copy.blocks[0] = { ...canvas, content: { ...canvas.content, student: [{ type: 'list', ordered: true, items: [{ uk: 'Перший' }] }] } }
  assert.equal(validateLessonDefinition(copy).ok, true)
  copy.blocks[0] = { ...canvas, content: { ...canvas.content, student: [{ type: 'list', ordered: 'yes', items: [{ uk: 'Перший' }] }] } as never }
  assert.equal(validateLessonDefinition(copy).ok, false)
})
