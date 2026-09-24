// ── Lesson Engine: joined devices (stage G1) ─────────────────────────────────
// A device token is an HMAC over a domain-separated device id: it carries no
// personal data, cannot be replayed as a School or Home token, and is only
// honoured while the device row is live (not revoked, not expired) — so the
// teacher can cut a device off at any time.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

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

// ── Launch on lab computers (stage I) ───────────────────────────────────────

/** A launch link must be opened soon after the teacher sends it. */
export const LESSON_LAUNCH_TTL_MS = 10 * 60 * 1000

/** Computer ids as a classroom control provider reports them ("PC-01"). */
export const REMOTE_DEVICE_ID_PATTERN = '^[A-Za-z0-9._:-]{1,64}$'
const REMOTE_DEVICE_ID_RE = new RegExp(REMOTE_DEVICE_ID_PATTERN)
const LAUNCH_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function isRemoteDeviceId(value: unknown): value is string {
  return typeof value === 'string' && REMOTE_DEVICE_ID_RE.test(value)
}

/**
 * Single-use launch token: 256 random bits. Only its sha256 is stored, so a
 * database read cannot be turned into a working link.
 */
export function generateLaunchToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashLaunchToken(token) }
}

export function hashLaunchToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isLaunchToken(value: unknown): value is string {
  return typeof value === 'string' && LAUNCH_TOKEN_RE.test(value)
}

// ── Class link and remembered seats ─────────────────────────────────────────
// A class link is one stable address per class (saved once, e.g. as a
// Classroom Remote quick link): it joins whatever lesson that class has open.
// Its key is an HMAC over the class id and a version, so nothing secret is
// stored and bumping the version revokes every copy of the old link.
// A seat is a random secret a lab browser keeps in localStorage; the server
// stores only its sha256 and remembers which roster student sat there.

const CLASS_LINK_DOMAIN = 'lesson-class-link:'
const CLASS_LINK_KEY_RE = /^[A-Za-z0-9_-]{43}$/
const SEAT_SECRET_RE = /^[A-Za-z0-9_-]{43}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function classLinkKey(classId: string, version: number): string {
  return createHmac('sha256', getSecret()).update(`${CLASS_LINK_DOMAIN}${classId}:${version}`).digest('base64url')
}

export function verifyClassLinkKey(classId: unknown, version: unknown, key: unknown): boolean {
  if (typeof classId !== 'string' || !UUID_RE.test(classId)) return false
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return false
  if (typeof key !== 'string' || !CLASS_LINK_KEY_RE.test(key)) return false
  const expected = Buffer.from(classLinkKey(classId.toLowerCase(), version))
  const actual = Buffer.from(key)
  return actual.length === expected.length && timingSafeEqual(expected, actual)
}

/** Relative device-page URL; the key sits in the fragment, never sent to a server. */
export function classLinkPath(classId: string, version: number): string {
  return `lesson-join.html#class=${classId}.${version}.${classLinkKey(classId, version)}`
}

export function isSeatSecret(value: unknown): value is string {
  return typeof value === 'string' && SEAT_SECRET_RE.test(value)
}

export function hashSeatSecret(secret: string): string {
  return createHash('sha256').update(`lesson-seat:${secret}`).digest('hex')
}
