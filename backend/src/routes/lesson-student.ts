// Lesson Engine student API (stage G1): no accounts. A child joins a run with
// its 6-digit code and gets an anonymous device (pairing number + token).
// The device learns who it is only after the teacher maps it, and never sees
// the roster. Tokens travel in request bodies, never in URLs.

import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { activityAttempts, classStudents, lessonClassLinks, lessonClassSeats, lessonRunDevices, lessonRunDispatches, lessonRunEvents, lessonRunStudents, lessonRuns, studentOutcomeEvidence } from '../db/schema.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { OPEN_RUN_STATUSES } from '../lib/lesson-run-state.js'
import type { ActivitySpec, LessonDefinitionV1 } from '../lib/curriculum-lesson-schema.js'
import { ActivityAnswerError } from '../lib/curriculum-activity-scoring.js'
import { findSubjectPack } from '../lib/subject-packs.js'
import { acceptsAttempts, attemptLimit, scoreStudentAttempt, studentActivityView } from '../lib/lesson-live.js'
import { evidenceRowsForAttempt } from '../lib/lesson-evidence.js'
import type { AttemptRefusalCode } from '../lib/lesson-attempt-refusals.js'
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW, createVerifiedBodyRateLimit } from '../lib/rate-limit-policy.js'
import {
  LESSON_DEVICE_TTL_MS,
  MAX_RUN_DEVICES,
  deviceLiveness,
  generateDeviceToken,
  hashLaunchToken,
  hashSeatSecret,
  isLaunchToken,
  isLessonJoinCode,
  isSeatSecret,
  nextPairingNumber,
  verifyClassLinkKey,
  verifyDeviceToken,
} from '../lib/lesson-device.js'
import {
  LESSON_CLASS_LINK_IP_THROTTLE_SCOPE,
  LESSON_JOIN_CODE_IP_THROTTLE_SCOPE,
  LESSON_JOIN_CODE_THROTTLE_SCOPE,
  LESSON_LAUNCH_IP_THROTTLE_SCOPE,
  clearCodeThrottle,
  getCodeThrottleStatus,
  recordCodeFailure,
} from './code-throttle.js'

class JoinClosedError extends Error {}
class AttemptRefusedError extends Error {
  readonly code: AttemptRefusalCode
  constructor(code: AttemptRefusalCode, message: string) {
    super(message)
    this.code = code
  }
}

function findActivity(lesson: LessonDefinitionV1, instanceId: string): { activity: ActivitySpec; heading: unknown } | null {
  for (const block of lesson.blocks) {
    if (block.type === 'activity' && block.activity.instanceId === instanceId) {
      return { activity: block.activity, heading: block.content.heading ?? null }
    }
  }
  return null
}

/** The device a body proves it holds (id + genuine token), or null. No DB access. */
function verifiedDevice(body: unknown): string | null {
  const { deviceId, deviceToken } = (body ?? {}) as { deviceId?: unknown; deviceToken?: unknown }
  return typeof deviceId === 'string' && typeof deviceToken === 'string' && verifyDeviceToken(deviceId, deviceToken) ? deviceId : null
}

// A whole class shares one NAT address: device traffic is limited per verified
// device; anything unverified shares the IP bucket.
const deviceStateRateLimit = createVerifiedBodyRateLimit({
  scope: 'lesson-device-state', max: RATE_LIMIT_MAX.lessonDeviceState, resource: verifiedDevice,
})
const deviceAttemptRateLimit = createVerifiedBodyRateLimit({
  scope: 'lesson-device-attempt', max: RATE_LIMIT_MAX.lessonDeviceAttempt, resource: verifiedDevice,
})
const joinRateLimit = { max: RATE_LIMIT_MAX.lessonJoin, timeWindow: RATE_LIMIT_WINDOW }

const SEAT_PATTERN = '^[A-Za-z0-9_-]{43}$'
const LINK_INVALID_MESSAGE = 'Посилання класу більше не діє. Попроси вчителя нове.'

function seatHashOf(seat: string | undefined): string | null {
  return isSeatSecret(seat) ? hashSeatSecret(seat) : null
}

// Waiting laptops on a class link ask about every 15 s; a genuine link gets a
// bucket per class and seat, anything else shares the address bucket.
const classJoinRateLimit = createVerifiedBodyRateLimit({
  scope: 'lesson-class-join',
  max: RATE_LIMIT_MAX.lessonClassJoin,
  resource: body => {
    const { classId, version, key, seat } = (body ?? {}) as { classId?: unknown; version?: unknown; key?: unknown; seat?: unknown }
    if (!verifyClassLinkKey(classId, version, key)) return null
    return `${String(classId).toLowerCase()}:${isSeatSecret(seat) ? hashSeatSecret(seat).slice(0, 32) : 'no-seat'}`
  },
})

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

interface JoinOptions {
  /** Code joins must still match the run's current code under the lock. */
  requireJoinCode: string | null
  seatHash: string | null
  via: 'code' | 'class-link'
}

/**
 * The roster student to map a joining device to: the one remembered for this
 * browser's seat in this class, if they are in the run and no *other* seat
 * holds them. The same seat rejoining (a closed tab reopened) replaces its
 * previous device. Returns the student and the devices to retire.
 */
async function rememberedStudent(tx: Tx, runId: string, classId: string, seatHash: string | null) {
  if (!seatHash) return null
  const [seat] = await tx.select({ classStudentId: lessonClassSeats.classStudentId }).from(lessonClassSeats)
    .where(and(eq(lessonClassSeats.classId, classId), eq(lessonClassSeats.seatHash, seatHash))).limit(1)
  if (!seat) return null
  const [student] = await tx.select({ id: lessonRunStudents.id, joinedAt: lessonRunStudents.joinedAt }).from(lessonRunStudents)
    .where(and(eq(lessonRunStudents.lessonRunId, runId), eq(lessonRunStudents.classStudentId, seat.classStudentId))).limit(1)
  if (!student) return null
  const holders = await tx.select({ id: lessonRunDevices.id, seatHash: lessonRunDevices.seatHash }).from(lessonRunDevices)
    .where(and(eq(lessonRunDevices.lessonRunStudentId, student.id), isNull(lessonRunDevices.revokedAt)))
  // Another browser already speaks for this child: the teacher decides.
  if (holders.some(h => h.seatHash !== seatHash)) return null
  return { student, replace: holders.map(h => h.id) }
}

async function joinRunAsDevice(runId: string, options: JoinOptions) {
  return db.transaction(async tx => {
    // Lock the run so concurrent joins take distinct pairing numbers.
    const [locked] = await tx.select({ status: lessonRuns.status, joinCode: lessonRuns.joinCode, classId: lessonRuns.classId })
      .from(lessonRuns).where(eq(lessonRuns.id, runId)).limit(1).for('update')
    if (!locked || !OPEN_RUN_STATUSES.includes(locked.status)) throw new JoinClosedError()
    if (options.requireJoinCode !== null && locked.joinCode !== options.requireJoinCode) throw new JoinClosedError()
    const existing = await tx.select({ n: lessonRunDevices.pairingNumber }).from(lessonRunDevices)
      .where(eq(lessonRunDevices.lessonRunId, runId))
    if (existing.length >= MAX_RUN_DEVICES) throw new JoinClosedError('full')

    // A seat the teacher disconnected in this lesson does not come back by
    // itself through the class link (a code join remains the teacher's call).
    if (options.via === 'class-link' && options.seatHash) {
      const [revokedByTeacher] = await tx.select({ id: lessonRunDevices.id }).from(lessonRunDevices)
        .innerJoin(lessonRunEvents, and(
          eq(lessonRunEvents.lessonRunId, runId),
          eq(lessonRunEvents.type, 'device_revoked'),
          eq(lessonRunEvents.actorType, 'teacher'),
          sql`${lessonRunEvents.payload}->>'deviceId' = ${lessonRunDevices.id}::text`,
        ))
        .where(and(eq(lessonRunDevices.lessonRunId, runId), eq(lessonRunDevices.seatHash, options.seatHash))).limit(1)
      if (revokedByTeacher) throw new JoinClosedError('revoked')
    }
    const remembered = await rememberedStudent(tx, runId, locked.classId, options.seatHash)
    if (remembered && remembered.replace.length > 0) {
      await tx.update(lessonRunDevices).set({ revokedAt: new Date(), lessonRunStudentId: null })
        .where(inArray(lessonRunDevices.id, remembered.replace))
      await tx.insert(lessonRunEvents).values(remembered.replace.map(deviceId => ({
        lessonRunId: runId, type: 'device_revoked' as const, actorType: 'system' as const, payload: { deviceId, reason: 'same-seat-rejoined' },
      })))
    }
    const [row] = await tx.insert(lessonRunDevices).values({
      lessonRunId: runId,
      pairingNumber: nextPairingNumber(existing.map(e => e.n)),
      expiresAt: new Date(Date.now() + LESSON_DEVICE_TTL_MS),
      seatHash: options.seatHash,
      lessonRunStudentId: remembered?.student.id ?? null,
    }).returning()
    await tx.insert(lessonRunEvents).values({
      lessonRunId: runId, type: 'device_joined', actorType: 'device', actorId: row!.id,
      payload: { pairingNumber: row!.pairingNumber, via: options.via },
    })
    if (remembered) {
      await tx.update(lessonRunStudents).set({ status: 'joined', joinedAt: remembered.student.joinedAt ?? new Date() })
        .where(eq(lessonRunStudents.id, remembered.student.id))
      await tx.insert(lessonRunEvents).values({
        lessonRunId: runId, type: 'device_mapped', actorType: 'system',
        payload: { deviceId: row!.id, lessonRunStudentId: remembered.student.id, reason: 'remembered-seat' },
      })
    }
    return row!
  })
}

async function sendJoin(reply: FastifyReply, runId: string, options: JoinOptions) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const device = await joinRunAsDevice(runId, options)
      return reply.code(201).send({
        deviceId: device.id,
        deviceToken: generateDeviceToken(device.id),
        pairingNumber: device.pairingNumber,
        expiresAt: device.expiresAt,
      })
    } catch (err) {
      if (isUniqueViolation(err)) continue
      if (err instanceof JoinClosedError) {
        if (err.message === 'revoked') {
          return reply.code(409).send({ error: 'Учитель відключив цей пристрій від уроку.', code: 'DEVICE_REVOKED' })
        }
        return reply.code(409).send({
          error: err.message === 'full' ? 'До уроку вже приєдналося забагато пристроїв.' : 'Приєднання до уроку закрито.',
        })
      }
      throw err
    }
  }
  return reply.code(503).send({ error: 'Спробуй ще раз.' })
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
  // POST /api/student/lesson/join — code → anonymous device (auto-mapped when
  // the browser's seat is remembered for this class)
  app.post<{ Body: { code: string; seat?: string } }>('/join', {
    config: { rateLimit: joinRateLimit },
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6 },
          seat: { type: 'string', pattern: SEAT_PATTERN },
        },
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
    return sendJoin(reply, run.id, { requireJoinCode: code, seatHash: seatHashOf(req.body.seat), via: 'code' })
  })

  // POST /api/student/lesson/join-class — the class link (saved once, e.g. in
  // Classroom Remote) joins whatever lesson the class has open. No lesson open
  // yet is a normal state: the device waits and asks again.
  app.post<{ Body: { classId: string; version: number; key: string; seat?: string } }>('/join-class', {
    config: { rateLimit: classJoinRateLimit },
    schema: {
      body: {
        type: 'object',
        required: ['classId', 'version', 'key'],
        additionalProperties: false,
        properties: {
          classId: { type: 'string', format: 'uuid' },
          version: { type: 'integer', minimum: 1, maximum: 1_000_000 },
          key: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
          seat: { type: 'string', pattern: SEAT_PATTERN },
        },
      },
    },
  }, async (req, reply) => {
    const { classId, version, key } = req.body
    const throttle = getCodeThrottleStatus(LESSON_CLASS_LINK_IP_THROTTLE_SCOPE, req.ip)
    if (!throttle.allowed) {
      return reply.code(429).header('Retry-After', String(throttle.retryAfterSeconds))
        .send({ error: 'Забагато невдалих спроб. Спробуй трохи пізніше.' })
    }
    // A forged key is refused before any database access.
    if (!verifyClassLinkKey(classId, version, key)) {
      recordCodeFailure(LESSON_CLASS_LINK_IP_THROTTLE_SCOPE, req.ip)
      return reply.code(404).send({ error: LINK_INVALID_MESSAGE, code: 'LINK_INVALID' })
    }
    const [link] = await db.select({ linkVersion: lessonClassLinks.linkVersion, enabled: lessonClassLinks.enabled })
      .from(lessonClassLinks).where(eq(lessonClassLinks.classId, classId)).limit(1)
    // A genuine but rotated or switched-off link: the teacher's decision, not an attack.
    if (!link || !link.enabled || link.linkVersion !== version) {
      return reply.code(404).send({ error: LINK_INVALID_MESSAGE, code: 'LINK_INVALID' })
    }
    const [run] = await db.select({ id: lessonRuns.id }).from(lessonRuns)
      .where(and(eq(lessonRuns.classId, classId), inArray(lessonRuns.status, [...OPEN_RUN_STATUSES])))
      .orderBy(desc(lessonRuns.createdAt)).limit(1)
    if (!run) return reply.code(409).send({ error: 'Урок ще не почався. Зачекай.', code: 'NO_OPEN_RUN' })
    return sendJoin(reply, run.id, { requireJoinCode: null, seatHash: seatHashOf(req.body.seat), via: 'class-link' })
  })

  // POST /api/student/lesson/state — who am I, and what is the lesson doing?
  app.post<{ Body: { deviceId: string; deviceToken: string } }>('/state', {
    config: { rateLimit: deviceStateRateLimit },
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
    config: { rateLimit: deviceAttemptRateLimit },
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
        if (!studentId) throw new AttemptRefusedError('NOT_MAPPED', 'Зачекай, поки вчитель тебе призначить.')
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

        if (row.runStatus === 'finished' || row.runStatus === 'cancelled') throw new AttemptRefusedError('RUN_CLOSED', 'Урок уже завершено.')
        if (row.runStatus !== 'active') throw new AttemptRefusedError('RUN_NOT_ACTIVE', 'Зараз урок на паузі.')
        const [dispatch] = await tx.select().from(lessonRunDispatches).where(and(
          eq(lessonRunDispatches.id, dispatchId), eq(lessonRunDispatches.lessonRunId, row.device.lessonRunId),
        )).limit(1)
        if (!dispatch || dispatch.closedAt) throw new AttemptRefusedError('DISPATCH_CLOSED', 'Це завдання вже закрите.')
        const found = findActivity(lesson, dispatch.activityInstanceId)
        if (!found || !acceptsAttempts(found.activity)) throw new AttemptRefusedError('NOT_ACCEPTING', 'Це завдання не приймає відповідей.')

        const used = await tx.select({ n: activityAttempts.attemptNo }).from(activityAttempts).where(and(
          eq(activityAttempts.dispatchId, dispatch.id), eq(activityAttempts.lessonRunStudentId, studentId),
        ))
        const limit = attemptLimit(found.activity)
        if (used.length >= limit) throw new AttemptRefusedError('NO_ATTEMPTS_LEFT', 'Спроби вже використано.')

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
      if (err instanceof AttemptRefusedError) return reply.code(409).send({ error: err.message, code: err.code })
      if (err instanceof ActivityAnswerError) return reply.code(400).send({ error: err.message })
      if (isUniqueViolation(err)) return reply.code(409).send({ error: 'Спробуй ще раз.', code: 'RETRY' satisfies AttemptRefusalCode })
      throw err
    }
  })

  // POST /api/student/lesson/launch — exchange a single-use launch token (from
  // a lab computer opened by the teacher) for the pre-mapped device.
  app.post<{ Body: { launchToken: string } }>('/launch', {
    config: { rateLimit: joinRateLimit },
    schema: {
      body: {
        type: 'object',
        required: ['launchToken'],
        additionalProperties: false,
        properties: { launchToken: { type: 'string', minLength: 43, maxLength: 43 } },
      },
    },
  }, async (req, reply) => {
    const { launchToken } = req.body
    if (!isLaunchToken(launchToken)) return reply.code(400).send({ error: 'Посилання пошкоджене.' })
    const throttle = getCodeThrottleStatus(LESSON_LAUNCH_IP_THROTTLE_SCOPE, req.ip)
    if (!throttle.allowed) {
      return reply.code(429).header('Retry-After', String(throttle.retryAfterSeconds))
        .send({ error: 'Забагато невдалих спроб. Спробуй трохи пізніше.' })
    }
    const device = await db.transaction(async tx => {
      const [row] = await tx.select({ device: lessonRunDevices, runStatus: lessonRuns.status })
        .from(lessonRunDevices)
        .innerJoin(lessonRuns, eq(lessonRuns.id, lessonRunDevices.lessonRunId))
        .where(eq(lessonRunDevices.launchTokenHash, hashLaunchToken(launchToken))).limit(1)
        .for('update', { of: lessonRunDevices })
      const now = new Date()
      if (!row || row.device.launchedAt || !row.device.launchExpiresAt || row.device.launchExpiresAt <= now
        || deviceLiveness(row.device, now) !== 'live' || !OPEN_RUN_STATUSES.includes(row.runStatus)) {
        return null
      }
      await tx.update(lessonRunDevices).set({ launchedAt: now }).where(eq(lessonRunDevices.id, row.device.id))
      return row.device
    })
    if (!device) {
      recordCodeFailure(LESSON_LAUNCH_IP_THROTTLE_SCOPE, req.ip)
      return reply.code(410).send({ error: 'Це посилання вже використане або застаріло. Попроси вчителя відкрити урок ще раз.' })
    }
    return reply.code(201).send({
      deviceId: device.id,
      deviceToken: generateDeviceToken(device.id),
      pairingNumber: device.pairingNumber,
      expiresAt: device.expiresAt,
    })
  })
}
