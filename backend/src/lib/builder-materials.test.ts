import test from 'node:test'
import assert from 'node:assert/strict'
import { MaterialValidationError, materialKind, prepareMaterial } from './builder-materials.js'
import { withoutFilePayloads } from './curriculum-card-index.js'

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString('base64')

test('a material gets the builder kind of its first non-text item', () => {
  assert.equal(materialKind([{ type: 'paragraph', text: { uk: 'Текст' } }]), 'text')
  assert.equal(materialKind([{ type: 'heading', text: { uk: 'Мапа' } }, { type: 'image', src: 'https://example.org/a.png', alt: { uk: 'Кабелі' } }]), 'image')
  assert.equal(materialKind([{ type: 'file', mime: 'application/pdf', data: 'JVBERi0=', name: { uk: 'Схема' } }]), 'pdf')
  assert.equal(materialKind([{ type: 'file', mime: 'image/png', data: PNG, name: { uk: 'Фото' } }]), 'image')
  assert.equal(materialKind([{ type: 'video', videoId: 'dQw4w9WgXcQ' }]), 'video')
})

test('search text holds titles and visible text, never file payloads or HTML code', () => {
  const prepared = prepareMaterial({
    title: 'Підводні КАБЕЛІ',
    items: [
      { type: 'file', mime: 'image/png', data: PNG, name: { uk: 'мапа.png' } },
      { type: 'html', html: '<style>.satellite{color:red}</style><h1>Супутник</h1><script>const orbit = 1</script>' },
    ],
  })
  assert.equal(prepared.kind, 'image')
  assert.match(prepared.searchText, /підводні кабелі/)
  assert.match(prepared.searchText, /мапа\.png/)
  assert.match(prepared.searchText, /супутник/)
  assert.doesNotMatch(prepared.searchText, new RegExp(PNG.slice(0, 8)))
  assert.doesNotMatch(prepared.searchText, /orbit|color/)
})

test('materials use the lesson canvas-item rules and fail closed', () => {
  for (const input of [
    { title: '', items: [{ type: 'paragraph', text: { uk: 'Текст' } }] },
    { title: 'x'.repeat(201), items: [{ type: 'paragraph', text: { uk: 'Текст' } }] },
    { title: 'Порожній', items: [] },
    { title: 'HTML у тексті', items: [{ type: 'paragraph', text: { uk: '<script>alert(1)</script>' } }] },
    { title: 'Невідоме поле', items: [{ type: 'paragraph', text: { uk: 'Текст' }, onclick: 'x' }] },
    { title: 'SVG', items: [{ type: 'file', mime: 'image/svg+xml', data: PNG, name: { uk: 'a' } }] },
    { title: 'Підробка', items: [{ type: 'file', mime: 'image/png', data: Buffer.from('%PDF-1.7').toString('base64'), name: { uk: 'a' } }] },
    { title: 'Активність', items: [{ type: 'activity', instanceId: 'a', mechanic: 'choice' }] },
    { title: 'Не масив', items: { type: 'paragraph' } },
  ]) {
    assert.throws(() => prepareMaterial(input), MaterialValidationError, input.title)
  }
})

test('the card index empties embedded file payloads and keeps everything else', () => {
  const definition = { id: 'l1', blocks: [{ id: 'b1', content: { board: [
    { type: 'file', mime: 'image/png', data: PNG, name: { uk: 'Фото' } },
    { type: 'paragraph', text: { uk: 'data' } },
  ] } }] }
  const stripped = withoutFilePayloads(definition)
  assert.equal(stripped.blocks[0]!.content.board[0]!.data, '')
  assert.equal((stripped.blocks[0]!.content.board[0] as { mime: string }).mime, 'image/png')
  assert.deepEqual(stripped.blocks[0]!.content.board[1], { type: 'paragraph', text: { uk: 'data' } })
  assert.equal(definition.blocks[0]!.content.board[0]!.data, PNG)
})
