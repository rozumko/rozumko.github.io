import assert from 'node:assert/strict'
import test from 'node:test'
import { missionPublishedSnapshot, normalizeEditableMission, normalizeFactOpinionConfig, normalizeQuestionSetConfig, normalizeQuestionSetMission, normalizeScenarioConfig, normalizeSequenceConfig, normalizeSimulatorConfig, normalizeSortingConfig } from './mission-editorial.js'
import { SIMULATOR_MECHANICS_CONTRACTS } from './simulator-contracts.js'

const ids = [
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004',
]

test('question-set config accepts paired, non-overlapping apply/confirm sets', () => {
  const config = normalizeQuestionSetConfig({ questionSets: [
    { id: 'apply-a', purpose: 'apply', variant: 'a', questionIds: [ids[0]] },
    { id: 'confirm-a', purpose: 'confirm', variant: 'a', questionIds: [ids[1]] },
  ] })
  assert.equal(config.questionSets.length, 2)
})

test('question-set config rejects overlap and unpaired confirm sets', () => {
  assert.throws(() => normalizeQuestionSetConfig({ questionSets: [
    { id: 'apply-a', purpose: 'apply', variant: 'a', questionIds: [ids[0]] },
    { id: 'confirm-a', purpose: 'confirm', variant: 'a', questionIds: [ids[0]] },
  ] }), /кількох наборах/)
  assert.throws(() => normalizeQuestionSetConfig({ questionSets: [
    { id: 'confirm-b', purpose: 'confirm', variant: 'b', questionIds: [ids[2]] },
  ] }), /парні apply і confirm/)
  assert.throws(() => normalizeQuestionSetConfig({ questionSets: [
    { id: 'apply-a', purpose: 'apply', variant: 'a', questionIds: [ids[0], ids[1]] },
    { id: 'confirm-a', purpose: 'confirm', variant: 'a', questionIds: [ids[2]] },
  ] }), /однакову кількість/)
})

test('question-set mission normalizes metadata and publishes an exact version', () => {
  const mission = normalizeQuestionSetMission({
    id: 'retention-algorithms-g2', title: 'Алгоритми', kind: 'question-set',
    track: 'computational-thinking', grade: 2,
    config: { topic: 'algorithms', questionSets: [{ id: 'practice', purpose: 'practice', variant: 'default', questionIds: [ids[3]] }] },
  })
  assert.equal(mission.config.topic, 'algorithms')
  assert.equal(missionPublishedSnapshot(mission, 4).version, 4)
})

test('sorting content pack validates bins, items and complete classification', () => {
  const config = normalizeSortingConfig({
    gameKey: 'attributes',
    levels: [{
      instruction: 'Розклади',
      bins: [{ id: 'yes', label: 'Так' }, { id: 'no', label: 'Ні' }],
      items: [{ emoji: '✅', bin: 'yes' }, { emoji: '❌', label: 'Ні', bin: 'no' }],
    }],
  })
  assert.equal(config.levels[0].items.length, 2)
  assert.throws(() => normalizeSortingConfig({
    gameKey: 'broken',
    levels: [{
      instruction: 'Розклади', bins: [{ id: 'yes', label: 'Так' }, { id: 'no', label: 'Ні' }],
      items: [{ emoji: '✅', bin: 'yes' }, { emoji: '❓', bin: 'missing' }],
    }],
  }), /невідомий кошик/)
})

test('editable mission accepts a structured sorting-game pack', () => {
  const mission = normalizeEditableMission({
    id: 'sorting-test', title: 'Сортування', kind: 'sorting-game',
    track: 'computational-thinking', grade: 1,
    config: {
      gameKey: 'test', levels: [{ instruction: 'Розклади',
        bins: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        items: [{ emoji: '1️⃣', bin: 'a' }, { emoji: '2️⃣', bin: 'b' }] }],
    },
  })
  assert.equal(mission.kind, 'sorting-game')
})

test('sequence packs require unique ordered steps', () => {
  const config = normalizeSequenceConfig({ gameKey: 'algorithms-g2', sets: [{
    id: 'tea', title: 'Заварюємо чай', steps: ['Налий воду', 'Закипʼяти воду', 'Завари чай'],
  }] })
  assert.equal(config.sets[0].steps.length, 3)
  assert.throws(() => normalizeSequenceConfig({ gameKey: 'bad', sets: [{
    id: 'repeat', title: 'Повтори', steps: ['Крок', 'Крок', 'Фініш'],
  }] }), /повторні кроки/)
})

test('scenario packs require exactly one correct option and feedback everywhere', () => {
  const config = normalizeScenarioConfig({ gameKey: 'safety', items: [{
    id: 'password', emoji: '🔐', text: 'Просять пароль', options: [
      { label: 'Не надсилати', correct: true, feedback: 'Правильно' },
      { label: 'Надіслати', correct: false, feedback: 'Пароль приватний' },
    ],
  }] })
  assert.equal(config.items[0].options.filter(option => option.correct).length, 1)
  assert.throws(() => normalizeScenarioConfig({ gameKey: 'bad', items: [{
    id: 'broken', emoji: '❓', text: 'Що робити?', options: [
      { label: 'A', correct: true, feedback: 'A' }, { label: 'B', correct: true, feedback: 'B' },
    ],
  }] }), /рівно одну/)
})

test('fact-opinion packs require balanced categories and https-only sources', () => {
  const statements = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `fact-${i + 1}`, category: 'fact', text: `Факт ${i + 1}`, explanation: 'Це можна перевірити.',
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `opinion-${i + 1}`, category: 'opinion', text: `Думка ${i + 1}`, explanation: 'Це особиста оцінка.',
    })),
  ]
  const config = normalizeFactOpinionConfig({ gameKey: 'level1', statements })
  assert.equal(config.statements.length, 10)

  const httpSource = statements.map((statement, index) => index === 0
    ? { ...statement, sourceTitle: 'Джерело', sourceUrl: 'http://example.com' } : statement)
  assert.throws(() => normalizeFactOpinionConfig({ gameKey: 'level1', statements: httpSource }), /https/)

  const untitledSource = statements.map((statement, index) => index === 0
    ? { ...statement, sourceUrl: 'https://example.com' } : statement)
  assert.throws(() => normalizeFactOpinionConfig({ gameKey: 'level1', statements: untitledSource }), /назви джерела/)

  const singleCategory = statements.map(statement => ({ ...statement, category: 'fact' }))
  assert.throws(() => normalizeFactOpinionConfig({ gameKey: 'level1', statements: singleCategory }), /двох категорій/)

  const mission = normalizeEditableMission({
    id: 'fact-opinion-test', title: 'Факт чи думка', kind: 'fact-opinion-game',
    track: 'ai-basics', grade: 1, config: { gameKey: 'level1', statements },
  })
  assert.equal(mission.kind, 'fact-opinion-game')
})

test('simulator packs must mirror mechanics nodes and may use only allowlisted targets', () => {
  const contract = SIMULATOR_MECHANICS_CONTRACTS['assembly-hardware']
  const config = {
    scenarioKey: contract.scenarioKey,
    mechanicsVersion: contract.mechanicsVersion,
    nodes: Object.entries(contract.nodes).map(([id, slots]) => ({
      id, icon: '🧩', texts: [{ source: `source-${id}`, value: `Текст ${id}` }],
      transitions: Object.keys(slots).map(slot => ({ slot, labels: [{ source: slot, value: `Дія ${slot}` }] })),
    })),
  }
  assert.equal(normalizeSimulatorConfig(config).nodes.length, Object.keys(contract.nodes).length)
  const motherboard = config.nodes.find(node => node.id === 'motherboard')!
  const openCpu = motherboard.transitions.find(transition => transition.slot === 'open-cpu')!
  ;(openCpu as typeof openCpu & { target?: string }).target = 'win'
  assert.throws(() => normalizeSimulatorConfig(config), /не дозволяє target/)
})
