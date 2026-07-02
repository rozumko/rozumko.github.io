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
  { id: 'a', difficulty: 'easy' },
  { id: 'b', difficulty: 'easy' },
  { id: 'c', difficulty: 'hard' },
  { id: 'd', difficulty: 'medium' },
]

test('pickMissionQuestions: фільтрує за складністю', () => {
  const picked = pickMissionQuestions(pool, { count: 10, difficulty: 'easy' })
  assert.deepEqual(picked.map(q => q.difficulty), ['easy', 'easy'])
})

test('pickMissionQuestions: обрізає до count', () => {
  assert.equal(pickMissionQuestions(pool, { count: 2 }).length, 2)
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
