import test from 'node:test'
import assert from 'node:assert/strict'
import { assertEventCanIssueCodes } from './teacher-events-validation.js'

const NOW = new Date('2026-05-10T10:00:00.000Z')

test('assertEventCanIssueCodes accepts active current event', () => {
  assert.doesNotThrow(() => assertEventCanIssueCodes({
    status: 'active',
    startsAt: new Date('2026-05-10T09:00:00.000Z'),
    endsAt: new Date('2026-05-10T11:00:00.000Z'),
  }, NOW))
})

test('assertEventCanIssueCodes rejects non-active event', () => {
  assert.throws(
    () => assertEventCanIssueCodes({
      status: 'published',
      startsAt: new Date('2026-05-10T09:00:00.000Z'),
      endsAt: new Date('2026-05-10T11:00:00.000Z'),
    }, NOW),
    /активної/
  )
})

test('assertEventCanIssueCodes rejects future event', () => {
  assert.throws(
    () => assertEventCanIssueCodes({
      status: 'active',
      startsAt: new Date('2026-05-10T10:30:00.000Z'),
      endsAt: new Date('2026-05-10T11:00:00.000Z'),
    }, NOW),
    /ще не почалась/
  )
})

test('assertEventCanIssueCodes rejects finished event', () => {
  assert.throws(
    () => assertEventCanIssueCodes({
      status: 'active',
      startsAt: new Date('2026-05-10T09:00:00.000Z'),
      endsAt: new Date('2026-05-10T09:30:00.000Z'),
    }, NOW),
    /вже завершилась/
  )
})
