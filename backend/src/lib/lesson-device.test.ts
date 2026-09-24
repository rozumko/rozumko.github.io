import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ATTEMPT_SECRET ??= 'a'.repeat(64)

const {
  generateLaunchToken,
  hashLaunchToken,
  isLaunchToken,
  isRemoteDeviceId,
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

test('launch tokens are unguessable, stored only as a hash, and strictly shaped', () => {
  const a = generateLaunchToken()
  const b = generateLaunchToken()
  assert.notEqual(a.token, b.token)
  assert.ok(isLaunchToken(a.token))
  assert.equal(a.hash, hashLaunchToken(a.token))
  assert.match(a.hash, /^[0-9a-f]{64}$/)
  assert.ok(!a.hash.includes(a.token))
  for (const bad of ['', 'short', a.token + 'x', a.token.replace(/./, '+'), 42]) assert.equal(isLaunchToken(bad), false)
})

test('remote device ids are plain lab names', () => {
  for (const ok of ['PC-01', 'lab2.pc_14', 'room:3']) assert.ok(isRemoteDeviceId(ok))
  for (const bad of ['', 'PC 01', 'x'.repeat(65), '<script>', 'Марко']) assert.equal(isRemoteDeviceId(bad), false)
})

test('a class link verifies only for its class and current version, and never reveals the secret', async () => {
  const { classLinkKey, classLinkPath, verifyClassLinkKey, hashSeatSecret, isSeatSecret } = await import('./lesson-device.js')
  const classId = '6f1c1c9e-7f52-4a47-9d52-8a6f1f6d3b10'
  const key = classLinkKey(classId, 1)
  assert.match(key, /^[A-Za-z0-9_-]{43}$/)
  assert.ok(verifyClassLinkKey(classId, 1, key))
  assert.ok(!verifyClassLinkKey(classId, 2, key), 'rotating the version revokes the old link')
  assert.ok(!verifyClassLinkKey('7f1c1c9e-7f52-4a47-9d52-8a6f1f6d3b10', 1, key))
  assert.ok(!verifyClassLinkKey(classId, 1, key.slice(0, 42) + (key.endsWith('A') ? 'B' : 'A')))
  assert.ok(!verifyClassLinkKey(classId, '1', key))
  assert.ok(!verifyClassLinkKey('not-a-uuid', 1, key))
  assert.ok(!key.includes(process.env.ATTEMPT_SECRET ?? '\u0000'))
  assert.equal(classLinkPath(classId, 1), `lesson-join.html#class=${classId}.1.${key}`)

  const seat = 'S'.repeat(43)
  assert.ok(isSeatSecret(seat))
  assert.ok(!isSeatSecret('short'))
  assert.match(hashSeatSecret(seat), /^[0-9a-f]{64}$/)
  assert.notEqual(hashSeatSecret(seat), hashSeatSecret('T'.repeat(43)))
})
