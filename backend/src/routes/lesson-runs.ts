// Lesson Engine runs API (stage F): a teacher prepares a published lesson for
// one of their classes, then conducts it — start, step, pause, resume, finish
// or cancel. The run freezes the published snapshot, so edits never reach a
// run in progress. Every route is owner-scoped: another teacher's run is
// indistinguishable from a missing one. Dark unless LESSON_ENGINE_ENABLED.

import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  classStudents,
  curriculumLessons,
  activityAttempts,
  deviceAssignments,
  lessonClassSeats,
  lessonRunDevices,
  lessonRunDispatches,
  lessonRunEvents,
  lessonRunStudents,
  lessonRuns,
  studentOutcomeEvidence,
  teacherClasses,
  type LessonRunRow,
} from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { toDisplaySafeLesson, type LessonDefinitionV1 } from '../lib/curriculum-lesson-schema.js'
import {
  LESSON_RUN_ACTIONS,
  LessonRunStateError,
  OPEN_RUN_STATUSES,
  applyRunAction,
  resolveStep,
  runActionTimestamps,
  runSteps,
  type LessonRunAction,
} from '../lib/lesson-run-state.js'
import { CURRICULUM_LESSON_ID_PATTERN } from './curriculum-editorial.js'
import {
  LESSON_DEVICE_TTL_MS,
  LESSON_JOIN_CODE_TTL_MS,
  LESSON_LAUNCH_TTL_MS,
  MAX_RUN_DEVICES,
  REMOTE_DEVICE_ID_PATTERN,
  generateLaunchToken,
  generateLessonJoinCode,
  nextPairingNumber,
} from '../lib/lesson-device.js'
import { randomUUID } from 'node:crypto'
import { isDispatchable, liveSnapshot } from '../lib/lesson-live.js'
import { lessonReport } from '../lib/lesson-evidence.js'
import { findSubjectPack } from '../lib/subject-packs.js'
import { resolveSubjectPack } from '../lib/curriculum-outcomes.js'
import type { ActivitySpec } from '../lib/curriculum-lesson-schema.js'

class RunNotFoundError extends Error {}
class DeviceNotFoundError extends Error {
  constructor(message = 'Пристрій не знайдено') { super(message) }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Locks the teacher's own open run, or throws. Devices are managed only while it is open. */
async function lockOpenRun(tx: Tx, runId: string, teacherId: string) {
  const [run] = await tx.select({ id: lessonRuns.id, status: lessonRuns.status, classId: lessonRuns.classId }).from(lessonRuns)
    .where(and(eq(lessonRuns.id, runId), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
  if (!run) throw new RunNotFoundError()
  if (!OPEN_RUN_STATUSES.includes(run.status)) throw new LessonRunStateError('Урок завершено: пристрої вже не змінюються')
  return run
}

const runIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

const deviceParams = {
  type: 'object',
  required: ['id', 'deviceId'],
  properties: { id: { type: 'string', format: 'uuid' }, deviceId: { type: 'string', format: 'uuid' } },
} as const

export interface LessonRunStudentView {
  id: string
  classStudentId: string | null
  /** The teacher's own roster label; null once the student was deleted. */
  label: string | null
  status: string
}

/** Run as the teacher sees it: state plus the display-safe frozen lesson. */
export function lessonRunView(run: LessonRunRow, className: string, students: LessonRunStudentView[]) {
  const lesson = run.lessonSnapshot as unknown as LessonDefinitionV1
  return {
    run: {
      id: run.id,
      status: run.status,
      classId: run.classId,
      className,
      lessonId: run.lessonId,
      lessonPublishedVersion: run.lessonPublishedVersion,
      currentStepIndex: run.currentStepIndex,
      currentBlockId: run.currentBlockId,
      steps: runSteps(lesson),
      joinCode: run.joinCode,
      joinCodeExpiresAt: run.joinCodeExpiresAt,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      pausedAt: run.pausedAt,
      finishedAt: run.finishedAt,
      cancelledAt: run.cancelledAt,
    },
    lesson: toDisplaySafeLesson(lesson),
    students,
  }
}

async function loadRunView(runId: string, teacherId: string) {
  const [row] = await db.select({ run: lessonRuns, className: teacherClasses.name })
    .from(lessonRuns)
    .innerJoin(teacherClasses, eq(teacherClasses.id, lessonRuns.classId))
    .where(and(eq(lessonRuns.id, runId), eq(lessonRuns.teacherId, teacherId)))
    .limit(1)
  if (!row) return null
  const students = await db.select({
    id: lessonRunStudents.id,
    classStudentId: lessonRunStudents.classStudentId,
    label: classStudents.label,
    status: lessonRunStudents.status,
  })
    .from(lessonRunStudents)
    .leftJoin(classStudents, eq(classStudents.id, lessonRunStudents.classStudentId))
    .where(eq(lessonRunStudents.lessonRunId, runId))
    .orderBy(asc(lessonRunStudents.createdAt))
  return lessonRunView(row.run, row.className, students.map(s => ({ ...s, label: s.label ?? null })))
}

async function loadLive(runId: string, teacherId: string) {
  const [run] = await db.select({ id: lessonRuns.id, lessonSnapshot: lessonRuns.lessonSnapshot }).from(lessonRuns)
    .where(and(eq(lessonRuns.id, runId), eq(lessonRuns.teacherId, teacherId))).limit(1)
  if (!run) return null
  const [dispatches, students, devices, attempts] = await Promise.all([
    db.select({
      id: lessonRunDispatches.id,
      blockId: lessonRunDispatches.blockId,
      activityInstanceId: lessonRunDispatches.activityInstanceId,
      openedAt: lessonRunDispatches.openedAt,
      closedAt: lessonRunDispatches.closedAt,
    }).from(lessonRunDispatches).where(eq(lessonRunDispatches.lessonRunId, runId)).orderBy(asc(lessonRunDispatches.openedAt)),
    db.select({ id: lessonRunStudents.id, label: classStudents.label }).from(lessonRunStudents)
      .leftJoin(classStudents, eq(classStudents.id, lessonRunStudents.classStudentId))
      .where(eq(lessonRunStudents.lessonRunId, runId)).orderBy(asc(lessonRunStudents.createdAt)),
    db.select({ lessonRunStudentId: lessonRunDevices.lessonRunStudentId, lastSeenAt: lessonRunDevices.lastSeenAt })
      .from(lessonRunDevices).where(and(eq(lessonRunDevices.lessonRunId, runId), isNull(lessonRunDevices.revokedAt))),
    db.select({
      dispatchId: activityAttempts.dispatchId,
      lessonRunStudentId: activityAttempts.lessonRunStudentId,
      attemptNo: activityAttempts.attemptNo,
      normalizedScore: activityAttempts.normalizedScore,
      correct: activityAttempts.correct,
      total: activityAttempts.total,
      answerPayload: activityAttempts.answerPayload,
    }).from(activityAttempts).where(eq(activityAttempts.lessonRunId, runId)),
  ])
  const lesson = run.lessonSnapshot as unknown as LessonDefinitionV1
  const activities = new Map<string, ActivitySpec>()
  for (const block of lesson.blocks) if (block.type === 'activity') activities.set(block.activity.instanceId, block.activity)
  return liveSnapshot({
    activities,
    dispatches,
    students: students.map(student => ({ id: student.id, label: student.label ?? null })),
    devices,
    attempts: attempts.map(a => ({ ...a, normalizedScore: Number(a.normalizedScore) })),
    now: new Date(),
  })
}

function sendRunError(reply: FastifyReply, err: unknown) {
  if (err instanceof RunNotFoundError) return reply.code(404).send({ error: 'Урок не знайдено' })
  if (err instanceof LessonRunStateError) return reply.code(409).send({ error: err.message })
  throw err
}

export async function lessonRunRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', requireAuth)

  // GET /api/teacher/lesson-runs — the teacher's open runs, then the latest closed ones
  app.get('/', async (req, reply) => {
    const rows = await db.select({
      id: lessonRuns.id,
      status: lessonRuns.status,
      classId: lessonRuns.classId,
      className: teacherClasses.name,
      lessonId: lessonRuns.lessonId,
      lessonSnapshot: lessonRuns.lessonSnapshot,
      currentStepIndex: lessonRuns.currentStepIndex,
      createdAt: lessonRuns.createdAt,
    })
      .from(lessonRuns)
      .innerJoin(teacherClasses, eq(teacherClasses.id, lessonRuns.classId))
      .where(eq(lessonRuns.teacherId, req.user!.id))
      .orderBy(desc(lessonRuns.createdAt))
      .limit(30)
    const runs = rows.map(({ lessonSnapshot, ...row }) => {
      const lesson = lessonSnapshot as unknown as LessonDefinitionV1
      return { ...row, lessonTitle: lesson.title, stepCount: runSteps(lesson).length }
    })
    return reply.send({ runs })
  })

  // POST /api/teacher/lesson-runs — prepare a run of a published lesson for an own class
  app.post<{ Body: { classId: string; lessonId: string } }>('/', {
    schema: {
      body: {
        type: 'object',
        required: ['classId', 'lessonId'],
        properties: {
          classId: { type: 'string', format: 'uuid' },
          lessonId: { type: 'string', maxLength: 64, pattern: CURRICULUM_LESSON_ID_PATTERN },
        },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { classId, lessonId } = req.body
    const [cls] = await db.select({ id: teacherClasses.id }).from(teacherClasses)
      .where(and(eq(teacherClasses.id, classId), eq(teacherClasses.teacherId, teacherId))).limit(1)
    if (!cls) return reply.code(404).send({ error: 'Клас не знайдено' })

    const [lesson] = await db.select({
      publishedVersion: curriculumLessons.publishedVersion,
      publishedSnapshot: curriculumLessons.publishedSnapshot,
    }).from(curriculumLessons).where(and(
      eq(curriculumLessons.id, lessonId),
      isNotNull(curriculumLessons.publishedVersion),
      ne(curriculumLessons.status, 'archived'),
    )).limit(1)
    if (!lesson) return reply.code(404).send({ error: 'Урок не знайдено' })

    const steps = runSteps(lesson.publishedSnapshot as unknown as LessonDefinitionV1)
    if (steps.length === 0) return reply.code(409).send({ error: 'В уроці немає кроків' })

    try {
      const runId = await db.transaction(async tx => {
        const [run] = await tx.insert(lessonRuns).values({
          teacherId,
          classId,
          lessonId,
          lessonPublishedVersion: lesson.publishedVersion!,
          lessonSnapshot: lesson.publishedSnapshot!,
          currentBlockId: steps[0]!,
        }).returning({ id: lessonRuns.id })
        const roster = await tx.select({ id: classStudents.id }).from(classStudents)
          .where(eq(classStudents.classId, classId)).orderBy(asc(classStudents.createdAt))
        if (roster.length > 0) {
          await tx.insert(lessonRunStudents).values(roster.map(student => ({ lessonRunId: run!.id, classStudentId: student.id })))
        }
        await tx.insert(lessonRunEvents).values({
          lessonRunId: run!.id, type: 'run_created', actorType: 'teacher', actorId: teacherId,
          payload: { lessonPublishedVersion: lesson.publishedVersion },
        })
        return run!.id
      })
      return reply.code(201).send(await loadRunView(runId, teacherId))
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const [open] = await db.select({ id: lessonRuns.id }).from(lessonRuns)
        .where(and(eq(lessonRuns.classId, classId), inArray(lessonRuns.status, [...OPEN_RUN_STATUSES]))).limit(1)
      return reply.code(409).send({ error: 'У цього класу вже є незавершений урок', runId: open?.id ?? null })
    }
  })

  // GET /api/teacher/lesson-runs/:id — full state; used to resume after a reload
  app.get<{ Params: { id: string } }>('/:id', { schema: { params: runIdParams } }, async (req, reply) => {
    const view = await loadRunView(req.params.id, req.user!.id)
    if (!view) return reply.code(404).send({ error: 'Урок не знайдено' })
    return reply.send(view)
  })

  // POST /api/teacher/lesson-runs/:id/:action — start | pause | resume | finish | cancel
  app.post<{ Params: { id: string; action: LessonRunAction } }>('/:id/:action', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          action: { type: 'string', enum: [...LESSON_RUN_ACTIONS] },
        },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id, action } = req.params
    try {
      await db.transaction(async tx => {
        const [run] = await tx.select().from(lessonRuns)
          .where(and(eq(lessonRuns.id, id), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
        if (!run) throw new RunNotFoundError()
        const next = applyRunAction(run.status, action)
        const now = new Date()
        // A closed run stops accepting joins in the same write (DB-checked).
        const closing = next.status === 'finished' || next.status === 'cancelled'
        await tx.update(lessonRuns).set({
          status: next.status,
          ...runActionTimestamps(action, now),
          ...(closing ? { joinCode: null, joinCodeExpiresAt: null } : {}),
          updatedAt: now,
        }).where(eq(lessonRuns.id, id))
        if (closing) {
          await tx.update(lessonRunDispatches).set({ closedAt: now })
            .where(and(eq(lessonRunDispatches.lessonRunId, id), isNull(lessonRunDispatches.closedAt)))
        }
        await tx.insert(lessonRunEvents).values({
          lessonRunId: id, type: next.event, blockId: run.currentBlockId, actorType: 'teacher', actorId: teacherId,
        })
      })
      return reply.send(await loadRunView(id, teacherId))
    } catch (err) {
      return sendRunError(reply, err)
    }
  })

  // PUT /api/teacher/lesson-runs/:id/step — move to a step (allowed while live or paused)
  app.put<{ Params: { id: string }; Body: { stepIndex: number } }>('/:id/step', {
    schema: {
      params: runIdParams,
      body: {
        type: 'object',
        required: ['stepIndex'],
        properties: { stepIndex: { type: 'integer', minimum: 0, maximum: 999 } },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id } = req.params
    try {
      await db.transaction(async tx => {
        const [run] = await tx.select().from(lessonRuns)
          .where(and(eq(lessonRuns.id, id), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
        if (!run) throw new RunNotFoundError()
        const blockId = resolveStep(run.lessonSnapshot as unknown as LessonDefinitionV1, run.status, req.body.stepIndex)
        if (run.currentStepIndex === req.body.stepIndex) return
        await tx.update(lessonRuns)
          .set({ currentStepIndex: req.body.stepIndex, currentBlockId: blockId, updatedAt: new Date() })
          .where(eq(lessonRuns.id, id))
        await tx.insert(lessonRunEvents).values({
          lessonRunId: id, type: 'block_opened', blockId, actorType: 'teacher', actorId: teacherId,
        })
      })
      return reply.send(await loadRunView(id, teacherId))
    } catch (err) {
      return sendRunError(reply, err)
    }
  })

  // ── Web join (stage G1) ──────────────────────────────────────────────────

  // POST /api/teacher/lesson-runs/:id/join-code — open (or rotate) joining.
  // Rotating only stops new joins with the old code; joined devices stay.
  app.post<{ Params: { id: string } }>('/:id/join-code', { schema: { params: runIdParams } }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id } = req.params
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await db.transaction(async tx => {
          const [run] = await tx.select({ status: lessonRuns.status }).from(lessonRuns)
            .where(and(eq(lessonRuns.id, id), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
          if (!run) throw new RunNotFoundError()
          if (!OPEN_RUN_STATUSES.includes(run.status)) throw new LessonRunStateError('Урок завершено: приєднатися вже не можна')
          const joinCode = generateLessonJoinCode()
          const joinCodeExpiresAt = new Date(Date.now() + LESSON_JOIN_CODE_TTL_MS)
          await tx.update(lessonRuns).set({ joinCode, joinCodeExpiresAt, updatedAt: new Date() }).where(eq(lessonRuns.id, id))
          await tx.insert(lessonRunEvents).values({ lessonRunId: id, type: 'join_opened', actorType: 'teacher', actorId: teacherId })
          return { joinCode, joinCodeExpiresAt }
        })
        return reply.send(result)
      } catch (err) {
        if (isUniqueViolation(err)) continue
        return sendRunError(reply, err)
      }
    }
    return reply.code(503).send({ error: 'Не вдалося створити код. Спробуйте ще раз.' })
  })

  // DELETE /api/teacher/lesson-runs/:id/join-code — stop new joins
  app.delete<{ Params: { id: string } }>('/:id/join-code', { schema: { params: runIdParams } }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id } = req.params
    try {
      await db.transaction(async tx => {
        const [run] = await tx.select({ joinCode: lessonRuns.joinCode }).from(lessonRuns)
          .where(and(eq(lessonRuns.id, id), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
        if (!run) throw new RunNotFoundError()
        if (!run.joinCode) return
        await tx.update(lessonRuns).set({ joinCode: null, joinCodeExpiresAt: null, updatedAt: new Date() }).where(eq(lessonRuns.id, id))
        await tx.insert(lessonRunEvents).values({ lessonRunId: id, type: 'join_closed', actorType: 'teacher', actorId: teacherId })
      })
      return reply.code(204).send()
    } catch (err) {
      return sendRunError(reply, err)
    }
  })

  // GET /api/teacher/lesson-runs/:id/devices — live devices and their mapping
  app.get<{ Params: { id: string } }>('/:id/devices', { schema: { params: runIdParams } }, async (req, reply) => {
    const [run] = await db.select({ id: lessonRuns.id }).from(lessonRuns)
      .where(and(eq(lessonRuns.id, req.params.id), eq(lessonRuns.teacherId, req.user!.id))).limit(1)
    if (!run) return reply.code(404).send({ error: 'Урок не знайдено' })
    const devices = await db.select({
      id: lessonRunDevices.id,
      pairingNumber: lessonRunDevices.pairingNumber,
      lessonRunStudentId: lessonRunDevices.lessonRunStudentId,
      lastSeenAt: lessonRunDevices.lastSeenAt,
      createdAt: lessonRunDevices.createdAt,
    }).from(lessonRunDevices)
      .where(and(eq(lessonRunDevices.lessonRunId, run.id), isNull(lessonRunDevices.revokedAt)))
      .orderBy(asc(lessonRunDevices.pairingNumber))
    return reply.send({ devices })
  })

  // PUT /api/teacher/lesson-runs/:id/devices/:deviceId — map a device to a roster
  // student (null unmaps). A student already on another device moves here.
  app.put<{ Params: { id: string; deviceId: string }; Body: { lessonRunStudentId: string | null } }>('/:id/devices/:deviceId', {
    schema: {
      params: deviceParams,
      body: {
        type: 'object',
        required: ['lessonRunStudentId'],
        properties: { lessonRunStudentId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] } },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id, deviceId } = req.params
    const studentId = req.body.lessonRunStudentId
    try {
      await db.transaction(async tx => {
        const run = await lockOpenRun(tx, id, teacherId)
        const [device] = await tx.select().from(lessonRunDevices)
          .where(and(eq(lessonRunDevices.id, deviceId), eq(lessonRunDevices.lessonRunId, run.id), isNull(lessonRunDevices.revokedAt)))
          .limit(1).for('update')
        if (!device) throw new DeviceNotFoundError()
        if (studentId === null) {
          if (device.lessonRunStudentId === null) return
          await tx.update(lessonRunDevices).set({ lessonRunStudentId: null, assignmentVersion: sql`${lessonRunDevices.assignmentVersion} + 1` }).where(eq(lessonRunDevices.id, deviceId))
          // An unmapped seat is forgotten, so it is not auto-mapped next lesson.
          if (device.seatHash) {
            await tx.delete(lessonClassSeats).where(and(eq(lessonClassSeats.classId, run.classId), eq(lessonClassSeats.seatHash, device.seatHash)))
          }
          await tx.insert(lessonRunEvents).values({
            lessonRunId: id, type: 'device_unmapped', actorType: 'teacher', actorId: teacherId, payload: { deviceId },
          })
          return
        }
        const [student] = await tx.select({
          id: lessonRunStudents.id, joinedAt: lessonRunStudents.joinedAt, classStudentId: lessonRunStudents.classStudentId,
        })
          .from(lessonRunStudents)
          .where(and(eq(lessonRunStudents.id, studentId), eq(lessonRunStudents.lessonRunId, run.id), isNotNull(lessonRunStudents.classStudentId)))
          .limit(1)
        if (!student) throw new DeviceNotFoundError('Учня не знайдено в цьому уроці')
        if (device.lessonRunStudentId === student.id) return
        // Free the student's previous device first (one live device per student).
        await tx.update(lessonRunDevices).set({ lessonRunStudentId: null, assignmentVersion: sql`${lessonRunDevices.assignmentVersion} + 1` }).where(and(
          eq(lessonRunDevices.lessonRunStudentId, student.id), isNull(lessonRunDevices.revokedAt),
        ))
        await tx.update(lessonRunDevices).set({ lessonRunStudentId: student.id, assignmentVersion: sql`${lessonRunDevices.assignmentVersion} + 1` }).where(eq(lessonRunDevices.id, deviceId))
        await tx.update(lessonRunStudents).set({ status: 'joined', joinedAt: student.joinedAt ?? new Date() })
          .where(eq(lessonRunStudents.id, student.id))
        // Remember the seat: one seat per student and one student per seat in this class.
        if (device.seatHash && student.classStudentId) {
          await tx.delete(lessonClassSeats).where(and(
            eq(lessonClassSeats.classId, run.classId),
            or(eq(lessonClassSeats.seatHash, device.seatHash), eq(lessonClassSeats.classStudentId, student.classStudentId)),
          ))
          await tx.insert(lessonClassSeats).values({ classId: run.classId, seatHash: device.seatHash, classStudentId: student.classStudentId })
        }
        await tx.insert(lessonRunEvents).values({
          lessonRunId: id, type: 'device_mapped', actorType: 'teacher', actorId: teacherId,
          payload: { deviceId, lessonRunStudentId: student.id },
        })
      })
      return reply.send({ ok: true })
    } catch (err) {
      if (err instanceof DeviceNotFoundError) return reply.code(404).send({ error: err.message })
      return sendRunError(reply, err)
    }
  })

  // DELETE /api/teacher/lesson-runs/:id/devices/:deviceId — revoke: the token stops working
  app.delete<{ Params: { id: string; deviceId: string } }>('/:id/devices/:deviceId', { schema: { params: deviceParams } }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id, deviceId } = req.params
    try {
      await db.transaction(async tx => {
        const run = await lockOpenRun(tx, id, teacherId)
        const [revoked] = await tx.update(lessonRunDevices)
          .set({ revokedAt: new Date(), lessonRunStudentId: null })
          .where(and(eq(lessonRunDevices.id, deviceId), eq(lessonRunDevices.lessonRunId, run.id), isNull(lessonRunDevices.revokedAt)))
          .returning({ id: lessonRunDevices.id })
        if (!revoked) throw new DeviceNotFoundError()
        await tx.insert(lessonRunEvents).values({
          lessonRunId: id, type: 'device_revoked', actorType: 'teacher', actorId: teacherId, payload: { deviceId },
        })
      })
      return reply.code(204).send()
    } catch (err) {
      if (err instanceof DeviceNotFoundError) return reply.code(404).send({ error: err.message })
      return sendRunError(reply, err)
    }
  })

  // ── Activities on devices + live class state (stage G2) ──────────────────

  // POST /api/teacher/lesson-runs/:id/dispatch — open an activity on the class's
  // devices (closing any other). Only while the lesson is live, not paused.
  app.post<{ Params: { id: string }; Body: { blockId: string } }>('/:id/dispatch', {
    schema: {
      params: runIdParams,
      body: {
        type: 'object',
        required: ['blockId'],
        properties: { blockId: { type: 'string', maxLength: 80, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' } },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id } = req.params
    try {
      await db.transaction(async tx => {
        const [run] = await tx.select({ status: lessonRuns.status, lessonSnapshot: lessonRuns.lessonSnapshot }).from(lessonRuns)
          .where(and(eq(lessonRuns.id, id), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
        if (!run) throw new RunNotFoundError()
        if (run.status !== 'active') throw new LessonRunStateError('Надсилати завдання можна лише під час уроку (не на паузі)')
        const block = (run.lessonSnapshot as unknown as LessonDefinitionV1).blocks.find(b => b.id === req.body.blockId)
        if (!block || block.type !== 'activity' || !block.views.remote || !isDispatchable(block.activity)) {
          throw new LessonRunStateError('Цей крок не можна надіслати учням')
        }
        const now = new Date()
        await tx.update(lessonRunDispatches).set({ closedAt: now })
          .where(and(eq(lessonRunDispatches.lessonRunId, id), isNull(lessonRunDispatches.closedAt)))
        const [dispatch] = await tx.insert(lessonRunDispatches).values({
          lessonRunId: id, blockId: block.id, activityInstanceId: block.activity.instanceId, openedBy: teacherId,
        }).returning({ id: lessonRunDispatches.id })
        await tx.insert(lessonRunEvents).values({
          lessonRunId: id, type: 'activity_dispatched', blockId: block.id, actorType: 'teacher', actorId: teacherId,
          payload: { dispatchId: dispatch!.id, activityInstanceId: block.activity.instanceId },
        })
      })
      return reply.send(await loadLive(id, teacherId))
    } catch (err) {
      return sendRunError(reply, err)
    }
  })

  // POST /api/teacher/lesson-runs/:id/dispatch/close — take the activity off the devices
  app.post<{ Params: { id: string } }>('/:id/dispatch/close', { schema: { params: runIdParams } }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id } = req.params
    try {
      await db.transaction(async tx => {
        await lockOpenRun(tx, id, teacherId)
        const closed = await tx.update(lessonRunDispatches).set({ closedAt: new Date() })
          .where(and(eq(lessonRunDispatches.lessonRunId, id), isNull(lessonRunDispatches.closedAt)))
          .returning({ id: lessonRunDispatches.id, blockId: lessonRunDispatches.blockId })
        if (closed[0]) {
          await tx.insert(lessonRunEvents).values({
            lessonRunId: id, type: 'activity_closed', blockId: closed[0].blockId, actorType: 'teacher', actorId: teacherId,
            payload: { dispatchId: closed[0].id },
          })
        }
      })
      return reply.send(await loadLive(id, teacherId))
    } catch (err) {
      return sendRunError(reply, err)
    }
  })

  // GET /api/teacher/lesson-runs/:id/live — class grid, polled by the console
  app.get<{ Params: { id: string } }>('/:id/live', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: { params: runIdParams },
  }, async (req, reply) => {
    const live = await loadLive(req.params.id, req.user!.id)
    if (!live) return reply.code(404).send({ error: 'Урок не знайдено' })
    return reply.send(live)
  })

  // ── Evidence report (stage H) ────────────────────────────────────────────

  // GET /api/teacher/lesson-runs/:id/report — per student: activities, outcome
  // summaries by the written rule, the evidence trace behind each, and a
  // factual comment draft. Available from start; final once the run finishes.
  app.get<{ Params: { id: string } }>('/:id/report', { schema: { params: runIdParams } }, async (req, reply) => {
    const teacherId = req.user!.id
    const [row] = await db.select({ run: lessonRuns, className: teacherClasses.name }).from(lessonRuns)
      .innerJoin(teacherClasses, eq(teacherClasses.id, lessonRuns.classId))
      .where(and(eq(lessonRuns.id, req.params.id), eq(lessonRuns.teacherId, teacherId))).limit(1)
    if (!row) return reply.code(404).send({ error: 'Урок не знайдено' })
    const runId = row.run.id
    const [students, devices, dispatches, attempts, evidence] = await Promise.all([
      db.select({ id: lessonRunStudents.id, label: classStudents.label }).from(lessonRunStudents)
        .leftJoin(classStudents, eq(classStudents.id, lessonRunStudents.classStudentId))
        .where(eq(lessonRunStudents.lessonRunId, runId)).orderBy(asc(lessonRunStudents.createdAt)),
      db.select({ lessonRunStudentId: lessonRunDevices.lessonRunStudentId }).from(lessonRunDevices)
        .where(and(eq(lessonRunDevices.lessonRunId, runId), isNotNull(lessonRunDevices.lessonRunStudentId))),
      db.select({ id: lessonRunDispatches.id, blockId: lessonRunDispatches.blockId, activityInstanceId: lessonRunDispatches.activityInstanceId })
        .from(lessonRunDispatches).where(eq(lessonRunDispatches.lessonRunId, runId)).orderBy(asc(lessonRunDispatches.openedAt)),
      db.select({
        id: activityAttempts.id,
        dispatchId: activityAttempts.dispatchId,
        lessonRunStudentId: activityAttempts.lessonRunStudentId,
        activityInstanceId: activityAttempts.activityInstanceId,
        attemptNo: activityAttempts.attemptNo,
        correct: activityAttempts.correct,
        total: activityAttempts.total,
        normalizedScore: activityAttempts.normalizedScore,
        trust: activityAttempts.trust,
        answerPayload: activityAttempts.answerPayload,
        createdAt: activityAttempts.createdAt,
      }).from(activityAttempts).where(eq(activityAttempts.lessonRunId, runId)),
      db.select({
        lessonRunStudentId: studentOutcomeEvidence.lessonRunStudentId,
        activityAttemptId: studentOutcomeEvidence.activityAttemptId,
        outcomeId: studentOutcomeEvidence.outcomeId,
        evidenceRole: studentOutcomeEvidence.evidenceRole,
        trust: studentOutcomeEvidence.trust,
        score: studentOutcomeEvidence.score,
        observedAt: studentOutcomeEvidence.observedAt,
      }).from(studentOutcomeEvidence).where(eq(studentOutcomeEvidence.lessonRunId, runId)),
    ])
    const lesson = row.run.lessonSnapshot as unknown as LessonDefinitionV1
    return reply.send(lessonReport({
      run: {
        status: row.run.status,
        className: row.className,
        lessonPublishedVersion: row.run.lessonPublishedVersion,
        startedAt: row.run.startedAt,
        finishedAt: row.run.finishedAt,
      },
      lesson,
      outcomes: (await resolveSubjectPack(lesson.subjectPackId, { includeArchived: true }))?.outcomes ?? {},
      students: students.map(s => ({ id: s.id, label: s.label ?? null })),
      mappedStudentIds: new Set(devices.map(d => d.lessonRunStudentId!)),
      dispatches,
      attempts: attempts.map(a => ({ ...a, normalizedScore: Number(a.normalizedScore) })),
      evidence: evidence.map(e => ({ ...e, score: Number(e.score) })),
    }))
  })

  // ── Classroom control (stage I) ──────────────────────────────────────────

  // POST /api/teacher/lesson-runs/:id/launch — launch plan for lab computers.
  // Each assigned computer gets a pre-mapped device and a single-use link
  // (token in the URL fragment, never sent to servers or Referer). The
  // provider then only opens URLs: it never learns who sits where.
  app.post<{ Params: { id: string }; Body: { remoteDeviceIds: string[] } }>('/:id/launch', {
    schema: {
      params: runIdParams,
      body: {
        type: 'object',
        required: ['remoteDeviceIds'],
        properties: {
          remoteDeviceIds: { type: 'array', minItems: 1, maxItems: 60, uniqueItems: true, items: { type: 'string', pattern: REMOTE_DEVICE_ID_PATTERN } },
        },
      },
    },
  }, async (req, reply) => {
    const teacherId = req.user!.id
    const { id } = req.params
    try {
      const plan = await db.transaction(async tx => {
        const [run] = await tx.select({ id: lessonRuns.id, status: lessonRuns.status, classId: lessonRuns.classId }).from(lessonRuns)
          .where(and(eq(lessonRuns.id, id), eq(lessonRuns.teacherId, teacherId))).limit(1).for('update')
        if (!run) throw new RunNotFoundError()
        if (!OPEN_RUN_STATUSES.includes(run.status)) throw new LessonRunStateError('Урок завершено: відкрити його на комп’ютерах уже не можна')

        const assignments = await tx.select({ remoteDeviceId: deviceAssignments.remoteDeviceId, classStudentId: deviceAssignments.classStudentId })
          .from(deviceAssignments)
          .where(and(eq(deviceAssignments.classId, run.classId), inArray(deviceAssignments.remoteDeviceId, req.body.remoteDeviceIds)))
        const roster = await tx.select({ id: lessonRunStudents.id, classStudentId: lessonRunStudents.classStudentId })
          .from(lessonRunStudents).where(eq(lessonRunStudents.lessonRunId, run.id))
        const runStudentByClassStudent = new Map(roster.filter(r => r.classStudentId).map(r => [r.classStudentId!, r.id]))
        const existing = await tx.select({ n: lessonRunDevices.pairingNumber }).from(lessonRunDevices)
          .where(eq(lessonRunDevices.lessonRunId, run.id))
        let numbers = existing.map(e => e.n)

        const launches: { remoteDeviceId: string; url: string }[] = []
        const skipped: { remoteDeviceId: string; reason: 'unassigned' | 'not-in-roster' | 'full' }[] = []
        const byRemote = new Map(assignments.map(a => [a.remoteDeviceId, a.classStudentId]))
        const now = Date.now()
        for (const remoteDeviceId of req.body.remoteDeviceIds) {
          const classStudentId = byRemote.get(remoteDeviceId)
          if (!classStudentId) { skipped.push({ remoteDeviceId, reason: 'unassigned' }); continue }
          const runStudentId = runStudentByClassStudent.get(classStudentId)
          if (!runStudentId) { skipped.push({ remoteDeviceId, reason: 'not-in-roster' }); continue }
          if (numbers.length >= MAX_RUN_DEVICES) { skipped.push({ remoteDeviceId, reason: 'full' }); continue }
          // The new device replaces whatever device the student had in this run.
          await tx.update(lessonRunDevices).set({ revokedAt: new Date(now), lessonRunStudentId: null }).where(and(
            eq(lessonRunDevices.lessonRunStudentId, runStudentId), isNull(lessonRunDevices.revokedAt),
          ))
          const pairingNumber = nextPairingNumber(numbers)
          numbers = [...numbers, pairingNumber]
          const { token, hash } = generateLaunchToken()
          const [device] = await tx.insert(lessonRunDevices).values({
            lessonRunId: run.id,
            pairingNumber,
            lessonRunStudentId: runStudentId,
            expiresAt: new Date(now + LESSON_DEVICE_TTL_MS),
            remoteDeviceId,
            launchTokenHash: hash,
            launchExpiresAt: new Date(now + LESSON_LAUNCH_TTL_MS),
          }).returning({ id: lessonRunDevices.id })
          await tx.update(lessonRunStudents).set({ status: 'joined' }).where(eq(lessonRunStudents.id, runStudentId))
          await tx.insert(lessonRunEvents).values({
            lessonRunId: run.id, type: 'device_launched', actorType: 'teacher', actorId: teacherId,
            payload: { deviceId: device!.id, remoteDeviceId },
          })
          launches.push({ remoteDeviceId, url: `lesson-join.html#launch=${token}` })
        }
        const commandId = randomUUID()
        await tx.insert(lessonRunEvents).values({
          lessonRunId: run.id, type: 'devices_launched', actorType: 'teacher', actorId: teacherId,
          payload: { commandId, launched: launches.length, skipped: skipped.length },
        })
        return { commandId, launches, skipped }
      })
      return reply.send(plan)
    } catch (err) {
      return sendRunError(reply, err)
    }
  })
}
