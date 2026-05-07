import test from 'node:test'
import assert from 'node:assert/strict'

process.env.TZ = 'UTC'

const {
  buildEventPayload,
  countActiveEvents,
  countSelectedQuestions,
  toDateTimeLocalValue,
} = await import('./event-utils.mjs')

test('buildEventPayload trims title and converts datetime-local to ISO', () => {
  const payload = buildEventPayload({
    title: ' Весняна олімпіада ',
    startsAt: '2026-05-10T09:00',
    endsAt: '2026-05-10T10:00',
  })

  assert.equal(payload.title, 'Весняна олімпіада')
  assert.equal(payload.status, 'draft')
  assert.equal(payload.startsAt, '2026-05-10T09:00:00.000Z')
  assert.equal(payload.endsAt, '2026-05-10T10:00:00.000Z')
})

test('toDateTimeLocalValue formats ISO values for datetime-local inputs', () => {
  assert.equal(toDateTimeLocalValue('2026-05-10T09:00:00.000Z'), '2026-05-10T09:00')
})

test('countActiveEvents counts only active events', () => {
  assert.equal(countActiveEvents([
    { status: 'draft' },
    { status: 'active' },
    { status: 'archived' },
    { status: 'active' },
  ]), 2)
})

test('countSelectedQuestions counts unique question ids', () => {
  assert.equal(countSelectedQuestions(['a', 'b', 'a']), 2)
})
