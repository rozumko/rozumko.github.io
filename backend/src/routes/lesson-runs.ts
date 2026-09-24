// Lesson Engine runs API (stage F): a teacher prepares a published lesson for
// one of their classes, then conducts it — start, step, pause, resume, finish
// or cancel. The run freezes the published snapshot, so edits never reach a
// run in progress. Every route is owner-scoped: another teacher's run is
// indistinguishable from a missing one. Dark unless LESSON_ENGINE_ENABLED.

import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  classStudents,
  curriculumLessons,
  lessonRunEvents,
  lessonRunStudents,
  lessonRuns,
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

class RunNotFoundError extends Error {}

const runIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
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
        await tx.update(lessonRuns).set({ status: next.status, ...runActionTimestamps(action, now), updatedAt: now })
          .where(eq(lessonRuns.id, id))
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
}
