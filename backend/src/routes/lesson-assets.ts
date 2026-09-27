// Lesson file storage (0063). Admins upload raw bytes; anyone holding a lesson
// can fetch a file by the SHA-256 of its content. Only PNG/JPEG/WebP/PDF with
// matching leading bytes are stored, and they are served with that fixed type,
// so a stored file can never become HTML or SVG on the API origin.

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { lessonAssets } from '../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { ASSET_SHA256_PATTERN, LESSON_FILE_MIMES, fileSignatureMatches } from '../lib/curriculum-lesson-schema.js'
import { MAX_ASSET_BYTES, assetDigest } from '../lib/lesson-assets.js'
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../lib/rate-limit-policy.js'

const IMMUTABLE = 'public, max-age=31536000, immutable'

function darkUnlessEnabled(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
}

export interface LessonAssetUploadOptions {
  /** Tests only; production registers without options and gets requireAdmin. */
  authenticate?: preHandlerAsyncHookHandler
}

/** POST /api/admin/assets — body is the file itself, Content-Type its type. */
export async function lessonAssetUploadRoutes(app: FastifyInstance, options: LessonAssetUploadOptions = {}) {
  darkUnlessEnabled(app)
  app.addHook('preHandler', options.authenticate ?? requireAdmin)
  app.addContentTypeParser([...LESSON_FILE_MIMES], { parseAs: 'buffer', bodyLimit: MAX_ASSET_BYTES }, (_req, body, done) => done(null, body))

  app.post<{ Body: Buffer }>('/', {
    bodyLimit: MAX_ASSET_BYTES,
    config: { rateLimit: { max: RATE_LIMIT_MAX.lessonAssetUpload, timeWindow: RATE_LIMIT_WINDOW } },
  }, async (req, reply) => {
    const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()
    const bytes = req.body
    if (!Buffer.isBuffer(bytes) || !bytes.length) return reply.code(400).send({ error: 'Порожній файл.' })
    if (!fileSignatureMatches(mime, bytes)) {
      return reply.code(400).send({ error: 'Підтримуються лише справжні PNG, JPEG, WebP і PDF.' })
    }
    const sha256 = assetDigest(bytes)
    // Same bytes, same row: a re-upload is a no-op, never a second copy.
    await db.insert(lessonAssets).values({ sha256, mime, bytes, size: bytes.length, createdBy: req.user!.id }).onConflictDoNothing()
    const [stored] = await db.select({ mime: lessonAssets.mime }).from(lessonAssets).where(eq(lessonAssets.sha256, sha256)).limit(1)
    return reply.code(201).send({ sha256, mime: stored?.mime ?? mime, size: bytes.length })
  })
}

/** GET /api/assets/:sha256 — public and immutable, like a static file. */
export async function lessonAssetReadRoutes(app: FastifyInstance) {
  darkUnlessEnabled(app)
  app.get<{ Params: { sha256: string } }>('/:sha256', {
    schema: { params: { type: 'object', required: ['sha256'], properties: { sha256: { type: 'string', pattern: ASSET_SHA256_PATTERN } } } },
    // A whole class loads a lesson's files at once from one school address.
    config: { rateLimit: { max: RATE_LIMIT_MAX.lessonAssetRead, timeWindow: RATE_LIMIT_WINDOW } },
  }, async (req, reply) => {
    const [asset] = await db.select({ mime: lessonAssets.mime, bytes: lessonAssets.bytes })
      .from(lessonAssets).where(eq(lessonAssets.sha256, req.params.sha256)).limit(1)
    if (!asset) return reply.code(404).send({ error: 'Файл не знайдено' })
    reply
      .header('Content-Type', asset.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', IMMUTABLE)
      .header('ETag', `"${req.params.sha256}"`)
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Disposition', `inline; filename="${req.params.sha256.slice(0, 12)}.${asset.mime === 'application/pdf' ? 'pdf' : asset.mime.split('/')[1]}"`)
    // Images get a document policy that forbids everything; browser PDF viewers
    // refuse to run inside a sandboxed document, and a PDF cannot carry HTML.
    if (asset.mime !== 'application/pdf') reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
    return reply.send(asset.bytes)
  })
}
