import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  MAX_OUTCOME_MAPPINGS,
  OutcomeValidationError,
  generateOutcomeId,
  outcomeColumns,
  outcomeFromRow,
  outcomeRegistry,
  outcomeUsage,
  peekSubjectPackId,
  prepareOutcome,
} from './curriculum-outcome-rules.js'
import type { CurriculumOutcomeRow } from '../db/schema.js'

const PILOT_OUTCOMES = JSON.parse(readFileSync(new URL('./curriculum-fixtures/pilot-outcomes.json', import.meta.url), 'utf8'))
const SEED = readFileSync(new URL('../../drizzle/0057_add_curriculum_outcomes.sql', import.meta.url), 'utf8')

function issuePaths(run: () => unknown): string[] {
  try {
    run()
  } catch (err) {
    assert.ok(err instanceof OutcomeValidationError, String(err))
    return err.issues.map(issue => issue.path)
  }
  assert.fail('expected an OutcomeValidationError')
}

function row(overrides: Partial<CurriculumOutcomeRow> = {}): CurriculumOutcomeRow {
  return {
    id: 'nush-alg-1', subjectPackId: 'informatics-ua-primary', code: '2 ІФО 2.1-1',
    titleUk: 'Складає прості послідовності команд', titleEn: null, source: 'national-standard',
    sourceRef: null, gradeBand: '1-2', mappings: [], status: 'active', editVersion: 1,
    createdBy: null, updatedBy: null, createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  }
}

test('the migration seeds exactly the pilot outcomes the reference lesson uses', () => {
  for (const [id, outcome] of Object.entries(PILOT_OUTCOMES) as [string, { code: string; title: { uk: string } }][]) {
    assert.ok(SEED.includes(`'${id}', 'informatics-ua-primary', '${outcome.code}'`), id)
    assert.ok(SEED.includes(outcome.title.uk), id)
  }
})

test('0058 seeds only internal skills whose mappings pass the directory rules and match the pilot fixture', () => {
  const seed = readFileSync(new URL('../../drizzle/0058_seed_device_outcomes_and_mappings.sql', import.meta.url), 'utf8')
  const literals = [...seed.matchAll(/'(\[\s*\{[^']*\])'::jsonb/g)].map(m => JSON.parse(m[1]!) as unknown[])
  assert.equal(literals.length, 5)
  for (const mappings of literals) {
    const outcome = prepareOutcome({ code: 'X-1', title: { uk: 'Текст' }, source: 'internal', mappings })
    assert.ok(outcome.mappings.every(m => m.strength !== undefined), 'every seeded mapping states its strength')
  }
  // Evidence targets skills; frameworks appear only as mappings.
  for (const values of seed.matchAll(/'informatics-ua-primary', '[^']+',\s*'[^']+', '([a-z-]+)'/g)) {
    assert.equal(values[1], 'internal')
  }
  // The fixture is the directory as it stands after 0060 rewrote portal NUSH codes to normative ones.
  const normative = readFileSync(new URL('../../drizzle/0060_normative_nush_codes.sql', import.meta.url), 'utf8')
  const PORTAL_CODE = String.raw`^([24] ІФО [0-9]\.[0-9])\.1$`
  assert.ok(normative.includes(`'${PORTAL_CODE}'`), '0060 rewrites exactly the portal form')
  const after0060 = (mappings: unknown[]) => mappings.map(m => {
    const mapping = m as { framework: string; ref: string }
    return mapping.framework === 'nush-ifo-2018' ? { ...mapping, ref: mapping.ref.replace(new RegExp(PORTAL_CODE), '$1') } : mapping
  })
  for (const [id, outcome] of Object.entries(PILOT_OUTCOMES) as [string, { mappings: unknown[] }][]) {
    assert.ok(seed.includes(`'${id}'`), id)
    assert.ok(literals.some(m => JSON.stringify(after0060(m)) === JSON.stringify(outcome.mappings)), `${id} fixture mappings match 0058 after 0060`)
  }
})

test('an outcome is trimmed, empty optional fields are dropped, and it round-trips through a row', () => {
  const outcome = prepareOutcome({
    code: '  2 ІФО 2.1-1 ',
    title: { uk: ' Складає прості послідовності команд ', en: '' },
    source: 'national-standard',
    sourceRef: ' ',
    gradeBand: '',
    mappings: [
      { framework: ' cambridge ', ref: ' 3Alg.01 ', strength: '' },
      { framework: 'nush-ifo-2018', ref: '2 ІФО 2.1.1', strength: 'partial' },
    ],
  })
  assert.deepEqual(outcome, {
    code: '2 ІФО 2.1-1',
    title: { uk: 'Складає прості послідовності команд' },
    source: 'national-standard',
    mappings: [
      { framework: 'cambridge', ref: '3Alg.01' },
      { framework: 'nush-ifo-2018', ref: '2 ІФО 2.1.1', strength: 'partial' },
    ],
  })
  const columns = outcomeColumns(outcome)
  assert.deepEqual(outcomeFromRow(row({ ...columns })), outcome)
})

test('outcomes fail closed with paths: unknown fields, HTML, bad source, too many mappings', () => {
  const valid = { code: 'X-1', title: { uk: 'Текст' }, source: 'internal', mappings: [] }
  assert.deepEqual(issuePaths(() => prepareOutcome(null)), [''])
  assert.deepEqual(issuePaths(() => prepareOutcome({ ...valid, level: 3 })), ['level'])
  assert.deepEqual(issuePaths(() => prepareOutcome({ ...valid, title: { uk: '<b>Текст</b>' } })), ['title.uk'])
  assert.deepEqual(issuePaths(() => prepareOutcome({ ...valid, source: 'rumour' })), ['source'])
  assert.deepEqual(issuePaths(() => prepareOutcome({ ...valid, code: ' ' })), ['code'])
  assert.deepEqual(issuePaths(() => prepareOutcome({ ...valid, mappings: [{ framework: 'nush' }] })), ['mappings[0].ref'])
  assert.deepEqual(
    issuePaths(() => prepareOutcome({ ...valid, mappings: [{ framework: 'nush', ref: '1', strength: 'equivalent' }] })),
    ['mappings[0].strength'],
  )
  const many = Array.from({ length: MAX_OUTCOME_MAPPINGS + 1 }, (_, i) => ({ framework: 'nush', ref: String(i) }))
  assert.deepEqual(issuePaths(() => prepareOutcome({ ...valid, mappings: many })), ['mappings'])
})

test('the registry offers only active outcomes to new content, archived ones to reports', () => {
  const rows = [row(), row({ id: 'old-one', code: 'OLD', status: 'archived' })]
  assert.deepEqual(Object.keys(outcomeRegistry(rows, { includeArchived: false })), ['nush-alg-1'])
  assert.deepEqual(Object.keys(outcomeRegistry(rows, { includeArchived: true })), ['nush-alg-1', 'old-one'])
})

test('usage lists each lesson once, from its draft or its published version', () => {
  const usage = outcomeUsage([
    { id: 'l1', draftContent: { learningOutcomes: [{ outcomeId: 'a' }, { outcomeId: 'b' }] }, publishedSnapshot: { learningOutcomes: [{ outcomeId: 'a' }] } },
    { id: 'l2', draftContent: { learningOutcomes: [{ outcomeId: 'c' }] }, publishedSnapshot: { learningOutcomes: [{ outcomeId: 'b' }] } },
    { id: 'l3', draftContent: 'broken', publishedSnapshot: null },
  ])
  assert.deepEqual({ ...usage }, { a: ['l1'], b: ['l1', 'l2'], c: ['l2'] })
})

test('generated ids match the directory id rule; the pack is read before full validation', () => {
  assert.match(generateOutcomeId(), /^out-[0-9a-f]{10}$/)
  assert.notEqual(generateOutcomeId(), generateOutcomeId())
  assert.equal(peekSubjectPackId({ subjectPackId: 'informatics-ua-primary' }), 'informatics-ua-primary')
  assert.equal(peekSubjectPackId({ subjectPackId: 7 }), null)
  assert.equal(peekSubjectPackId(null), null)
})
