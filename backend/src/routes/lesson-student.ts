// Lesson Engine student API (stage G1): no accounts. A child joins a run with
// its 6-digit code and gets an anonymous device (pairing number + token).
// The device learns who it is only after the teacher maps it, and never sees
// the roster. Tokens travel in request bodies, never in URLs.

import type { FastifyInstance } from 'fastify'
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { activityAttempts, classStudents, lessonRunDevices, lessonRunDispatches, lessonRunEvents, lessonRunStudents, lessonRuns, studentOutcomeEvidence } from '../db/schema.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { OPEN_RUN_STATUSES } from '../lib/lesson-run-state.js'
import type { ActivitySpec, LessonDefinitionV1 } from '../lib/curriculum-lesson-schema.js'
import { ActivityAnswerError } from '../lib/curriculum-activity-scoring.js'
import { findSubjectPack } from '../lib/subject-packs.js'
import { acceptsAttempts, attemptLimit, scoreStudentAttempt, studentActivityView } from '../lib/lesson-live.js'
import { evidenceRowsForAttempt } from '../lib/lesson-evidence.js'
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
class AttemptRefusedError extends Error {}

function findActivity(lesson: LessonDefinitionV1, instanceId: string): { activity: ActivitySpec; heading: unknown } | null {
  for (const block of lesson.blocks) {
    if (block.type === 'activity' && block.activity.instanceId === instanceId) {
      return { activity: block.activity, heading: block.content.heading ?? null }
    }
  }
  return null
}

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

    // The open activity, only for a mapped device while the lesson is live.
    let task: Record<string, unknown> | null = null
    const studentId = row.device.lessonRunStudentId
    if (studentId && row.runStatus === 'active') {
      const [dispatch] = await db.select({ id: lessonRunDispatches.id, instanceId: lessonRunDispatches.activityInstanceId })
        .from(lessonRunDispatches)
        .where(and(eq(lessonRunDispatches.lessonRunId, row.device.lessonRunId), isNull(lessonRunDispatches.closedAt))).limit(1)
      const found = dispatch ? findActivity(lesson, dispatch.instanceId) : null
      if (dispatch && found) {
        const attempts = await db.select({ correct: activityAttempts.correct, total: activityAttempts.total })
          .from(activityAttempts)
          .where(and(eq(activityAttempts.dispatchId, dispatch.id), eq(activityAttempts.lessonRunStudentId, studentId)))
          .orderBy(asc(activityAttempts.attemptNo))
        const last = attempts.at(-1)
        task = {
          dispatchId: dispatch.id,
          heading: found.heading,
          activity: studentActivityView(found.activity, findSubjectPack(lesson.subjectPackId)),
          acceptsAttempts: acceptsAttempts(found.activity),
          attemptsUsed: attempts.length,
          attemptsMax: attemptLimit(found.activity),
          // Evidence shows only that an answer was received, never its score.
          lastResult: last && found.activity.telemetry !== 'evidence' ? { correct: last.correct, total: last.total } : null,
        }
      }
    }

    return reply.send({
      task,
      runStatus: row.runStatus,
      lessonTitle: lesson.title,
      grade: lesson.grade,
      pairingNumber: row.device.pairingNumber,
      mapped: row.device.lessonRunStudentId !== null,
      // Only the child's own roster label, and only once the teacher mapped it.
      studentLabel: row.device.lessonRunStudentId !== null ? row.label ?? null : null,
    })
  })

  // POST /api/student/lesson/attempt — one submission from a mapped device.
  // Idempotent per (device, clientAttemptId): a retry returns the same result.
  app.post<{ Body: { deviceId: string; deviceToken: string; dispatchId: string; clientAttemptId: string; answer?: unknown; gameResult?: unknown } }>('/attempt', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['deviceId', 'deviceToken', 'dispatchId', 'clientAttemptId'],
        additionalProperties: false,
        properties: {
          ...deviceBody.properties,
          dispatchId: { type: 'string', format: 'uuid' },
          clientAttemptId: { type: 'string', format: 'uuid' },
          answer: { type: 'object' },
          gameResult: {
            type: 'object',
            required: ['correct', 'total', 'mistakes', 'durationSec'],
            properties: {
              correct: { type: 'integer' }, total: { type: 'integer' },
              mistakes: { type: 'integer' }, durationSec: { type: 'integer' },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { deviceId, deviceToken, dispatchId, clientAttemptId } = req.body
    if (!verifyDeviceToken(deviceId, deviceToken)) return reply.code(401).send({ error: 'Приєднайся до уроку ще раз.', code: 'DEVICE_INVALID' })

    try {
      const outcome = await db.transaction(async tx => {
        // Locking the device serialises this child's submissions.
        const [row] = await tx.select({ device: lessonRunDevices, runStatus: lessonRuns.status, lessonSnapshot: lessonRuns.lessonSnapshot })
          .from(lessonRunDevices)
          .innerJoin(lessonRuns, eq(lessonRuns.id, lessonRunDevices.lessonRunId))
          .where(eq(lessonRunDevices.id, deviceId)).limit(1).for('update', { of: lessonRunDevices })
        if (!row || deviceLiveness(row.device) !== 'live') return { status: 401 as const }
        const studentId = row.device.lessonRunStudentId
        if (!studentId) throw new AttemptRefusedError('Зачекай, поки вчитель тебе призначить.')
        const lesson = row.lessonSnapshot as unknown as LessonDefinitionV1

        const [previous] = await tx.select().from(activityAttempts).where(and(
          eq(activityAttempts.lessonRunDeviceId, deviceId), eq(activityAttempts.clientAttemptId, clientAttemptId),
        )).limit(1)
        if (previous) {
          // Replay: same stored attempt; rebuild feedback deterministically.
          const found = findActivity(lesson, previous.activityInstanceId)
          const rescored = found ? scoreStudentAttempt(found.activity, previous.answerPayload) : null
          return { status: 200 as const, attempt: previous, feedback: rescored?.feedback ?? null, limit: found ? attemptLimit(found.activity) : previous.attemptNo }
        }

        if (row.runStatus !== 'active') throw new AttemptRefusedError('Зараз урок на паузі або завершений.')
        const [dispatch] = await tx.select().from(lessonRunDispatches).where(and(
          eq(lessonRunDispatches.id, dispatchId), eq(lessonRunDispatches.lessonRunId, row.device.lessonRunId),
        )).limit(1)
        if (!dispatch || dispatch.closedAt) throw new AttemptRefusedError('Це завдання вже закрите.')
        const found = findActivity(lesson, dispatch.activityInstanceId)
        if (!found || !acceptsAttempts(found.activity)) throw new AttemptRefusedError('Це завдання не приймає відповідей.')

        const used = await tx.select({ n: activityAttempts.attemptNo }).from(activityAttempts).where(and(
          eq(activityAttempts.dispatchId, dispatch.id), eq(activityAttempts.lessonRunStudentId, studentId),
        ))
        const limit = attemptLimit(found.activity)
        if (used.length >= limit) throw new AttemptRefusedError('Спроби вже використано.')

        const scored = scoreStudentAttempt(found.activity, req.body)
        const [attempt] = await tx.insert(activityAttempts).values({
          clientAttemptId,
          lessonRunId: row.device.lessonRunId,
          dispatchId: dispatch.id,
          lessonRunDeviceId: deviceId,
          lessonRunStudentId: studentId,
          blockId: dispatch.blockId,
          activityInstanceId: found.activity.instanceId,
          mechanic: found.activity.mechanic,
          telemetry: found.activity.telemetry,
          attemptNo: used.length + 1,
          answerPayload: scored.answerPayload,
          correct: scored.result.correct,
          total: scored.result.total,
          mistakes: scored.result.mistakes,
          normalizedScore: scored.result.normalizedScore,
          durationSec: scored.result.durationSec ?? null,
          trust: scored.result.trust,
        }).returning()

        // Evidence activities record outcome evidence in the same transaction.
        const evidence = evidenceRowsForAttempt(found.activity, { trust: scored.result.trust, normalizedScore: scored.result.normalizedScore })
        if (evidence.length > 0) {
          const [runStudent] = await tx.select({ classStudentId: lessonRunStudents.classStudentId })
            .from(lessonRunStudents).where(eq(lessonRunStudents.id, studentId)).limit(1)
          await tx.insert(studentOutcomeEvidence).values(evidence.map(row => ({
            lessonRunId: attempt!.lessonRunId,
            lessonRunStudentId: studentId,
            classStudentId: runStudent?.classStudentId ?? null,
            activityAttemptId: attempt!.id,
            subjectPackId: lesson.subjectPackId,
            outcomeId: row.outcomeId,
            evidenceRole: row.evidenceRole,
            trust: row.trust,
            score: row.score,
          })))
        }
        return { status: 201 as const, attempt: attempt!, feedback: scored.feedback, limit }
      })
      if (outcome.status === 401) return reply.code(401).send({ error: 'Приєднайся до уроку ще раз.', code: 'DEVICE_INVALID' })
      const { attempt, feedback, limit } = outcome
      const evidence = attempt.telemetry === 'evidence'
      return reply.code(outcome.status).send({
        attemptNo: attempt.attemptNo,
        attemptsLeft: Math.max(0, limit - attempt.attemptNo),
        // Evidence: the child sees that the answer was received, not its score.
        result: evidence ? null : {
          correct: attempt.correct, total: attempt.total, normalizedScore: Number(attempt.normalizedScore), trust: attempt.trust,
        },
        feedback,
      })
    } catch (err) {
      if (err instanceof AttemptRefusedError) return reply.code(409).send({ error: err.message })
      if (err instanceof ActivityAnswerError) return reply.code(400).send({ error: err.message })
      if (isUniqueViolation(err)) return reply.code(409).send({ error: 'Спробуй ще раз.' })
      throw err
    }
  })
}
