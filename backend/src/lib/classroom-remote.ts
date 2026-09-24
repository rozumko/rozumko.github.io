// ── Lesson Engine ↔ Classroom Remote (integration API v1) ───────────────────
// The teacher pastes a Classroom Remote integration key once; the backend
// keeps it encrypted and, from the run console, opens the class link on the
// room's laptops and reads their status. Classroom Remote never learns about
// children: it receives one URL (the class link) and returns device names and
// online/synced state.
//
// Safety rules:
// - Only the origin in CLASSROOM_REMOTE_API_URL is ever contacted (no URL from
//   a request or the database), with a timeout, no redirects and a size cap.
// - The key is encrypted with AES-256-GCM (INTEGRATION_ENCRYPTION_KEY), bound
//   to its teacher by the AAD, and never returned to a browser.
// - Missing configuration disables the feature (fail closed).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const CLASSROOM_REMOTE_TOKEN_PATTERN = '^crk_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$'
const TOKEN_RE = new RegExp(CLASSROOM_REMOTE_TOKEN_PATTERN)
const REQUEST_TIMEOUT_MS = 6000
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_DEVICES = 200
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface ClassroomRemoteConfig {
  /** Origin of the Classroom Remote worker, e.g. https://crr.itnauka.org */
  apiOrigin: string
  encryptionKey: Buffer
  /** Origin of the Rozumko site that serves lesson-join.html. */
  siteOrigin: string
}

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const local = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)
    if ((url.protocol !== 'https:' && !local) || url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/** The integration's configuration, or null when it is not set up (feature off). */
export function classroomRemoteConfig(env: NodeJS.ProcessEnv = process.env): ClassroomRemoteConfig | null {
  const apiOrigin = httpsOrigin(env.CLASSROOM_REMOTE_API_URL)
  const keyHex = env.INTEGRATION_ENCRYPTION_KEY ?? ''
  const siteOrigin = httpsOrigin(env.LESSON_SITE_ORIGIN ?? 'https://rozumko.com')
  if (!apiOrigin || !siteOrigin || !/^[0-9a-f]{64}$/i.test(keyHex)) return null
  return { apiOrigin, encryptionKey: Buffer.from(keyHex, 'hex'), siteOrigin }
}

export function isClassroomRemoteToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

/** What the console may show about a stored key: its last four characters. */
export function tokenHint(token: string): string {
  return token.slice(-4)
}

// ── Encryption at rest ──────────────────────────────────────────────────────

const CIPHER_VERSION = 'v1'

export function encryptIntegrationSecret(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${CIPHER_VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')}`
}

/** The plaintext, or null when the payload was tampered with or belongs to someone else. */
export function decryptIntegrationSecret(key: Buffer, payload: string, aad: string): string | null {
  const [version, data] = payload.split('.')
  if (version !== CIPHER_VERSION || !data) return null
  try {
    const raw = Buffer.from(data, 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ── HTTP client ─────────────────────────────────────────────────────────────

export type ClassroomRemoteErrorKind = 'invalid-key' | 'url-not-allowed' | 'unavailable'

export class ClassroomRemoteError extends Error {
  readonly kind: ClassroomRemoteErrorKind
  constructor(kind: ClassroomRemoteErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export interface ClassroomRemoteDevice {
  deviceName: string
  online: boolean
  synced: boolean
}

export interface ClassroomRemoteStatus {
  organizationName: string
  roomName: string
  domain: string
  lesson: { revision: number; status: 'idle' | 'active'; url: string | null }
  devices: ClassroomRemoteDevice[]
  summary: { total: number; online: number; synced: number }
}

function text(value: unknown, max = 120): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null
}

/** Defensive parse of GET /api/integration/v1/classroom: anything unexpected is refused. */
export function parseClassroomStatus(body: unknown): ClassroomRemoteStatus | null {
  const b = body as Record<string, any> | null
  if (!b || typeof b !== 'object' || b.protocol !== 1 || !Array.isArray(b.devices)) return null
  const lesson = b.lesson as Record<string, unknown> | undefined
  if (!lesson || !Number.isInteger(lesson.revision)) return null
  const devices: ClassroomRemoteDevice[] = []
  for (const d of (b.devices as unknown[]).slice(0, MAX_DEVICES)) {
    const device = d as Record<string, unknown>
    const deviceName = text(device?.deviceName, 64)
    if (!deviceName) return null
    devices.push({ deviceName, online: device.online === true, synced: device.synced === true })
  }
  return {
    organizationName: text(b.organizationName) ?? '',
    roomName: text(b.roomName) ?? '',
    domain: text(b.domain, 253) ?? '',
    lesson: {
      revision: lesson.revision as number,
      status: lesson.status === 'active' ? 'active' : 'idle',
      url: text(lesson.url, 2048),
    },
    devices,
    summary: {
      total: devices.length,
      online: devices.filter(d => d.online).length,
      synced: devices.filter(d => d.synced).length,
    },
  }
}

const UNAVAILABLE = 'Classroom Remote зараз недоступний. Спробуйте ще раз.'

async function call(config: ClassroomRemoteConfig, token: string, path: string, body?: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${config.apiOrigin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'rozumko-lesson-engine',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ClassroomRemoteError('unavailable', UNAVAILABLE)
  }
  const raw = await response.text().catch(() => '')
  if (raw.length > MAX_RESPONSE_BYTES) throw new ClassroomRemoteError('unavailable', UNAVAILABLE)
  let parsed: unknown = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  if (response.status === 401) {
    throw new ClassroomRemoteError('invalid-key', 'Classroom Remote не прийняв ключ. Створіть новий ключ у Classroom Remote.')
  }
  if (response.status === 400 && (parsed as { code?: unknown } | null)?.code === 'url_not_allowed') {
    throw new ClassroomRemoteError('url-not-allowed',
      'Classroom Remote не дозволяє цю адресу. Ключ має бути створений для домену rozumko.com, і домен має бути схвалений у кабінеті.')
  }
  if (!response.ok) throw new ClassroomRemoteError('unavailable', UNAVAILABLE)
  return parsed
}

export async function fetchClassroomStatus(config: ClassroomRemoteConfig, token: string): Promise<ClassroomRemoteStatus> {
  const status = parseClassroomStatus(await call(config, token, '/api/integration/v1/classroom'))
  if (!status) throw new ClassroomRemoteError('unavailable', UNAVAILABLE)
  return status
}

export async function openClassroomLesson(config: ClassroomRemoteConfig, token: string, url: string): Promise<{ revision: number }> {
  const body = await call(config, token, '/api/integration/v1/lesson', { url }) as { revision?: unknown } | null
  if (!body || !Number.isInteger(body.revision)) throw new ClassroomRemoteError('unavailable', UNAVAILABLE)
  return { revision: body.revision as number }
}

/** The absolute class link Classroom Remote opens on the laptops. */
export function absoluteClassLink(config: ClassroomRemoteConfig, path: string): string {
  return `${config.siteOrigin}/${path}`
}
