import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ATTEMPT_SECRET ??= 'a'.repeat(64)

const {
  deviceLiveness,
  generateDeviceToken,
  generateLessonJoinCode,
  isLessonJoinCode,
  nextPairingNumber,
  verifyDeviceToken,
} = await import('./lesson-device.js')
const { generateAttemptToken } = await import('../routes/student-validation.js')

const DEVICE = '00000000-0000-4000-8000-000000000001'

test('device tokens verify only for their own device and cannot be replayed from other surfaces', () => {
  const token = generateDeviceToken(DEVICE)
  assert.equal(verifyDeviceToken(DEVICE, token), true)
  assert.equal(verifyDeviceToken('00000000-0000-4000-8000-000000000002', token), false)
  // A School/olympiad token for the same id is a different secret domain.
  assert.equal(verifyDeviceToken(DEVICE, generateAttemptToken(DEVICE)), false)
  for (const bad of [undefined, null, '', 'zz', token.toUpperCase(), token.slice(1), 42]) {
    assert.equal(verifyDeviceToken(DEVICE, bad), false, String(bad))
  }
})

test('join codes are six digits', () => {
  for (let i = 0; i < 50; i++) assert.ok(isLessonJoinCode(generateLessonJoinCode()))
  for (const bad of ['12345', '1234567', '12a456', ' 123456', 123456, null]) assert.equal(isLessonJoinCode(bad), false)
})

test('pairing numbers are never reused within a run', () => {
  assert.equal(nextPairingNumber([]), 1)
  assert.equal(nextPairingNumber([1, 2, 5]), 6)
  assert.equal(nextPairingNumber([3]), 4, 'a revoked device keeps its number')
})

test('a device is live only while neither revoked nor expired', () => {
  const now = new Date('2026-09-24T10:00:00Z')
  const later = new Date('2026-09-24T11:00:00Z')
  assert.equal(deviceLiveness({ revokedAt: null, expiresAt: later }, now), 'live')
  assert.equal(deviceLiveness({ revokedAt: now, expiresAt: later }, now), 'revoked')
  assert.equal(deviceLiveness({ revokedAt: null, expiresAt: now }, now), 'expired')
})
