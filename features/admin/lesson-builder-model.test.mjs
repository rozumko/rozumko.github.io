import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
// Browser sources use emitted .js specifiers; Node's type stripper needs .ts.
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) } catch (error) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) return next(specifier.slice(0, -3) + '.ts', context)
    throw error
  }
} })
const { newLesson, newBlock } = await import('./curriculum-model.ts')
const { appendSourceBlocks, resourceItem, makeMaterial, blockKind } = await import('./lesson-builder-model.ts')

const pack = { id: 'test', subject: 'test', gradeRange: { min: 1, max: 4 }, games: [], tools: [] }
const create = id => newLesson({ id, title: 'Урок', grade: 2, pack })

test('resource capture rejects executable URLs and recognizes supported integrations', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//example.org/x', 'http://example.org']) assert.throws(() => resourceItem(url))
  assert.equal(resourceItem('https://youtu.be/dQw4w9WgXcQ').type, 'video')
  assert.equal(resourceItem('https://learningapps.org/view12345').type, 'learningapps')
  assert.equal(resourceItem('https://example.org/a.pdf').type, 'pdf')
  assert.equal(resourceItem('https://example.org/a.png').type, 'image')
  assert.equal(resourceItem('https://example.org').type, 'link')
})

test('copying blocks remaps assets, activity identities and outcome dependencies without changing source', () => {
  const source = create('source')
  const target = create('target')
  source.assets = [{ id: 'img', kind: 'image', src: 'https://example.org/a.png', alt: { uk: 'Схема' } }]
  const visual = newBlock('visual', source, pack)
  visual.content.assetId = 'img'; visual.presentation.assetIds = ['img']; source.blocks.push(visual)
  const task = newBlock('activity', source, pack)
  task.activity.outcomes = [{ outcomeId: 'skill', evidenceRole: 'supporting' }]
  source.learningOutcomes = [{ outcomeId: 'skill', role: 'practised' }]
  source.blocks.push(task)
  const before = structuredClone(source)
  appendSourceBlocks(target, source, [visual, task], pack)
  appendSourceBlocks(target, source, [task], pack)
  assert.deepEqual(source, before)
  assert.equal(new Set(target.blocks.map(b => b.id)).size, target.blocks.length)
  assert.equal(new Set(target.blocks.filter(b => b.activity).map(b => b.activity.instanceId)).size, 2)
  assert.equal(target.blocks[1].content.assetId, target.assets[0].id)
  assert.deepEqual(target.learningOutcomes, source.learningOutcomes)
  assert.deepEqual(target.blocks[2].activity.scoring.key, task.activity.scoring.key)
})

test('a captured HTML card keeps its code and is a projector step with opt-in device display', () => {
  const lesson = create('test-lesson')
  const card = makeMaterial(lesson, pack, 'HTML', [{ type: 'html', html: '<h1>Привіт</h1>' }])
  assert.equal(blockKind(card), 'html')
  assert.equal(card.views.presentation, true)
  assert.equal(card.views.remote, false)
  assert.deepEqual(card.content.student, [])
  assert.equal(card.runtime.step, true)
})
