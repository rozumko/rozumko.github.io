// Lesson Engine classroom control (stage I): which lab computer belongs to
// which roster student, per class. Configuration the teacher sets once and
// reuses every lesson. Owner-scoped; dark unless LESSON_ENGINE_ENABLED.

import type { FastifyInstance } from 'fastify'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { classStudents, deviceAssignments, teacherClasses } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { REMOTE_DEVICE_ID_PATTERN } from '../lib/lesson-device.js'

const classParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

export async function deviceAssignmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', requireAuth)

  // GET /api/teacher/classes/:id/device-assignments
  app.get<{ Params: { id: string } }>('/:id/device-assignments', { schema: { params: classParams } }, async (req, reply) => {
    const [cls] = await db.select({ id: teacherClasses.id }).from(teacherClasses)
      .where(and(eq(teacherClasses.id, req.params.id), eq(teacherClasses.teacherId, req.user!.id))).limit(1)
    if (!cls) return reply.code(404).send({ error: 'Клас не знайдено' })
    const assignments = await db.select({
      remoteDeviceId: deviceAssignments.remoteDeviceId,
      classStudentId: deviceAssignments.classStudentId,
    }).from(deviceAssignments).where(eq(deviceAssignments.classId, cls.id)).orderBy(asc(deviceAssignments.remoteDeviceId))
    return reply.send({ assignments })
  })

  // PUT /api/teacher/classes/:id/device-assignments — replace the class's map
  app.put<{ Params: { id: string }; Body: { assignments: { remoteDeviceId: string; classStudentId: string }[] } }>('/:id/device-assignments', {
    schema: {
      params: classParams,
      body: {
        type: 'object',
        required: ['assignments'],
        properties: {
          assignments: {
            type: 'array',
            maxItems: 60,
            items: {
              type: 'object',
              required: ['remoteDeviceId', 'classStudentId'],
              additionalProperties: false,
              properties: {
                remoteDeviceId: { type: 'string', pattern: REMOTE_DEVICE_ID_PATTERN },
                classStudentId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { assignments } = req.body
    const devices = new Set(assignments.map(a => a.remoteDeviceId))
    const students = new Set(assignments.map(a => a.classStudentId))
    if (devices.size !== assignments.length || students.size !== assignments.length) {
      return reply.code(400).send({ error: 'Один комп’ютер — один учень, і навпаки.' })
    }
    const [cls] = await db.select({ id: teacherClasses.id }).from(teacherClasses)
      .where(and(eq(teacherClasses.id, req.params.id), eq(teacherClasses.teacherId, teacherId))).limit(1)
    if (!cls) return reply.code(404).send({ error: 'Клас не знайдено' })
    if (students.size > 0) {
      const own = await db.select({ id: classStudents.id }).from(classStudents)
        .where(and(eq(classStudents.classId, cls.id), inArray(classStudents.id, [...students])))
      if (own.length !== students.size) return reply.code(400).send({ error: 'Учня не знайдено в цьому класі.' })
    }
    await db.transaction(async tx => {
      await tx.delete(deviceAssignments).where(eq(deviceAssignments.classId, cls.id))
      if (assignments.length > 0) {
        await tx.insert(deviceAssignments).values(assignments.map(a => ({
          teacherId, classId: cls.id, remoteDeviceId: a.remoteDeviceId, classStudentId: a.classStudentId,
        })))
      }
    })
    return reply.send({ assignments })
  })
}
