import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getRemainingSeconds,
  creditPauseSeconds,
  GRACE_CAP_SECONDS,
  PAUSE_IDLE_THRESHOLD_SECONDS,
} from './attempt-timing.js'

const now = new Date('2026-07-01T10:00:00.000Z')

test('getRemainingSeconds: обмежено лімітом часу спроби', () => {
  const startedAt = new Date('2026-07-01T09:55:00.000Z') // 5 хв тому
  const endsAt = new Date('2026-07-01T23:00:00.000Z')    // подія ще довго триває
  // ліміт 15 хв → лишилось 10 хв = 600 с
  assert.equal(getRemainingSeconds(startedAt, 15, endsAt, now), 600)
})

test('getRemainingSeconds: обмежено кінцем події (ends_at раніше)', () => {
  const startedAt = new Date('2026-07-01T09:59:00.000Z') // 1 хв тому
  const endsAt = new Date('2026-07-01T10:02:00.000Z')    // подія закінчується через 2 хв
  // ліміт 15 хв дав би 14 хв, але ends_at ближче → 120 с
  assert.equal(getRemainingSeconds(startedAt, 15, endsAt, now), 120)
})

test('getRemainingSeconds: 0 після дедлайну (не негативне)', () => {
  const startedAt = new Date('2026-07-01T09:40:00.000Z') // 20 хв тому
  const endsAt = new Date('2026-07-01T23:00:00.000Z')
  // ліміт 15 хв вичерпано 5 хв тому → 0, не негативне
  assert.equal(getRemainingSeconds(startedAt, 15, endsAt, now), 0)
})

test('getRemainingSeconds: null startedAt рахує від "now"', () => {
  const endsAt = new Date('2026-07-01T23:00:00.000Z')
  // старт = now → лишається повний ліміт 15 хв = 900 с
  assert.equal(getRemainingSeconds(null, 15, endsAt, now), 900)
})

test('getRemainingSeconds: пауза продовжує дедлайн спроби', () => {
  const startedAt = new Date('2026-07-01T09:55:00.000Z') // 5 хв тому
  const endsAt = new Date('2026-07-01T23:00:00.000Z')
  // ліміт 15 хв → 10 хв (600с); +180с паузи → 780с
  assert.equal(getRemainingSeconds(startedAt, 15, endsAt, now, 180), 780)
})

test('getRemainingSeconds: пауза НЕ виносить за ends_at (жорсткий стеля)', () => {
  const startedAt = new Date('2026-07-01T09:59:00.000Z')
  const endsAt = new Date('2026-07-01T10:02:00.000Z')  // подія закінчується через 2 хв
  // навіть з великою паузою залишок обмежено ends_at → 120с
  assert.equal(getRemainingSeconds(startedAt, 15, endsAt, now, 600), 120)
})

test('creditPauseSeconds: розрив нижче порогу не кредитує', () => {
  const lastSeen = new Date(now.getTime() - 15_000) // 15с — звичайний heartbeat
  assert.equal(creditPauseSeconds(0, lastSeen, now), 0)
})

test('creditPauseSeconds: розрив вище порогу кредитує повний розрив', () => {
  const lastSeen = new Date(now.getTime() - 300_000) // 5 хв офлайн
  assert.equal(creditPauseSeconds(0, lastSeen, now), 300)
})

test('creditPauseSeconds: сумарна пауза обмежена grace-лімітом', () => {
  const lastSeen = new Date(now.getTime() - 400_000) // ще 400с
  // вже було 500с; 500+400=900, але cap 600 → 600
  assert.equal(creditPauseSeconds(500, lastSeen, now), GRACE_CAP_SECONDS)
})

test('creditPauseSeconds: null last_seen_at (перший heartbeat) не кредитує', () => {
  assert.equal(creditPauseSeconds(0, null, now), 0)
})

test('creditPauseSeconds: рівно поріг не кредитує (межа)', () => {
  const lastSeen = new Date(now.getTime() - PAUSE_IDLE_THRESHOLD_SECONDS * 1000)
  assert.equal(creditPauseSeconds(0, lastSeen, now), 0)
})
