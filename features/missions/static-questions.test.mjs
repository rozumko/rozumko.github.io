import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { pickMissionQuestions } from './mission-pick.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = join(__dirname, '../../public/questions')

// ── pickMissionQuestions (чиста логіка) ──────────────────────────────────────

const pool = [
  { id: 'a', difficulty: 'easy', track: 'informatics', topic: 'information' },
  { id: 'b', difficulty: 'easy', track: 'informatics', topic: 'computer-systems' },
  { id: 'c', difficulty: 'hard', track: 'ai-basics', topic: 'what-is-ai' },
  { id: 'd', difficulty: 'medium', track: 'informatics', topic: 'information' },
]

test('pickMissionQuestions: фільтрує за складністю', () => {
  const picked = pickMissionQuestions(pool, { count: 10, difficulty: 'easy' })
  assert.deepEqual(picked.map(q => q.difficulty), ['easy', 'easy'])
})

test('pickMissionQuestions: фільтрує за напрямом (track)', () => {
  const picked = pickMissionQuestions(pool, { count: 10, track: 'informatics' })
  assert.deepEqual(picked.map(q => q.id).sort(), ['a', 'b', 'd'])
})

test('pickMissionQuestions: фільтрує за темою (topic)', () => {
  const picked = pickMissionQuestions(pool, { count: 10, topic: 'information' })
  assert.deepEqual(picked.map(q => q.id).sort(), ['a', 'd'])
})

test('pickMissionQuestions: track + topic + difficulty разом', () => {
  const picked = pickMissionQuestions(pool, { count: 10, track: 'informatics', topic: 'information', difficulty: 'easy' })
  assert.deepEqual(picked.map(q => q.id), ['a'])
})

test('pickMissionQuestions: обрізає до count', () => {
  assert.equal(pickMissionQuestions(pool, { count: 2 }).length, 2)
})

// band задає порядок, але НЕ ріже пул: у межах однієї теми в кожному банді
// лежить 1–5 питань, а деякі банди порожні (`information` — тільки recognize).
// Фільтрація віддавала б місії менше питань, ніж вона просила.
const bandPool = [
  { id: 'r1', topic: 'logic', progressionBand: 'recognize' },
  { id: 'a1', topic: 'logic', progressionBand: 'apply' },
  { id: 'a2', topic: 'logic', progressionBand: 'apply' },
  { id: 'x1', topic: 'logic', progressionBand: 'reason' },
]

test('pickMissionQuestions: band виводить свій банд наперед', () => {
  const picked = pickMissionQuestions(bandPool, { count: 2, band: 'apply' })
  assert.deepEqual(picked.map(q => q.progressionBand), ['apply', 'apply'])
})

test('pickMissionQuestions: band не зменшує кількість, коли свого банду мало', () => {
  const picked = pickMissionQuestions(bandPool, { count: 4, band: 'recognize' })
  assert.equal(picked.length, 4, 'місія мусить отримати стільки питань, скільки просила')
  assert.equal(picked[0].progressionBand, 'recognize')
})

test('pickMissionQuestions: порожній band не робить місію порожньою', () => {
  const onlyRecognize = [
    { id: 'i1', topic: 'information', progressionBand: 'recognize' },
    { id: 'i2', topic: 'information', progressionBand: 'recognize' },
  ]
  const picked = pickMissionQuestions(onlyRecognize, { count: 2, band: 'reason' })
  assert.equal(picked.length, 2)
})

test('pickMissionQuestions: band не скасовує фільтри track/topic', () => {
  const mixed = [
    { id: 'keep', topic: 'logic', progressionBand: 'apply' },
    { id: 'drop', topic: 'data', progressionBand: 'apply' },
  ]
  const picked = pickMissionQuestions(mixed, { count: 5, topic: 'logic', band: 'apply' })
  assert.deepEqual(picked.map(q => q.id), ['keep'])
})

test('pickMissionQuestions: без difficulty бере весь пул і не мутує вхід', () => {
  const before = pool.map(q => q.id).join()
  const picked = pickMissionQuestions(pool, { count: 10 })
  assert.equal(picked.length, 4)
  assert.equal(pool.map(q => q.id).join(), before)
})

// ── Guard статичного бандла ──────────────────────────────────────────────────
// Інваріант безпеки: у public/questions/ НІКОЛИ немає олімпіадних питань.
// Бандл генерується `cd backend && npm run export:questions` і комітиться.

test('статичний бандл існує для всіх класів 1..4', () => {
  assert.ok(existsSync(BUNDLE_DIR), 'public/questions/ відсутня — запусти export:questions')
  for (const grade of [1, 2, 3, 4]) {
    assert.ok(existsSync(join(BUNDLE_DIR, `grade-${grade}.json`)), `grade-${grade}.json відсутній`)
  }
})

test('статичний бандл не містить олімпіадних питань і має валідну форму', () => {
  for (const file of readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.json'))) {
    const grade = Number(file.match(/grade-(\d)/)?.[1])
    const list = JSON.parse(readFileSync(join(BUNDLE_DIR, file), 'utf8'))
    assert.ok(Array.isArray(list), `${file}: не масив`)
    for (const q of list) {
      assert.notEqual(q.isOlympiad, true, `${file}: олімпіадне питання ${q.id} у публічному бандлі!`)
      assert.equal('isOlympiad' in q, false, `${file}: поле isOlympiad не мало потрапити в бандл`)
      assert.equal(q.grade, grade, `${file}: питання ${q.id} чужого класу`)
      assert.equal(typeof q.q, 'string', `${file}: питання ${q.id} без тексту`)
    }
  }
})
