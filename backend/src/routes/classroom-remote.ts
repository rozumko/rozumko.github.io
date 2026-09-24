// Lesson Engine ↔ Classroom Remote, so the teacher never leaves the run
// console: connect once with a Classroom Remote integration key, then open
// the class link on the room's laptops and watch them sync. Classroom Remote
// receives one URL and returns technical device status; it never learns about
// children. Owner-scoped; dark unless LESSON_ENGINE_ENABLED; off without
// CLASSROOM_REMOTE_API_URL + INTEGRATION_ENCRYPTION_KEY (lib/classroom-remote.ts).

import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { classroomRemoteConnections, lessonClassLinks, lessonRunEvents, lessonRuns } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { OPEN_RUN_STATUSES } from '../lib/lesson-run-state.js'
import { classLinkPath } from '../lib/lesson-device.js'
import {
  CLASSROOM_REMOTE_TOKEN_PATTERN,
  ClassroomRemoteError,
  absoluteClassLink,
  classroomRemoteConfig,
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  fetchClassroomStatus,
  openClassroomLesson,
  tokenHint,
  type ClassroomRemoteConfig,
} from '../lib/classroom-remote.js'

const NOT_CONFIGURED = { error: 'Інтеграцію з Classroom Remote на сервері не налаштовано.', code: 'CR_NOT_CONFIGURED' }
const NOT_CONNECTED = { error: 'Спершу підключіть Classroom Remote.', code: 'CR_NOT_CONNECTED' }

const runIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

function sendRemoteError(reply: FastifyReply, err: unknown) {
  if (err instanceof ClassroomRemoteError) {
    const status = err.kind === 'unavailable' ? 502 : 409
    const code = err.kind === 'invalid-key' ? 'CR_KEY_INVALID' : err.kind === 'url-not-allowed' ? 'CR_URL_NOT_ALLOWED' : 'CR_UNAVAILABLE'
    return reply.code(status).send({ error: err.message, code })
  }
  throw err
}

async function storedToken(config: ClassroomRemoteConfig, teacherId: string): Promise<string | null> {
  const [row] = await db.select().from(classroomRemoteConnections)
    .where(eq(classroomRemoteConnections.teacherId, teacherId)).limit(1)
  return row ? decryptIntegrationSecret(config.encryptionKey, row.keyCiphertext, teacherId) : null
}

async function connectionState(teacherId: string) {
  const config = classroomRemoteConfig()
  if (!config) return { configured: false, connected: false }
  const [row] = await db.select({
    keyHint: classroomRemoteConnections.keyHint,
    roomName: classroomRemoteConnections.roomName,
    organizationName: classroomRemoteConnections.organizationName,
    updatedAt: classroomRemoteConnections.updatedAt,
  }).from(classroomRemoteConnections).where(eq(classroomRemoteConnections.teacherId, teacherId)).limit(1)
  return row ? { configured: true, connected: true, ...row } : { configured: true, connected: false }
}

function enginePlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', requireAuth)
}

/** /api/teacher/classroom-remote — the teacher's connection. */
export async function classroomRemoteRoutes(app: FastifyInstance) {
  enginePlugin(app)

  app.get('/', async (req, reply) => reply.send(await connectionState(req.user!.id)))

  // PUT — connect: the key is checked against Classroom Remote before it is stored.
  app.put<{ Body: { key: string } }>('/', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['key'],
        additionalProperties: false,
        properties: { key: { type: 'string', pattern: CLASSROOM_REMOTE_TOKEN_PATTERN } },
      },
    },
  }, async (req, reply) => {
    const config = classroomRemoteConfig()
    if (!config) return reply.code(503).send(NOT_CONFIGURED)
    const teacherId = req.user!.id
    try {
      const status = await fetchClassroomStatus(config, req.body.key)
      const values = {
        keyCiphertext: encryptIntegrationSecret(config.encryptionKey, req.body.key, teacherId),
        keyHint: tokenHint(req.body.key),
        roomName: status.roomName.slice(0, 120),
        organizationName: status.organizationName.slice(0, 120),
        updatedAt: new Date(),
      }
      await db.insert(classroomRemoteConnections).values({ teacherId, ...values })
        .onConflictDoUpdate({ target: classroomRemoteConnections.teacherId, set: values })
    } catch (err) {
      return sendRemoteError(reply, err)
    }
    return reply.send(await connectionState(teacherId))
  })

  // DELETE — forget the key (revoke it in Classroom Remote as well).
  app.delete('/', async (req, reply) => {
    await db.delete(classroomRemoteConnections).where(eq(classroomRemoteConnections.teacherId, req.user!.id))
    return reply.send(await connectionState(req.user!.id))
  })
}

/** /api/teacher/lesson-runs/:id/classroom-remote — the room's laptops for this lesson. */
export async function classroomRemoteRunRoutes(app: FastifyInstance) {
  enginePlugin(app)

  // GET — room status, and whether the laptops show this class's link.
  app.get<{ Params: { id: string } }>('/:id/classroom-remote', { schema: { params: runIdParams } }, async (req, reply) => {
    const teacherId = req.user!.id
    const [run] = await db.select({ classId: lessonRuns.classId }).from(lessonRuns)
      .where(and(eq(lessonRuns.id, req.params.id), eq(lessonRuns.teacherId, teacherId))).limit(1)
    if (!run) return reply.code(404).send({ error: 'Урок не знайдено' })
    const config = classroomRemoteConfig()
    if (!config) return reply.send({ configured: false, connected: false })
    const token = await storedToken(config, teacherId)
    if (!token) return reply.send({ configured: true, connected: false })
    try {
      const status = await fetchClassroomStatus(config, token)
      const [link] = await db.select({ version: lessonClassLinks.linkVersion, enabled: lessonClassLinks.enabled })
        .from(lessonClassLinks).where(eq(lessonClassLinks.classId, run.classId)).limit(1)
      const classUrl = link?.enabled ? absoluteClassLink(config, classLinkPath(run.classId, link.version)) : null
      return reply.send({
        configured: true,
        connected: true,
        roomName: status.roomName,
        showingThisClass: classUrl !== null && status.lesson.status === 'active' && status.lesson.url === classUrl,
        revision: status.lesson.revision,
        summary: status.summary,
        devices: status.devices,
      })
    } catch (err) {
      return sendRemoteError(reply, err)
    }
  })

  // POST — open this class's link on every laptop of the room (enabling the link if needed).
  app.post<{ Params: { id: string } }>('/:id/classroom-remote/open', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { params: runIdParams },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const [run] = await db.select({ id: lessonRuns.id, classId: lessonRuns.classId }).from(lessonRuns)
      .where(and(eq(lessonRuns.id, req.params.id), eq(lessonRuns.teacherId, teacherId), inArray(lessonRuns.status, [...OPEN_RUN_STATUSES])))
      .limit(1)
    if (!run) return reply.code(404).send({ error: 'Урок не знайдено або вже завершено' })
    const config = classroomRemoteConfig()
    if (!config) return reply.code(503).send(NOT_CONFIGURED)
    const token = await storedToken(config, teacherId)
    if (!token) return reply.code(409).send(NOT_CONNECTED)

    const [link] = await db.insert(lessonClassLinks).values({ classId: run.classId, teacherId, enabled: true })
      .onConflictDoUpdate({ target: lessonClassLinks.classId, set: { enabled: true, updatedAt: new Date() } })
      .returning({ version: lessonClassLinks.linkVersion })
    try {
      const { revision } = await openClassroomLesson(config, token, absoluteClassLink(config, classLinkPath(run.classId, link!.version)))
      await db.insert(lessonRunEvents).values({
        lessonRunId: run.id, type: 'devices_launched', actorType: 'teacher', actorId: teacherId,
        payload: { provider: 'classroom-remote', revision },
      })
      return reply.send({ revision })
    } catch (err) {
      return sendRemoteError(reply, err)
    }
  })
}
