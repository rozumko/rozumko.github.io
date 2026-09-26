import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  toDisplaySafeLesson,
  validateLessonAgainstPack,
  validateLessonDefinition,
  validateSubjectPack,
  type LessonDefinitionV1,
  type SubjectPack,
} from './curriculum-lesson-schema.js'
import { SUBJECT_PACKS, findSubjectPack, withOutcomes } from './subject-packs.js'
import { resolveActivityDefinition } from './school-activities.js'

function fixture(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`./curriculum-fixtures/${name}`, import.meta.url), 'utf8'))
}

const PILOT_OUTCOMES = fixture('pilot-outcomes.json')
/** The informatics pack as resolveSubjectPack() returns it with the seeded directory. */
function informaticsPack(): SubjectPack {
  return withOutcomes(structuredClone(findSubjectPack('informatics-ua-primary')!), structuredClone(PILOT_OUTCOMES))
}

function expectValid(input: unknown): LessonDefinitionV1 {
  const result = validateLessonDefinition(input)
  assert.ok(result.ok, `expected valid lesson, got: ${JSON.stringify(!result.ok && result.errors, null, 2)}`)
  return result.lesson
}

function expectError(input: unknown, path: string): void {
  const result = validateLessonDefinition(input)
  assert.equal(result.ok, false, `expected an error at ${path}`)
  if (result.ok) return
  assert.ok(
    result.errors.some(e => e.path === path),
    `expected an error at ${path}, got: ${result.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`,
  )
}

function blockIndex(lesson: Record<string, any>, id: string): number {
  const index = lesson.blocks.findIndex((b: { id: string }) => b.id === id)
  assert.ok(index >= 0, `fixture block ${id} is missing`)
  return index
}

/** Collects every value stored under `name` anywhere in a JSON tree. */
function findKeyDeep(value: unknown, name: string, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) value.forEach(v => findKeyDeep(v, name, found))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === name) found.push(v)
      findKeyDeep(v, name, found)
    }
  }
  return found
}

// ── Reference lesson and subject independence ────────────────────────────────

test('every registered subject pack is itself valid', () => {
  assert.ok(Object.keys(SUBJECT_PACKS).length > 0)
  for (const [id, pack] of Object.entries(SUBJECT_PACKS)) {
    assert.equal(pack.id, id)
    assert.deepEqual(validateSubjectPack(withOutcomes(pack, {})), [], id)
  }
  assert.equal(findSubjectPack('constructor'), null)
  assert.equal(findSubjectPack('unknown-pack'), null)
})

test('reference lesson g2-m2-l8 validates against the registered informatics pack', () => {
  const lesson = expectValid(fixture('g2-m2-l8.lesson.json'))
  assert.deepEqual(validateLessonAgainstPack(lesson, informaticsPack()), [])
})

test('a synthetic non-informatics lesson runs through the same core validator', () => {
  const lesson = expectValid(fixture('test-subject.lesson.json'))
  const pack = fixture('test-subject.pack.json')
  assert.deepEqual(validateSubjectPack(pack), [])
  assert.deepEqual(validateLessonAgainstPack(lesson, pack as never), [])
})

test('core schema module carries no subject-specific knowledge', () => {
  const source = readFileSync(fileURLToPath(new URL('./curriculum-lesson-schema.ts', import.meta.url)), 'utf8')
  for (const word of ['informatics', 'itnauka', 'mathematics', 'algorithm', 'nush', 'cambridge']) {
    assert.ok(!source.toLowerCase().includes(word), `core schema mentions "${word}"`)
  }
})

// ── Answer-key protection ─────────────────────────────────────────────────────

test('display-safe projection strips every answer key and leaves the source intact', () => {
  for (const name of ['g2-m2-l8.lesson.json', 'test-subject.lesson.json']) {
    const lesson = expectValid(fixture(name))
    const keysBefore = findKeyDeep(lesson, 'key').length
    assert.ok(keysBefore > 0, `${name} should exercise server-scored activities`)

    const safe = toDisplaySafeLesson(lesson)
    const serialized = JSON.stringify(safe)
    assert.deepEqual(findKeyDeep(safe, 'key'), [], `${name}: answer key leaked`)
    for (const leak of ['correctOptionId', 'placement', '"answers"', '"explanation":']) {
      assert.ok(!serialized.includes(leak), `${name}: "${leak}" leaked into the display-safe lesson`)
    }
    assert.equal(findKeyDeep(lesson, 'key').length, keysBefore, 'source lesson must not be mutated')
  }
})

test('a scoring key is required for server scoring and forbidden otherwise', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b12')

  const noKey = structuredClone(lesson)
  delete noKey.blocks[i].activity.scoring.key
  expectError(noKey, `blocks[${i}].activity.scoring.key`)

  const keyWithoutServer = structuredClone(lesson)
  keyWithoutServer.blocks[i].activity.scoring.mode = 'teacher-observed'
  expectError(keyWithoutServer, `blocks[${i}].activity.scoring.key`)

  const danglingKey = structuredClone(lesson)
  danglingKey.blocks[i].activity.scoring.key.correctOptionId = 'z'
  expectError(danglingKey, `blocks[${i}].activity.scoring.key.correctOptionId`)
})

test('answer data cannot hide in display-safe config', () => {
  const lesson = fixture('test-subject.lesson.json')
  const i = blockIndex(lesson, 'ts-l1-b03')
  lesson.blocks[i].activity.config.statements[0].isTrue = true
  expectError(lesson, `blocks[${i}].activity.config.statements[0].isTrue`)
})

test('classify and truefalse keys must cover every item exactly', () => {
  const lesson = fixture('test-subject.lesson.json')
  const tf = blockIndex(lesson, 'ts-l1-b03')
  const cl = blockIndex(lesson, 'ts-l1-b04')

  const missing = structuredClone(lesson)
  delete missing.blocks[tf].activity.scoring.key.answers.s2
  expectError(missing, `blocks[${tf}].activity.scoring.key.answers.s2`)

  const unknownCategory = structuredClone(lesson)
  unknownCategory.blocks[cl].activity.scoring.key.placement.i1 = 'zzz'
  expectError(unknownCategory, `blocks[${cl}].activity.scoring.key.placement.i1`)

  const extraItem = structuredClone(lesson)
  extraItem.blocks[cl].activity.scoring.key.placement.ghost = 'a'
  expectError(extraItem, `blocks[${cl}].activity.scoring.key.placement.ghost`)
})

test('an outcome link may narrow evidence to at least two known, distinct items of a server-scored activity', () => {
  const lesson = fixture('test-subject.lesson.json')
  const cl = blockIndex(lesson, 'ts-l1-b04')
  const at = `blocks[${cl}].activity.outcomes[0].items`
  const withItems = (items: unknown, patch: (a: Record<string, any>) => void = () => {}) => {
    const copy = structuredClone(lesson)
    copy.blocks[cl].activity.outcomes[0].items = items
    patch(copy.blocks[cl].activity)
    return copy
  }

  expectValid(withItems(['i1', 'i2']))
  expectError(withItems(['i1']), at)
  expectError(withItems(['i1', 'ghost']), `${at}[1]`)
  expectError(withItems(['i1', 'i1']), `${at}[1]`)
  expectError(withItems('i1'), at)
  // Per-item evidence needs per-item server scoring: not a game, not a client-reported result.
  expectError(withItems(['i1', 'i2'], a => {
    a.scoring = { mode: 'client-unverified' }
    a.outcomes[0].evidenceRole = 'supporting'
  }), at)
})

// ── Audience and projection boundaries ───────────────────────────────────────

test('teacher-only material never reaches presentation or remote views', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b02')

  const onBoard = structuredClone(lesson)
  onBoard.blocks[i].views.presentation = true
  onBoard.blocks[i].presentation = { layout: 'concept' }
  expectError(onBoard, `blocks[${i}].views`)

  const toStudents = structuredClone(lesson)
  toStudents.blocks[i].audience.student = true
  expectError(toStudents, `blocks[${i}].audience.student`)
})

test('only activity blocks can be dispatched to student devices', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b05')
  lesson.blocks[i].views.remote = true
  expectError(lesson, `blocks[${i}].views.remote`)
})

test('a board-visible block needs an authored presentation projection', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b05')

  const missing = structuredClone(lesson)
  delete missing.blocks[i].presentation
  expectError(missing, `blocks[${i}].presentation`)

  const hidden = structuredClone(lesson)
  hidden.blocks[i].views.presentation = false
  expectError(hidden, `blocks[${i}].presentation`)
})

// ── Stable IDs and references ────────────────────────────────────────────────

test('block IDs are stable, lesson-prefixed and unique', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')

  const foreign = structuredClone(lesson)
  foreign.blocks[0].id = 'g2-m1-l1-b01'
  expectError(foreign, 'blocks[0].id')

  const duplicate = structuredClone(lesson)
  duplicate.blocks[1].id = duplicate.blocks[0].id
  expectError(duplicate, 'blocks[1].id')

  const instance = structuredClone(lesson)
  const a = blockIndex(instance, 'g2-m2-l8-b07')
  const b = blockIndex(instance, 'g2-m2-l8-b12')
  instance.blocks[b].activity.instanceId = instance.blocks[a].activity.instanceId
  expectError(instance, `blocks[${b}].activity.instanceId`)
})

test('outcome and asset references must resolve inside the lesson', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const visual = blockIndex(lesson, 'g2-m2-l8-b06')
  const check = blockIndex(lesson, 'g2-m2-l8-b12')

  const badAsset = structuredClone(lesson)
  badAsset.blocks[visual].content.assetId = 'missing'
  expectError(badAsset, `blocks[${visual}].content.assetId`)

  const badOutcome = structuredClone(lesson)
  badOutcome.blocks[check].activity.outcomes[0].outcomeId = 'missing'
  expectError(badOutcome, `blocks[${check}].activity.outcomes[0].outcomeId`)
})

// ── Evidence rules ───────────────────────────────────────────────────────────

test('evidence activities must be scored and linked to an outcome', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b12')

  const unlinked = structuredClone(lesson)
  delete unlinked.blocks[i].activity.outcomes
  expectError(unlinked, `blocks[${i}].activity.outcomes`)

  const unscored = structuredClone(lesson)
  unscored.blocks[i].activity.scoring = { mode: 'none' }
  expectError(unscored, `blocks[${i}].activity.scoring.mode`)
})

test('client-unverified results can only be supporting evidence', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b12')
  lesson.blocks[i].activity.scoring = { mode: 'client-unverified' }
  expectError(lesson, `blocks[${i}].activity.outcomes`)

  lesson.blocks[i].activity.outcomes[0].evidenceRole = 'supporting'
  expectValid(lesson)
})

test('launch-only external activities cannot score', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b11')
  lesson.blocks[i].activity.scoring.mode = 'client-unverified'
  expectError(lesson, `blocks[${i}].activity.scoring.mode`)
})

// ── Content hygiene and fail-closed parsing ──────────────────────────────────

test('raw HTML is rejected anywhere in text', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b05')
  lesson.blocks[i].content.paragraphs[0].uk = 'Текст <script>alert(1)</script>'
  expectError(lesson, `blocks[${i}].content.paragraphs[0].uk`)

  const onclick = fixture('g2-m2-l8.lesson.json')
  onclick.title.uk = '<img src=x onerror=alert(1)>'
  expectError(onclick, 'title.uk')
})

test('unknown fields, block types and mechanics fail closed', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')

  const extraTop = structuredClone(lesson)
  extraTop.status = 'published'
  expectError(extraTop, 'status')

  const badType = structuredClone(lesson)
  badType.blocks[0].type = 'binary-block'
  expectError(badType, 'blocks[0].type')

  const badMechanic = structuredClone(lesson)
  const i = blockIndex(badMechanic, 'g2-m2-l8-b07')
  badMechanic.blocks[i].activity.mechanic = 'robot-grid'
  expectError(badMechanic, `blocks[${i}].activity.mechanic`)

  assert.equal(validateLessonDefinition(null).ok, false)
  assert.equal(validateLessonDefinition([]).ok, false)
})

test('media sources are https or relative only', () => {
  const lesson = fixture('g2-m2-l8.lesson.json')
  for (const bad of ['http://example.com/x.svg', 'javascript:alert(1)', '//evil.example/x.svg', 'data:image/svg+xml,<svg/>']) {
    const copy = structuredClone(lesson)
    copy.assets[0].src = bad
    expectError(copy, 'assets[0].src')
  }
})

// ── Subject pack boundary ────────────────────────────────────────────────────

test('external tools must be in the subject pack allowlist', () => {
  const lesson = expectValid(fixture('g2-m2-l8.lesson.json'))
  const pack = informaticsPack() as Record<string, any>
  const i = lesson.blocks.findIndex(b => b.id === 'g2-m2-l8-b11')

  const noTools = { ...pack, externalTools: {} }
  assert.deepEqual(
    validateLessonAgainstPack(lesson, noTools as never).map(e => e.path),
    [`blocks[${i}].activity.config.toolKey`],
  )

  const prototypeKey = structuredClone(fixture('g2-m2-l8.lesson.json'))
  prototypeKey.blocks[i].activity.config.toolKey = 'constructor'
  const parsed = expectValid(prototypeKey)
  assert.equal(validateLessonAgainstPack(parsed, pack as never).length, 1)
})

test('lesson must match its pack subject and grade range', () => {
  const lesson = expectValid(fixture('g2-m2-l8.lesson.json'))
  const pack = fixture('test-subject.pack.json')
  const paths = validateLessonAgainstPack(lesson, pack as never).map(e => e.path)
  assert.ok(paths.includes('subjectPackId'))
  assert.ok(paths.includes('subject'))
  assert.ok(paths.includes('grade'))
})

test('subject pack tools must use https', () => {
  const pack = informaticsPack() as Record<string, any>
  pack.externalTools['itnauka-windows'].url = 'http://itnauka.org/x'
  assert.deepEqual(validateSubjectPack(pack).map(e => e.path), ['externalTools.itnauka-windows.url'])
})

// ── Platform games ───────────────────────────────────────────────────────────

function withGame(game: Record<string, unknown>): Record<string, any> {
  const lesson = fixture('g2-m2-l8.lesson.json')
  const i = blockIndex(lesson, 'g2-m2-l8-b11')
  lesson.blocks[i].activity = {
    instanceId: 'windows-game', mechanic: 'game', telemetry: 'practice',
    config: { gameKey: 'windows', level: 'easy' }, scoring: { mode: 'client-unverified' }, ...game,
  }
  return lesson
}

test('games are client-unverified, carry no key and must be allowlisted by the pack', () => {
  const lesson = expectValid(withGame({}))
  const pack = informaticsPack()
  assert.deepEqual(validateLessonAgainstPack(lesson, pack), [])

  const i = blockIndex(withGame({}), 'g2-m2-l8-b11')
  expectError(withGame({ scoring: { mode: 'server', key: { correctOptionId: 'a' } } }), `blocks[${i}].activity.scoring.mode`)
  expectError(withGame({ scoring: { mode: 'none' } }), `blocks[${i}].activity.scoring.mode`)
  expectError(withGame({ config: { gameKey: 'windows' } }), `blocks[${i}].activity.config.level`)

  const notAllowed = expectValid(withGame({ config: { gameKey: 'fact-or-opinion', level: 'easy' } }))
  assert.deepEqual(validateLessonAgainstPack(notAllowed, pack).map(e => e.path), [`blocks[${i}].activity.config.gameKey`])

  // A game result is client-reported, so it can never be primary evidence.
  expectError(withGame({
    telemetry: 'evidence',
    outcomes: [{ outcomeId: 'int-files-organize', evidenceRole: 'primary' }],
  }), `blocks[${i}].activity.outcomes`)
})

test('pack games exist in the platform registry and none needs a School participant', () => {
  for (const pack of Object.values(SUBJECT_PACKS)) {
    for (const key of pack.games) assert.doesNotThrow(() => resolveActivityDefinition(key), key)
    // fact-or-opinion loads its statements with a School participant token,
    // which the board and lesson runs do not have.
    assert.ok(!pack.games.includes('fact-or-opinion'), pack.id)
  }
})

test('lessons may target only outcomes registered by their subject pack', () => {
  const lesson = expectValid(fixture('g2-m2-l8.lesson.json'))
  const pack = informaticsPack()
  delete (pack.outcomes as Record<string, unknown>)['int-files-organize']
  assert.deepEqual(validateLessonAgainstPack(lesson, pack).map(e => e.path), ['learningOutcomes[1].outcomeId'])

  const broken = informaticsPack() as Record<string, any>
  broken.outcomes['int-files-name-extension'].source = 'rumour'
  assert.deepEqual(validateSubjectPack(broken).map(e => e.path), ['outcomes.int-files-name-extension.source'])
})
