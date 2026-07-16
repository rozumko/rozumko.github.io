import type { FastifyInstance } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { contentPublications } from '../db/schema.js'
import {
  validManifestSha256,
  validPublicationSourceSha,
  verifyPublicationCallback,
  type PublicationCallbackBody,
} from '../lib/content-publication.js'

const callbackBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['publicationId', 'status'],
  properties: {
    publicationId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['running', 'succeeded', 'failed'] },
    workflowRunId: { type: 'string', pattern: '^[0-9]{1,30}$' },
    workflowUrl: { type: 'string', pattern: '^https://github\\.com/[^/]+/[^/]+/actions/runs/[0-9]+$', maxLength: 300 },
    sourceSha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    manifestSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    failureReason: { type: 'string', minLength: 1, maxLength: 300 },
  },
} as const

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function contentPublicationCallbackRoutes(app: FastifyInstance) {
  app.post<{ Body: PublicationCallbackBody }>('/callback', {
    schema: { body: callbackBodySchema },
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const secret = process.env.CONTENT_PUBLISH_CALLBACK_SECRET
    if (!secret || secret.length < 32) {
      return reply.code(503).send({ error: 'Publication callback is not configured' })
    }
    const timestamp = headerValue(req.headers['x-publication-timestamp'])
    const signature = headerValue(req.headers['x-publication-signature'])
    if (!verifyPublicationCallback(secret, timestamp, signature, req.body)) {
      return reply.code(401).send({ error: 'Invalid publication callback signature' })
    }

    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(contentPublications)
        .where(eq(contentPublications.id, req.body.publicationId)).limit(1).for('update')
      if (!current) return { kind: 'not-found' as const }
      if (current.status === 'succeeded' || current.status === 'failed') {
        return current.status === req.body.status
          ? { kind: 'ok' as const, publication: current }
          : { kind: 'conflict' as const }
      }

      const now = new Date()
      const common = {
        ...(req.body.workflowRunId ? { workflowRunId: req.body.workflowRunId } : {}),
        ...(req.body.workflowUrl ? { workflowUrl: req.body.workflowUrl } : {}),
        ...(req.body.sourceSha ? { sourceSha: req.body.sourceSha } : {}),
      }
      if (req.body.status === 'running') {
        const [publication] = await tx.update(contentPublications).set({
          ...common,
          status: 'running',
          startedAt: current.startedAt ?? now,
        }).where(and(
          eq(contentPublications.id, current.id),
          inArray(contentPublications.status, ['queued', 'running']),
        )).returning()
        return { kind: 'ok' as const, publication }
      }

      if (req.body.status === 'succeeded') {
        const validResult = validPublicationSourceSha(req.body.sourceSha)
          && validManifestSha256(req.body.manifestSha256)
          && req.body.manifestSha256 === current.expectedManifestSha256
        if (!validResult) {
          const [publication] = await tx.update(contentPublications).set({
            ...common,
            status: 'failed',
            failureReason: 'Publication result did not match the approved manifest',
            completedAt: now,
          }).where(eq(contentPublications.id, current.id)).returning()
          return { kind: 'invalid-result' as const, publication }
        }
        const [publication] = await tx.update(contentPublications).set({
          ...common,
          status: 'succeeded',
          publishedManifestSha256: req.body.manifestSha256,
          startedAt: current.startedAt ?? now,
          completedAt: now,
          failureReason: null,
        }).where(eq(contentPublications.id, current.id)).returning()
        return { kind: 'ok' as const, publication }
      }

      const [publication] = await tx.update(contentPublications).set({
        ...common,
        status: 'failed',
        failureReason: req.body.failureReason ?? 'GitHub Actions publication failed',
        startedAt: current.startedAt ?? now,
        completedAt: now,
      }).where(eq(contentPublications.id, current.id)).returning()
      return { kind: 'ok' as const, publication }
    })

    if (result.kind === 'not-found') return reply.code(404).send({ error: 'Publication not found' })
    if (result.kind === 'conflict') return reply.code(409).send({ error: 'Publication is already complete' })
    if (result.kind === 'invalid-result') {
      return reply.code(409).send({ error: 'Publication result did not match the approved manifest' })
    }
    return reply.send({ publication: result.publication })
  })
}
