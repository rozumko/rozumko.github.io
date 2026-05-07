import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertEventCanAcceptRegistrations,
  normalizeRegistrationInput,
  normalizeTeacherClassInput,
} from './registration-validation.js'

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const CLASS_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-05-10T10:00:00.000Z')

test('normalizeTeacherClassInput accepts valid class data', () => {
  assert.deepEqual(normalizeTeacherClassInput({ name: ' 2-А ', grade: 2 }), {
    name: '2-А',
    grade: 2,
  })
})

test('normalizeTeacherClassInput rejects empty class name', () => {
  assert.throws(() => normalizeTeacherClassInput({ name: ' ', grade: 2 }), /Назва/)
})

test('normalizeTeacherClassInput rejects invalid grade', () => {
  assert.throws(() => normalizeTeacherClassInput({ name: '2-А', grade: 5 }), /Клас/)
})

test('normalizeRegistrationInput accepts valid registration data', () => {
  assert.deepEqual(normalizeRegistrationInput({
    eventId: EVENT_ID,
    classId: CLASS_ID,
    participantsCount: 12,
  }), {
    eventId: EVENT_ID,
    classId: CLASS_ID,
    participantsCount: 12,
    paymentStatus: 'not_required',
  })
})

test('normalizeRegistrationInput rejects invalid participant count', () => {
  assert.throws(
    () => normalizeRegistrationInput({ eventId: EVENT_ID, classId: CLASS_ID, participantsCount: 0 }),
    /Кількість/
  )
})

test('assertEventCanAcceptRegistrations accepts published future event', () => {
  assert.doesNotThrow(() => assertEventCanAcceptRegistrations({
    status: 'published',
    endsAt: new Date('2026-05-11T10:00:00.000Z'),
  }, NOW))
})

test('assertEventCanAcceptRegistrations rejects draft event', () => {
  assert.throws(
    () => assertEventCanAcceptRegistrations({
      status: 'draft',
      endsAt: new Date('2026-05-11T10:00:00.000Z'),
    }, NOW),
    /опублікованої/
  )
})

test('assertEventCanAcceptRegistrations rejects ended event', () => {
  assert.throws(
    () => assertEventCanAcceptRegistrations({
      status: 'active',
      endsAt: new Date('2026-05-09T10:00:00.000Z'),
    }, NOW),
    /недоступна/
  )
})
