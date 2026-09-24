// ── Lesson Engine: joined devices (stage G1) ─────────────────────────────────
// A device token is an HMAC over a domain-separated device id: it carries no
// personal data, cannot be replayed as a School or Home token, and is only
// honoured while the device row is live (not revoked, not expired) — so the
// teacher can cut a device off at any time.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

const LESSON_DEVICE_TOKEN_DOMAIN = 'lesson-run-device:'

/** A join code lives for one lesson plus slack; closing the run clears it sooner. */
export const LESSON_JOIN_CODE_TTL_MS = 3 * 60 * 60 * 1000
/** A device outlives its join code a little, never a school day. */
export const LESSON_DEVICE_TTL_MS = 4 * 60 * 60 * 1000
/** A classroom, with room for a few replaced devices. */
export const MAX_RUN_DEVICES = 60

const JOIN_CODE_RE = /^[0-9]{6}$/

function getSecret(): string {
  const secret = process.env.ATTEMPT_SECRET
  if (!secret) throw new Error('ATTEMPT_SECRET environment variable is not set')
  return secret
}

export function generateDeviceToken(deviceId: string): string {
  return createHmac('sha256', getSecret()).update(LESSON_DEVICE_TOKEN_DOMAIN + deviceId).digest('hex')
}

export function verifyDeviceToken(deviceId: string, token: unknown): boolean {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false
  const expected = Buffer.from(generateDeviceToken(deviceId), 'hex')
  const actual = Buffer.from(token, 'hex')
  return actual.length === expected.length && timingSafeEqual(expected, actual)
}

/** Unpredictable six digits; uniqueness is the DB index's job (the route retries). */
export function generateLessonJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function isLessonJoinCode(value: unknown): value is string {
  return typeof value === 'string' && JOIN_CODE_RE.test(value)
}

/** Numbers are never reused within a run, so "№ 4" always means one device. */
export function nextPairingNumber(existing: readonly number[]): number {
  return existing.reduce((max, n) => Math.max(max, n), 0) + 1
}

export type DeviceLiveness = 'live' | 'revoked' | 'expired'

export function deviceLiveness(device: { revokedAt: Date | null; expiresAt: Date }, now = new Date()): DeviceLiveness {
  if (device.revokedAt) return 'revoked'
  if (device.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'live'
}
