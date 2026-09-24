// Lesson Engine student API (stage G1): no accounts. A child joins a run with
// its 6-digit code and gets an anonymous device (pairing number + token).
// The device learns who it is only after the teacher maps it, and never sees
// the roster. Tokens travel in request bodies, never in URLs.

import type { FastifyInstance } from 'fastify'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { classStudents, lessonRunDevices, lessonRunEvents, lessonRunStudents, lessonRuns } from '../db/schema.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { OPEN_RUN_STATUSES } from '../lib/lesson-run-state.js'
import type { LessonDefinitionV1 } from '../lib/curriculum-lesson-schema.js'
import {
  LESSON_DEVICE_TTL_MS,
  MAX_RUN_DEVICES,
  deviceLiveness,
  generateDeviceToken,
  isLessonJoinCode,
  nextPairingNumber,
  verifyDeviceToken,
} from '../lib/lesson-device.js'
import {
  LESSON_JOIN_CODE_IP_THROTTLE_SCOPE,
  LESSON_JOIN_CODE_THROTTLE_SCOPE,
  clearCodeThrottle,
  getCodeThrottleStatus,
  recordCodeFailure,
} from './code-throttle.js'

class JoinClosedError extends Error {}

const deviceBody = {
  type: 'object',
  required: ['deviceId', 'deviceToken'],
  additionalProperties: false,
  properties: {
    deviceId: { type: 'string', format: 'uuid' },
    deviceToken: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
} as const

export async function lessonStudentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })

  // POST /api/student/lesson/join — code → anonymous device
  app.post<{ Body: { code: string } }>('/join', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        additionalProperties: false,
        properties: { code: { type: 'string', minLength: 6, maxLength: 6 } },
      },
    },
  }, async (req, reply) => {
    const { code } = req.body
    if (!isLessonJoinCode(code)) return reply.code(400).send({ error: 'Введи 6 цифр коду.' })
    const byCode = getCodeThrottleStatus(LESSON_JOIN_CODE_THROTTLE_SCOPE, code)
    const byIp = getCodeThrottleStatus(LESSON_JOIN_CODE_IP_THROTTLE_SCOPE, req.ip)
    const throttle = byCode.allowed ? byIp : byCode
    if (!throttle.allowed) {
      return reply.code(429).header('Retry-After', String(throttle.retryAfterSeconds))
        .send({ error: 'Забагато невдалих спроб. Спробуй трохи пізніше.' })
    }

    const [run] = await db.select({ id: lessonRuns.id }).from(lessonRuns).where(and(
      eq(lessonRuns.joinCode, code),
      gt(lessonRuns.joinCodeExpiresAt, new Date()),
      inArray(lessonRuns.status, [...OPEN_RUN_STATUSES]),
    )).limit(1)
    if (!run) {
      recordCodeFailure(LESSON_JOIN_CODE_THROTTLE_SCOPE, code)
      recordCodeFailure(LESSON_JOIN_CODE_IP_THROTTLE_SCOPE, req.ip)
      return reply.code(404).send({ error: 'Урок із таким кодом не знайдено.' })
    }
    // Per-IP bucket intentionally not cleared — see code-throttle.ts.
    clearCodeThrottle(LESSON_JOIN_CODE_THROTTLE_SCOPE, code)

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const device = await db.transaction(async tx => {
          // Lock the run so concurrent joins take distinct pairing numbers.
          const [locked] = await tx.select({ status: lessonRuns.status, joinCode: lessonRuns.joinCode })
            .from(lessonRuns).where(eq(lessonRuns.id, run.id)).limit(1).for('update')
          if (!locked || locked.joinCode !== code || !OPEN_RUN_STATUSES.includes(locked.status)) throw new JoinClosedError()
          const existing = await tx.select({ n: lessonRunDevices.pairingNumber }).from(lessonRunDevices)
            .where(eq(lessonRunDevices.lessonRunId, run.id))
          if (existing.length >= MAX_RUN_DEVICES) throw new JoinClosedError('full')
          const [row] = await tx.insert(lessonRunDevices).values({
            lessonRunId: run.id,
            pairingNumber: nextPairingNumber(existing.map(e => e.n)),
            expiresAt: new Date(Date.now() + LESSON_DEVICE_TTL_MS),
          }).returning()
          await tx.insert(lessonRunEvents).values({
            lessonRunId: run.id, type: 'device_joined', actorType: 'device', actorId: row!.id,
            payload: { pairingNumber: row!.pairingNumber },
          })
          return row!
        })
        return reply.code(201).send({
          deviceId: device.id,
          deviceToken: generateDeviceToken(device.id),
          pairingNumber: device.pairingNumber,
          expiresAt: device.expiresAt,
        })
      } catch (err) {
        if (isUniqueViolation(err)) continue
        if (err instanceof JoinClosedError) {
          return reply.code(409).send({
            error: err.message === 'full' ? 'До уроку вже приєдналося забагато пристроїв.' : 'Приєднання до уроку закрито.',
          })
        }
        throw err
      }
    }
    return reply.code(503).send({ error: 'Спробуй ще раз.' })
  })

  // POST /api/student/lesson/state — who am I, and what is the lesson doing?
  app.post<{ Body: { deviceId: string; deviceToken: string } }>('/state', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: { body: deviceBody },
  }, async (req, reply) => {
    const { deviceId, deviceToken } = req.body
    if (!verifyDeviceToken(deviceId, deviceToken)) return reply.code(401).send({ error: 'Приєднайся до уроку ще раз.', code: 'DEVICE_INVALID' })

    const [row] = await db.select({
      device: lessonRunDevices,
      runStatus: lessonRuns.status,
      lessonSnapshot: lessonRuns.lessonSnapshot,
      label: classStudents.label,
    })
      .from(lessonRunDevices)
      .innerJoin(lessonRuns, eq(lessonRuns.id, lessonRunDevices.lessonRunId))
      .leftJoin(lessonRunStudents, eq(lessonRunStudents.id, lessonRunDevices.lessonRunStudentId))
      .leftJoin(classStudents, eq(classStudents.id, lessonRunStudents.classStudentId))
      .where(eq(lessonRunDevices.id, deviceId)).limit(1)
    if (!row || deviceLiveness(row.device) !== 'live') {
      return reply.code(401).send({ error: 'Приєднайся до уроку ще раз.', code: 'DEVICE_INVALID' })
    }

    await db.update(lessonRunDevices).set({ lastSeenAt: sql`now()` }).where(eq(lessonRunDevices.id, deviceId))
    const lesson = row.lessonSnapshot as unknown as LessonDefinitionV1
    return reply.send({
      runStatus: row.runStatus,
      lessonTitle: lesson.title,
      pairingNumber: row.device.pairingNumber,
      mapped: row.device.lessonRunStudentId !== null,
      // Only the child's own roster label, and only once the teacher mapped it.
      studentLabel: row.device.lessonRunStudentId !== null ? row.label ?? null : null,
    })
  })
}
