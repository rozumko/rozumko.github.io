import test from 'node:test'
import assert from 'node:assert/strict'

import { describeOutcomeIssue, filterOutcomes, mappingSummary, outcomeInputFromForm } from './outcomes-model.ts'

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
