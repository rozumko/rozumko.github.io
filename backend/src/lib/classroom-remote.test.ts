import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  ClassroomRemoteError,
  classroomRemoteConfig,
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  fetchClassroomStatus,
  isClassroomRemoteToken,
  openClassroomLesson,
  parseClassroomStatus,
  tokenHint,
} from './classroom-remote.js'

const KEY_HEX = 'ab'.repeat(32)
const TOKEN = `crk_${'1'.repeat(32)}_${'A'.repeat(43)}`

test('the integration is off unless every setting is valid', () => {
  assert.equal(classroomRemoteConfig({}), null)
  assert.equal(classroomRemoteConfig({ CLASSROOM_REMOTE_API_URL: 'https://crr.itnauka.org' }), null, 'no encryption key')
  assert.equal(classroomRemoteConfig({ CLASSROOM_REMOTE_API_URL: 'http://crr.itnauka.org', INTEGRATION_ENCRYPTION_KEY: KEY_HEX }), null, 'plain http only on localhost')
  assert.equal(classroomRemoteConfig({ CLASSROOM_REMOTE_API_URL: 'https://crr.itnauka.org', INTEGRATION_ENCRYPTION_KEY: 'short' }), null)
  const config = classroomRemoteConfig({ CLASSROOM_REMOTE_API_URL: 'https://crr.itnauka.org/some/path', INTEGRATION_ENCRYPTION_KEY: KEY_HEX })
  assert.equal(config?.apiOrigin, 'https://crr.itnauka.org', 'only the origin is kept')
  assert.equal(config?.siteOrigin, 'https://rozumko.com')
  assert.equal(classroomRemoteConfig({ CLASSROOM_REMOTE_API_URL: 'http://127.0.0.1:8793', INTEGRATION_ENCRYPTION_KEY: KEY_HEX })?.apiOrigin, 'http://127.0.0.1:8793')
})

test('keys have one exact shape and only a four-character hint is shown', () => {
  assert.ok(isClassroomRemoteToken(TOKEN))
  for (const bad of ['', 'crk_', `${TOKEN}x`, TOKEN.replace('crk_', 'crx_'), 42]) assert.ok(!isClassroomRemoteToken(bad), String(bad))
  assert.equal(tokenHint(TOKEN), 'AAAA')
})

test('a stored key decrypts only for its own teacher and detects tampering', () => {
  const key = Buffer.from(KEY_HEX, 'hex')
  const sealed = encryptIntegrationSecret(key, TOKEN, 'teacher-1')
  assert.match(sealed, /^v1\./)
  assert.ok(!sealed.includes(TOKEN.slice(4, 20)), 'no plaintext in the ciphertext')
  assert.notEqual(encryptIntegrationSecret(key, TOKEN, 'teacher-1'), sealed, 'a fresh IV every time')
  assert.equal(decryptIntegrationSecret(key, sealed, 'teacher-1'), TOKEN)
  assert.equal(decryptIntegrationSecret(key, sealed, 'teacher-2'), null, 'bound to its teacher')
  assert.equal(decryptIntegrationSecret(Buffer.from('cd'.repeat(32), 'hex'), sealed, 'teacher-1'), null)
  const flipped = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA')
  assert.equal(decryptIntegrationSecret(key, flipped, 'teacher-1'), null)
  assert.equal(decryptIntegrationSecret(key, 'v0.abc', 'teacher-1'), null)
})

test('a classroom status is parsed defensively', () => {
  const good = {
    protocol: 1, organizationName: 'UGS', roomName: 'Кабінет', domain: 'rozumko.com',
    lesson: { revision: 4, status: 'active', url: 'https://rozumko.com/x', onIntegrationDomain: true },
    devices: [{ deviceName: 'PC-01', online: true, synced: true }, { deviceName: 'PC-02', online: true, synced: 'yes' }],
  }
  const parsed = parseClassroomStatus(good)
  assert.deepEqual(parsed?.summary, { total: 2, online: 2, synced: 1 }, 'only a literal true counts')
  assert.equal(parseClassroomStatus({ ...good, protocol: 2 }), null)
  assert.equal(parseClassroomStatus({ ...good, devices: [{ online: true }] }), null)
  assert.equal(parseClassroomStatus({ ...good, lesson: { revision: 'x' } }), null)
  assert.equal(parseClassroomStatus(null), null)
})

async function withFakeRemote(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void, run: (origin: string) => Promise<void>) {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => handler(req, body, res))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
  } finally {
    server.close()
  }
}

test('the client sends the key as a bearer token and maps every failure to a clear kind', async () => {
  const seen: { auth?: string; path?: string; body?: string }[] = []
  await withFakeRemote((req, body, res) => {
    seen.push({ auth: req.headers.authorization, path: req.url, body })
    const reply = (status: number, json: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)) }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply(401, { code: 'invalid_key' })
    if (req.url === '/api/integration/v1/classroom') {
      return reply(200, { protocol: 1, roomName: 'Кабінет', domain: 'rozumko.com', lesson: { revision: 1, status: 'idle', url: null }, devices: [] })
    }
    const { url } = JSON.parse(body) as { url: string }
    if (!url.startsWith('https://rozumko.com/')) return reply(400, { code: 'url_not_allowed' })
    if (url.endsWith('/boom')) return reply(500, {})
    if (url.endsWith('/redirect')) { res.writeHead(302, { location: 'https://example.com' }); return res.end() }
    return reply(200, { revision: 7, status: 'active', url })
  }, async origin => {
    const config = { apiOrigin: origin, encryptionKey: Buffer.from(KEY_HEX, 'hex'), siteOrigin: 'https://rozumko.com' }
    assert.equal((await fetchClassroomStatus(config, TOKEN)).roomName, 'Кабінет')
    assert.deepEqual(await openClassroomLesson(config, TOKEN, 'https://rozumko.com/lesson-join.html#class=x'), { revision: 7 })
    assert.equal(seen[0]!.auth, `Bearer ${TOKEN}`)
    const kindOf = async (promise: Promise<unknown>) => {
      try { await promise } catch (err) { return (err as ClassroomRemoteError).kind }
      return 'resolved'
    }
    assert.equal(await kindOf(fetchClassroomStatus(config, `crk_${'2'.repeat(32)}_${'B'.repeat(43)}`)), 'invalid-key')
    assert.equal(await kindOf(openClassroomLesson(config, TOKEN, 'https://evil.test/x')), 'url-not-allowed')
    assert.equal(await kindOf(openClassroomLesson(config, TOKEN, 'https://rozumko.com/boom')), 'unavailable')
    assert.equal(await kindOf(openClassroomLesson(config, TOKEN, 'https://rozumko.com/redirect')), 'unavailable', 'redirects are never followed')
    assert.equal(await kindOf(fetchClassroomStatus({ ...config, apiOrigin: 'http://127.0.0.1:1' }, TOKEN)), 'unavailable')
  })
})
