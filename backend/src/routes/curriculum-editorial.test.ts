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
import { findSubjectPack, withOutcomes } from '../lib/subject-packs.js'

const PILOT_OUTCOMES = JSON.parse(readFileSync(new URL('../lib/curriculum-fixtures/pilot-outcomes.json', import.meta.url), 'utf8'))
/** The informatics pack as resolveSubjectPack() returns it with the seeded directory. */
const PACK = withOutcomes(findSubjectPack('informatics-ua-primary')!, PILOT_OUTCOMES)

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
  const lesson = prepareCurriculumDefinition(raw, 'g2-m2-l8', 3, PACK)
  assert.equal(lesson.metadata.contentVersion, 3)
  assert.equal(raw.metadata.contentVersion, 999, 'input must not be mutated')
})

test('definition must match the row being edited', () => {
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(reference(), 'g2-m1-l1', 1, PACK)), ['id'])
})

test('unregistered subject packs and pack mismatches fail closed', () => {
  const unknownPack = reference()
  unknownPack.subjectPackId = 'unknown-pack'
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(unknownPack, null, 1, PACK)), ['subjectPackId'])

  const outOfRange = reference()
  outOfRange.grade = 7
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(outOfRange, null, 1, PACK)), ['grade'])
})

test('schema errors are reported with paths, not thrown as plain errors', () => {
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(null, null, 1, PACK)), [''])
  const broken = reference()
  broken.blocks[0].type = 'unknown'
  assert.ok(issuePaths(() => prepareCurriculumDefinition(broken, null, 1, PACK)).includes('blocks[0].type'))
})

test('change detection ignores key order and the content version, but not content', () => {
  const stored = prepareCurriculumDefinition(reference(), null, 4, PACK)

  const reordered = Object.fromEntries(Object.entries(reference()).reverse())
  assert.equal(curriculumDefinitionChanged(stored, prepareCurriculumDefinition(reordered, null, 9, PACK)), false)

  const edited = reference()
  edited.blocks[0].content.title.uk = 'Інша назва'
  assert.equal(curriculumDefinitionChanged(stored, prepareCurriculumDefinition(edited, null, 4, PACK)), true)
})

test('row columns mirror the definition', () => {
  const lesson = prepareCurriculumDefinition(reference(), null, 1, PACK)
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

test('game blocks must name a game and level the platform registry has', () => {
  const lesson = reference()
  const i = lesson.blocks.findIndex((b: { id: string }) => b.id === 'g2-m2-l8-b11')
  lesson.blocks[i].activity = {
    instanceId: 'windows-game', mechanic: 'game', telemetry: 'practice',
    config: { gameKey: 'windows', level: 'easy' }, scoring: { mode: 'client-unverified' },
  }
  assert.equal(prepareCurriculumDefinition(lesson, null, 1, PACK).blocks[i]!.type, 'activity')

  lesson.blocks[i].activity.config.level = 'impossible'
  assert.deepEqual(issuePaths(() => prepareCurriculumDefinition(lesson, null, 1, PACK)), [`blocks[${i}].activity.config`])
})
