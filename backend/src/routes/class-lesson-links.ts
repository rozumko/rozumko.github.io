// Lesson Engine class link and remembered seats. A teacher turns on one stable
// link per class (e.g. saved once as a Classroom Remote quick link): lab
// laptops opened on it join whatever lesson that class has open. Rotating the
// link revokes every copy; seats remember who sat where so the next lesson
// maps devices by itself. Owner-scoped; dark unless LESSON_ENGINE_ENABLED.

import type { FastifyInstance } from 'fastify'
import { and, count, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { lessonClassLinks, lessonClassSeats, teacherClasses } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { classLinkPath } from '../lib/lesson-device.js'

const classParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

async function ownClass(classId: string, teacherId: string): Promise<boolean> {
  const [cls] = await db.select({ id: teacherClasses.id }).from(teacherClasses)
    .where(and(eq(teacherClasses.id, classId), eq(teacherClasses.teacherId, teacherId))).limit(1)
  return Boolean(cls)
}

/** What the console shows: the link only while it works, and how many seats are remembered. */
async function linkState(classId: string) {
  const [link] = await db.select().from(lessonClassLinks).where(eq(lessonClassLinks.classId, classId)).limit(1)
  const [seats] = await db.select({ n: count() }).from(lessonClassSeats).where(eq(lessonClassSeats.classId, classId))
  return {
    link: link ? {
      enabled: link.enabled,
      version: link.linkVersion,
      path: link.enabled ? classLinkPath(classId, link.linkVersion) : null,
      updatedAt: link.updatedAt,
    } : null,
    rememberedSeats: Number(seats?.n ?? 0),
  }
}

export async function classLessonLinkRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', requireAuth)

  // GET /api/teacher/classes/:id/lesson-link
  app.get<{ Params: { id: string } }>('/:id/lesson-link', { schema: { params: classParams } }, async (req, reply) => {
    if (!await ownClass(req.params.id, req.user!.id)) return reply.code(404).send({ error: 'Клас не знайдено' })
    return reply.send(await linkState(req.params.id))
  })

  // PUT /api/teacher/classes/:id/lesson-link — turn the link on (creating it) or off
  app.put<{ Params: { id: string }; Body: { enabled: boolean } }>('/:id/lesson-link', {
    schema: {
      params: classParams,
      body: { type: 'object', required: ['enabled'], additionalProperties: false, properties: { enabled: { type: 'boolean' } } },
    },
  }, async (req, reply) => {
    const classId = req.params.id
    if (!await ownClass(classId, req.user!.id)) return reply.code(404).send({ error: 'Клас не знайдено' })
    await db.insert(lessonClassLinks).values({ classId, teacherId: req.user!.id, enabled: req.body.enabled })
      .onConflictDoUpdate({ target: lessonClassLinks.classId, set: { enabled: req.body.enabled, updatedAt: new Date() } })
    return reply.send(await linkState(classId))
  })

  // POST /api/teacher/classes/:id/lesson-link/rotate — every copy of the old link stops working
  app.post<{ Params: { id: string } }>('/:id/lesson-link/rotate', { schema: { params: classParams } }, async (req, reply) => {
    const classId = req.params.id
    if (!await ownClass(classId, req.user!.id)) return reply.code(404).send({ error: 'Клас не знайдено' })
    const [link] = await db.select({ version: lessonClassLinks.linkVersion }).from(lessonClassLinks)
      .where(eq(lessonClassLinks.classId, classId)).limit(1)
    if (!link) return reply.code(409).send({ error: 'Спершу увімкніть посилання класу' })
    await db.update(lessonClassLinks)
      .set({ linkVersion: link.version + 1, enabled: true, updatedAt: new Date() })
      .where(and(eq(lessonClassLinks.classId, classId), eq(lessonClassLinks.linkVersion, link.version)))
    return reply.send(await linkState(classId))
  })

  // DELETE /api/teacher/classes/:id/lesson-seats — forget who sat where (e.g. laptops moved)
  app.delete<{ Params: { id: string } }>('/:id/lesson-seats', { schema: { params: classParams } }, async (req, reply) => {
    const classId = req.params.id
    if (!await ownClass(classId, req.user!.id)) return reply.code(404).send({ error: 'Клас не знайдено' })
    await db.delete(lessonClassSeats).where(eq(lessonClassSeats.classId, classId))
    return reply.send(await linkState(classId))
  })
}
