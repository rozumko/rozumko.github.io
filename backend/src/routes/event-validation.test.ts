import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEventInput, normalizeEventPatch } from './event-validation.js'

test('normalizeEventInput accepts a valid draft event', () => {
  const event = normalizeEventInput({
    title: ' Весняна олімпіада ',
    startsAt: '2026-05-10T09:00:00.000Z',
    endsAt: '2026-05-10T10:00:00.000Z',
  })

  assert.equal(event.title, 'Весняна олімпіада')
  assert.equal(event.status, 'draft')
  assert.equal(event.startsAt.toISOString(), '2026-05-10T09:00:00.000Z')
  assert.equal(event.endsAt.toISOString(), '2026-05-10T10:00:00.000Z')
})

test('normalizeEventInput rejects an empty title', () => {
  assert.throws(
    () => normalizeEventInput({
      title: '   ',
      startsAt: '2026-05-10T09:00:00.000Z',
      endsAt: '2026-05-10T10:00:00.000Z',
    }),
    /Назва події/
  )
})

test('normalizeEventInput rejects invalid date order', () => {
  assert.throws(
    () => normalizeEventInput({
      title: 'Подія',
      startsAt: '2026-05-10T10:00:00.000Z',
      endsAt: '2026-05-10T09:00:00.000Z',
    }),
    /Дата завершення/
  )
})

test('normalizeEventInput rejects an unknown status', () => {
  assert.throws(
    () => normalizeEventInput({
      title: 'Подія',
      startsAt: '2026-05-10T09:00:00.000Z',
      endsAt: '2026-05-10T10:00:00.000Z',
      status: 'public',
    }),
    /Невірний статус/
  )
})

test('normalizeEventPatch returns only changed fields plus updatedAt', () => {
  const patch = normalizeEventPatch({
    title: ' Нова назва ',
    status: 'published',
  })

  assert.equal(patch.title, 'Нова назва')
  assert.equal(patch.status, 'published')
  assert.ok(patch.updatedAt instanceof Date)
  assert.equal('startsAt' in patch, false)
})
