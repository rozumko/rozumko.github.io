import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRemainingSeconds } from './attempt-timing.js'

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
