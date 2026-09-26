import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateLessonDefinition, toDisplaySafeLesson } from './curriculum-lesson-schema.js'

function lessonWith(item: Record<string, unknown>) {
  const lesson = JSON.parse(readFileSync(new URL('./curriculum-fixtures/test-subject.lesson.json', import.meta.url), 'utf8'))
  lesson.blocks.push({
    id: `${lesson.id}-b99`, type: 'canvas', modality: 'teacher-led', runtime: { step: true },
    audience: { teacher: true, student: true }, views: { document: true, presentation: true, remote: true },
    presentation: { layout: 'concept' },
    content: { heading: { uk: 'Матеріал' }, teacher: [item], board: [item], student: [item] },
  })
  return lesson
}

test('HTML is accepted only in the explicit bounded sandbox item', () => {
  const source = lessonWith({ type: 'html', html: '<style>p{color:red}</style><p>Hi</p><script>document.body.dataset.ready="yes"</script>' })
  const result = validateLessonDefinition(source)
  assert.equal(result.ok, true, JSON.stringify(result))
  if (result.ok) {
    const block = toDisplaySafeLesson(result.lesson).blocks.at(-1)!
    assert.equal(block.type, 'canvas')
    if (block.type === 'canvas') assert.equal(block.content.board[0]!.type, 'html')
  }
  for (const item of [
    { type: 'html', html: 'a'.repeat(65_537) },
    { type: 'html', html: '<p>Hi</p>', sandbox: 'allow-same-origin' },
    { type: 'html', html: '<p>Hi</p>', url: 'https://example.org' },
    { type: 'paragraph', text: { uk: '<script>alert(1)</script>' } },
  ]) assert.equal(validateLessonDefinition(lessonWith(item)).ok, false)
})

test('embedded files allow only bounded canonical raster images and PDFs with matching signatures', () => {
  const pdf = Buffer.from('%PDF-1.7\nexample').toString('base64')
  assert.equal(validateLessonDefinition(lessonWith({ type: 'file', mime: 'application/pdf', data: pdf, name: { uk: 'Документ' } })).ok, true)
  for (const item of [
    { type: 'file', mime: 'text/html', data: pdf, name: { uk: 'Документ' } },
    { type: 'file', mime: 'image/svg+xml', data: pdf, name: { uk: 'Документ' } },
    { type: 'file', mime: 'image/png', data: pdf, name: { uk: 'Документ' } },
    { type: 'file', mime: 'application/pdf', data: 'not base64!', name: { uk: 'Документ' } },
    { type: 'file', mime: 'application/pdf', data: Buffer.from('%PDF-' + 'x'.repeat(524_288)).toString('base64'), name: { uk: 'Документ' } },
  ]) assert.equal(validateLessonDefinition(lessonWith(item)).ok, false)
})
