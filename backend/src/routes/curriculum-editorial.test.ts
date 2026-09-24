import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CURRICULUM_STATUSES,
  CurriculumValidationError,
  curriculumDefinitionChanged,
  curriculumRowColumns,
  curriculumTransitionError,
  draftFromCurriculumRevision,
  prepareCurriculumDefinition,
} from './curriculum-editorial.js'

function reference(): Record<string, any> {
  return JSON.parse(readFileSync(new URL('../lib/curriculum-fixtures/g2-m2-l8.lesson.json', import.meta.url), 'utf8'))
}

function issuePaths(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    assert.ok(err instanceof CurriculumValidationError, `unexpected error: ${String(err)}`)
    return err.issues.map(issue => issue.path)
  }
  assert.fail('expected a CurriculumValidationError')
}

test('workflow: publishing requires review, and published content changes only by editing', () => {
  const allowed = CURRICULUM_STATUSES.flatMap(from => CURRICULUM_STATUSES
    .filter(to => curriculumTransitionError(from, to) === null)
    .map(to => `${from}->${to}`))
  assert.deepEqual(allowed.sort(), [
    'archived->draft',
    'draft->archived',
    'draft->review',
    'published->archived',
    'review->archived',
    'review->draft',
    'review->published',
  ])
  assert.match(curriculumTransitionError('draft', 'published')!, /draft/)
})

test('content version is server-owned and stamped before validation', () => {
  const raw = reference()
  raw.metadata.contentVersion = 999
  const lesson = prepareCurriculumDefinition(raw, 'g2-m2-l8', 3)
  assert.equal(lesson.metadata.contentVersion, 3)
  assert.equal(raw.metadata.contentVersion, 999, 'input must not be mutated')
})

test('definition must match the row being edited', () => {
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(reference(), 'g2-m1-l1', 1)), ['id'])
})

test('unregistered subject packs and pack mismatches fail closed', () => {
  const unknownPack = reference()
  unknownPack.subjectPackId = 'unknown-pack'
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(unknownPack, null, 1)), ['subjectPackId'])

  const outOfRange = reference()
  outOfRange.grade = 7
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(outOfRange, null, 1)), ['grade'])
})

test('schema errors are reported with paths, not thrown as plain errors', () => {
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(null, null, 1)), [''])
  const broken = reference()
  broken.blocks[0].type = 'unknown'
  assert.ok(issuePaths(() => prepareCurriculumDefinition(broken, null, 1)).includes('blocks[0].type'))
})

test('change detection ignores key order and the content version, but not content', () => {
  const stored = prepareCurriculumDefinition(reference(), null, 4)

  const reordered = Object.fromEntries(Object.entries(reference()).reverse())
  assert.equal(curriculumDefinitionChanged(stored, prepareCurriculumDefinition(reordered, null, 9)), false)

  const edited = reference()
  edited.blocks[0].content.title.uk = 'Інша назва'
  assert.equal(curriculumDefinitionChanged(stored, prepareCurriculumDefinition(edited, null, 4)), true)
})

test('row columns mirror the definition', () => {
  const lesson = prepareCurriculumDefinition(reference(), null, 1)
  assert.deepEqual(curriculumRowColumns(lesson), {
    subjectPackId: 'informatics-ua-primary',
    subject: 'informatics',
    grade: 2,
    moduleId: 'g2-m2',
    lessonNumber: 8,
    title: 'Файли й папки: створення, збереження, перейменування та переміщення',
    schemaVersion: 1,
  })
})

test('restore reads the draft from a revision snapshot and rejects snapshots without one', () => {
  const draft = reference()
  assert.equal(draftFromCurriculumRevision({ draftContent: draft }), draft)
  assert.equal(draftFromCurriculumRevision({ draft_content: draft }), draft)
  assert.deepEqual(issuePaths(() => draftFromCurriculumRevision({ status: 'draft' })), ['snapshot'])
})
