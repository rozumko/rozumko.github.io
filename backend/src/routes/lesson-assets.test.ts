import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import Fastify, { type FastifyRequest } from 'fastify'

process.env.SUPABASE_URL = 'https://test.supabase.co'

const { lessonAssetReadRoutes, lessonAssetUploadRoutes } = await import('./lesson-assets.js')
const { db } = await import('../db/index.js')
const { assetDigest, assetIssues, assetRefs } = await import('../lib/lesson-assets.js')
const { validateLessonDefinition } = await import('../lib/curriculum-lesson-schema.js')

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
const PDF = Buffer.from('%PDF-1.7\n%%EOF')
const OWNER = '00000000-0000-4000-8000-00000000000a'

async function withApp(flag: string | undefined, run: (app: ReturnType<typeof Fastify>) => Promise<void>, authenticated = false) {
  const previous = process.env.LESSON_ENGINE_ENABLED
  if (flag === undefined) delete process.env.LESSON_ENGINE_ENABLED
  else process.env.LESSON_ENGINE_ENABLED = flag
  const app = Fastify()
  await app.register(lessonAssetUploadRoutes, {
    prefix: '/api/admin/assets',
    ...(authenticated ? { authenticate: async (req: FastifyRequest) => { req.user = { id: OWNER, authUserId: 'auth', role: 'admin', name: 'Адмін', email: 'a@example.test' } } } : {}),
  })
  await app.register(lessonAssetReadRoutes, { prefix: '/api/assets' })
  await app.ready()
  try { await run(app) } finally {
    await app.close()
    if (previous === undefined) delete process.env.LESSON_ENGINE_ENABLED
    else process.env.LESSON_ENGINE_ENABLED = previous
  }
}

const upload = (body: Buffer, type: string) => ({ method: 'POST' as const, url: '/api/admin/assets', payload: body, headers: { 'content-type': type } })

test('asset routes are dark while the Lesson Engine flag is off', async () => {
  await withApp(undefined, async app => {
    assert.equal((await app.inject(upload(PNG, 'image/png'))).statusCode, 404)
    assert.equal((await app.inject({ method: 'GET', url: `/api/assets/${'a'.repeat(64)}` })).statusCode, 404)
  })
})

test('uploading needs an admin session', async () => {
  await withApp('true', async app => {
    assert.equal((await app.inject(upload(PNG, 'image/png'))).statusCode, 401)
  })
})

test('only genuine PNG/JPEG/WebP/PDF bytes are stored, never HTML, SVG or a mislabelled file', async () => {
  const insert = mock.method(db, 'insert', () => { throw new Error('must not store') })
  try {
    await withApp('true', async app => {
      for (const [body, type] of [
        [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'],
        [Buffer.from('<html><script>alert(1)</script></html>'), 'text/html'],
        [PDF, 'image/png'],
        [PNG, 'application/pdf'],
        [Buffer.alloc(0), 'image/png'],
      ] as [Buffer, string][]) {
        const status = (await app.inject(upload(body, type))).statusCode
        assert.ok(status === 400 || status === 415, `${type}: ${status}`)
      }
      assert.equal((await app.inject(upload(Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]), 'application/pdf'))).statusCode, 413)
    }, true)
  } finally { insert.mock.restore() }
})

test('an upload is stored once under the hash of its bytes', async () => {
  const stored: unknown[] = []
  const insert = mock.method(db, 'insert', () => ({ values: (row: unknown) => { stored.push(row); return { onConflictDoNothing: async () => undefined } } }))
  const select = mock.method(db, 'select', () => ({ from: () => ({ where: () => ({ limit: async () => [{ mime: 'application/pdf' }] }) }) }))
  try {
    await withApp('true', async app => {
      const response = await app.inject(upload(PDF, 'application/pdf'))
      assert.equal(response.statusCode, 201)
      assert.deepEqual(response.json(), { sha256: assetDigest(PDF), mime: 'application/pdf', size: PDF.length })
    }, true)
    assert.equal((stored[0] as { createdBy: string }).createdBy, OWNER)
  } finally { insert.mock.restore(); select.mock.restore() }
})

test('a file is served with its fixed type, nosniff, immutable caching and a locked-down image policy', async () => {
  const select = mock.method(db, 'select', () => ({ from: () => ({ where: () => ({ limit: async () => [{ mime: 'image/png', bytes: PNG }] }) }) }))
  try {
    await withApp('true', async app => {
      assert.equal((await app.inject({ method: 'GET', url: '/api/assets/not-a-hash' })).statusCode, 400)
      const response = await app.inject({ method: 'GET', url: `/api/assets/${assetDigest(PNG)}` })
      assert.equal(response.statusCode, 200)
      assert.equal(response.headers['content-type'], 'image/png')
      assert.equal(response.headers['x-content-type-options'], 'nosniff')
      assert.match(String(response.headers['cache-control']), /immutable/)
      assert.match(String(response.headers['content-security-policy']), /sandbox/)
      assert.deepEqual(response.rawPayload, PNG)
    })
  } finally { select.mock.restore() }
})

test('lesson definitions reference files by hash and fail closed when a file is missing', async () => {
  const lesson = JSON.parse((await import('node:fs')).readFileSync(new URL('../lib/curriculum-fixtures/test-subject.lesson.json', import.meta.url), 'utf8'))
  const item = { type: 'asset', sha256: assetDigest(PNG), mime: 'image/png', name: { uk: 'Мапа' } }
  lesson.blocks.push({
    id: `${lesson.id}-b99`, type: 'canvas', modality: 'teacher-led', runtime: { step: true },
    audience: { teacher: true, student: true }, views: { document: true, presentation: true, remote: true },
    presentation: { layout: 'concept' },
    content: { heading: { uk: 'Мапа' }, teacher: [item], board: [item], student: [item] },
  })
  assert.equal(validateLessonDefinition(lesson).ok, true)
  for (const bad of [{ ...item, sha256: 'x'.repeat(64) }, { ...item, mime: 'image/svg+xml' }, { ...item, data: 'AAAA' }]) {
    const copy = structuredClone(lesson)
    copy.blocks.at(-1).content.board = [bad]
    assert.equal(validateLessonDefinition(copy).ok, false, JSON.stringify(bad))
  }
  assert.equal(assetRefs(lesson).length, 3)
  const known = [{ sha256: item.sha256, mime: 'image/png' }]
  const executor = { select: () => ({ from: () => ({ where: async () => known }) }) } as never
  assert.deepEqual(await assetIssues(lesson, executor), [])
  known[0]!.mime = 'application/pdf'
  assert.equal((await assetIssues(lesson, executor)).length, 3)
  known.length = 0
  const missing = await assetIssues(lesson, executor)
  assert.equal(missing.length, 3)
  assert.match(missing[0]!.path, /blocks\[\d+\]\.content\.teacher\[0\]\.sha256/)
})
