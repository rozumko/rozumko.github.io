import test from 'node:test'
import assert from 'node:assert/strict'

import { describeOutcomeIssue, filterOutcomes, filterRefs, findRef, levelLabel, mappingSummary, normalizeMappingRefs, outcomeInputFromForm, refCoverage, refKey, refLevels, refLinkLevel, skillDraftFromRef } from './outcomes-model.ts'

const outcome = (overrides = {}) => ({
  id: 'nush-alg-1', subjectPackId: 'informatics-ua-primary', code: '2 ІФО 2.1-1',
  titleUk: 'Складає прості послідовності команд', titleEn: 'Builds simple command sequences',
  source: 'national-standard', sourceRef: 'Типова програма НУШ', gradeBand: '1-2',
  mappings: [{ framework: 'cambridge', ref: '3Pc.01' }], status: 'active', editVersion: 1, updatedAt: '',
  ...overrides,
})

test('search matches code, words of the title, English title and mappings; filters combine', () => {
  const list = [
    outcome(),
    outcome({ id: 'files', code: 'INF-2-FILES-1', titleUk: 'Розрізняє ім’я файла', titleEn: null, mappings: [], sourceRef: null }),
    outcome({ id: 'old', code: 'OLD-1', status: 'archived', subjectPackId: 'other-pack' }),
  ]
  const ids = filter => filterOutcomes(list, { packId: '', status: '', query: '', ...filter }).map(o => o.id)
  assert.deepEqual(ids({ query: 'ІФО 2.1' }), ['nush-alg-1'])
  assert.deepEqual(ids({ query: 'послідовності КОМАНД' }), ['nush-alg-1', 'old'])
  assert.deepEqual(ids({ query: 'command' }), ['nush-alg-1', 'old'])
  assert.deepEqual(ids({ query: '3pc.01' }), ['nush-alg-1', 'old'])
  assert.deepEqual(ids({ query: "ім'я" }), ['files'], 'typed apostrophe matches the typographic one')
  assert.deepEqual(ids({ status: 'active' }), ['nush-alg-1', 'files'])
  assert.deepEqual(ids({ packId: 'other-pack' }), ['old'])
  assert.deepEqual(ids({ query: 'нічого такого' }), [])
})

test('the form becomes a payload without empty optional fields or blank mapping rows', () => {
  assert.deepEqual(outcomeInputFromForm({
    code: ' 2 ІФО 2.1-1 ', titleUk: ' Складає ', titleEn: ' ', source: 'national-standard',
    sourceRef: '', gradeBand: ' 1-2 ',
    mappings: [
      { framework: ' cambridge ', ref: ' 3Pc.01 ', strength: '' },
      { framework: 'nush-ifo-2018', ref: '2 ІФО 3.1.1', strength: 'partial' },
      { framework: '', ref: '  ', strength: '' },
    ],
  }), {
    code: '2 ІФО 2.1-1', title: { uk: 'Складає' }, source: 'national-standard', gradeBand: '1-2',
    mappings: [{ framework: 'cambridge', ref: '3Pc.01' }, { framework: 'nush-ifo-2018', ref: '2 ІФО 3.1.1', strength: 'partial' }],
  })
})

test('server issues read as field names in Ukrainian', () => {
  assert.equal(describeOutcomeIssue({ path: 'code', message: 'must be a non-empty string' }), 'Код: не може бути порожнім')
  assert.equal(describeOutcomeIssue({ path: 'title.uk', message: 'must not contain HTML markup' }), 'Формулювання: без HTML-розмітки')
  assert.equal(describeOutcomeIssue({ path: 'mappings[1].ref', message: 'must be a non-empty string' }), 'Відповідність 2 → код: не може бути порожнім')
  assert.equal(describeOutcomeIssue({ path: 'mappings[0].strength', message: 'must be one of: direct, partial, supporting' }),
    'Відповідність 1 → сила: must be one of: direct, partial, supporting')
  assert.equal(describeOutcomeIssue({ path: 'weird', message: 'odd' }), 'weird: odd')
  assert.equal(mappingSummary(outcome({ mappings: [{ framework: 'nush', ref: 'a' }, { framework: 'cambridge', ref: 'b' }] })), 'nush a · cambridge b')
  assert.equal(mappingSummary(outcome({ mappings: [{ framework: 'cambridge-0059', ref: '2CS.03', strength: 'direct' }] })), 'cambridge-0059 2CS.03 (пряма)')
})

const ref = (overrides = {}) => ({
  framework: 'nush-ifo-2018', code: '2 ІФО 3.1.1', title: 'Використовує цифрові пристрої', lang: 'uk', level: '1-2',
  groupCode: 'ІФО 3.1', groupTitle: 'Цифрові пристрої', examples: ['Назвіть пристрої вдома.'], guidance: null, source: 'МОН', sortOrder: 1,
  ...overrides,
})

test('catalogue coverage counts active skills per code; archived skills cover nothing', () => {
  const coverage = refCoverage([
    outcome({ id: 'a', code: 'INF-2-DEV-1', mappings: [{ framework: 'nush-ifo-2018', ref: '2 ІФО 3.1.1', strength: 'partial' }] }),
    outcome({ id: 'b', code: 'INF-2-DEV-3', mappings: [{ framework: 'nush-ifo-2018', ref: '2 ІФО 3.1.1' }] }),
    outcome({ id: 'c', code: 'OLD', status: 'archived', mappings: [{ framework: 'cambridge-0059', ref: '2CS.03' }] }),
  ])
  assert.deepEqual(coverage.get(refKey('nush-ifo-2018', '2 ІФО 3.1.1')), [
    { outcomeId: 'a', code: 'INF-2-DEV-1', strength: 'partial' },
    { outcomeId: 'b', code: 'INF-2-DEV-3' },
  ])
  assert.equal(coverage.has(refKey('cambridge-0059', '2CS.03')), false)
})

test('catalogue filters by document, level, words (examples included) and gaps; labels read naturally', () => {
  const refs = [
    ref(),
    ref({ code: '4 ІФО 1.1.1', level: '3-4', title: 'Пояснює інформаційні процеси', examples: [] }),
    ref({ framework: 'cambridge-0059', code: '2CS.03', lang: 'en', level: '2', title: 'Know the difference between input and output devices.', examples: [] }),
  ]
  const coverage = new Map([
    [refKey('nush-ifo-2018', '2 ІФО 3.1.1'), [{ outcomeId: 'a', code: 'X', strength: 'direct' }]],
    // A supporting link alone must not hide an entry from «Без прямої відповідності».
    [refKey('nush-ifo-2018', '4 ІФО 1.1.1'), [{ outcomeId: 'b', code: 'Y', strength: 'supporting' }]],
  ])
  const codes = filter => filterRefs(refs, { framework: 'nush-ifo-2018', level: '', query: '', withoutDirectOnly: false, ...filter }, coverage).map(r => r.code)
  assert.deepEqual(codes({}), ['2 ІФО 3.1.1', '4 ІФО 1.1.1'])
  assert.deepEqual(codes({ level: '3-4' }), ['4 ІФО 1.1.1'])
  assert.deepEqual(codes({ query: 'вдома' }), ['2 ІФО 3.1.1'], 'MON task examples are searchable')
  assert.deepEqual(codes({ withoutDirectOnly: true }), ['4 ІФО 1.1.1'])
  assert.deepEqual(codes({ framework: 'cambridge-0059', query: 'OUTPUT' }), ['2CS.03'])
  assert.deepEqual(refLevels(refs, 'nush-ifo-2018'), ['1-2', '3-4'])
  assert.equal(levelLabel(refs[0]), '1–2 класи')
  assert.equal(levelLabel(refs[2]), 'Stage 2')
  // The strength is the author's call once the skill is worded: the draft leaves it unset.
  assert.deepEqual(skillDraftFromRef(refs[2]), { gradeBand: '2', mappings: [{ framework: 'cambridge-0059', ref: '2CS.03' }] })
})

test('only an author-marked direct mapping makes a catalogue entry directly linked', () => {
  assert.equal(refLinkLevel(undefined), 'none')
  assert.equal(refLinkLevel([]), 'none')
  assert.equal(refLinkLevel([{ outcomeId: 'a', code: 'A', strength: 'supporting' }, { outcomeId: 'b', code: 'B' }]), 'indirect')
  assert.equal(refLinkLevel([{ outcomeId: 'a', code: 'A', strength: 'partial' }, { outcomeId: 'b', code: 'B', strength: 'direct' }]), 'direct')
})

test('a portal code is an alias: search and the mapping hint find the normative entry', () => {
  const refs = [ref({ code: '2 ІФО 3.1', aliases: ['2 ІФО 3.1.1'] }), ref({ code: '2 ІФО 3.3', aliases: ['2 ІФО 3.3.1'] })]
  assert.deepEqual(filterRefs(refs, { framework: 'nush-ifo-2018', level: '', query: '3.1.1', withoutDirectOnly: false }, new Map()).map(r => r.code), ['2 ІФО 3.1'])
  assert.equal(findRef(refs, 'nush-ifo-2018', ' 2 ІФО 3.3 ')?.code, '2 ІФО 3.3')
  assert.equal(findRef(refs, 'nush-ifo-2018', '2 ІФО 3.3.1')?.code, '2 ІФО 3.3')
  assert.equal(findRef(refs, 'cambridge-0059', '2 ІФО 3.3'), undefined)
})

test('an alias mapping counts for its normative entry and is stored as the normative code', () => {
  const refs = [ref({ code: '2 ІФО 3.3', aliases: ['2 ІФО 3.3.1'] })]
  const skill = outcome({ id: 's', code: 'INF-2-DEV-4', mappings: [{ framework: 'nush-ifo-2018', ref: '2 ІФО 3.3.1', strength: 'direct' }] })
  const coverage = refCoverage([skill], refs)
  assert.equal(refLinkLevel(coverage.get(refKey('nush-ifo-2018', '2 ІФО 3.3'))), 'direct')
  assert.equal(coverage.has(refKey('nush-ifo-2018', '2 ІФО 3.3.1')), false)
  assert.deepEqual(normalizeMappingRefs([
    { framework: 'nush-ifo-2018', ref: '2 ІФО 3.3.1', strength: 'partial' },
    { framework: 'cambridge-0059', ref: 'unknown' },
  ], refs), [
    { framework: 'nush-ifo-2018', ref: '2 ІФО 3.3', strength: 'partial' },
    { framework: 'cambridge-0059', ref: 'unknown' },
  ])
})
