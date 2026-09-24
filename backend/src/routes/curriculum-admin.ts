// Lesson Engine editorial API (stage C): admin-only CRUD, draft → review →
// published → archived, optimistic locking and immutable revisions — the
// micro-lesson pattern (ADR-0006) applied to curriculum lessons. Rows carry
// server-only answer keys, so nothing here is reachable by teachers or
// students; the whole surface is dark unless LESSON_ENGINE_ENABLED is set.

import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { curriculumLessonRevisions, curriculumLessons, type CurriculumLessonStatus } from '../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import {
  CURRICULUM_LESSON_ID_PATTERN,
  CURRICULUM_STATUSES,
  CurriculumValidationError,
  curriculumDefinitionChanged,
  curriculumRevisionSnapshot,
  curriculumRowColumns,
  curriculumTransitionError,
  draftFromCurriculumRevision,
  prepareCurriculumDefinition,
} from './curriculum-editorial.js'

class CurriculumEditConflictError extends Error {}
class CurriculumTransitionError extends Error {}

const CONFLICT_MESSAGE = 'Урок уже змінив інший редактор. Онови дані й повтори дію.'

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', maxLength: 64, pattern: CURRICULUM_LESSON_ID_PATTERN } },
} as const

const editVersion = { type: 'integer', minimum: 1 } as const

/** Drizzle wraps driver errors, so the Postgres code may sit on `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  for (let current = err; typeof current === 'object' && current !== null; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === '23505') return true
  }
  return false
}

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof CurriculumValidationError) {
    return reply.code(400).send({ error: err.message, issues: err.issues })
  }
  if (err instanceof CurriculumEditConflictError) return reply.code(409).send({ error: CONFLICT_MESSAGE })
  if (err instanceof CurriculumTransitionError) return reply.code(409).send({ error: err.message })
  throw err
}

export async function curriculumAdminRoutes(app: FastifyInstance) {
  // Flag first: with the engine off, every route is indistinguishable from a
  // missing one — before validation, auth or any DB access.
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', requireAdmin)

  // GET /api/admin/curriculum/lessons — summary list, no content
  app.get('/lessons', async (_req, reply) => {
    const lessons = await db.select({
      id: curriculumLessons.id,
      subjectPackId: curriculumLessons.subjectPackId,
      subject: curriculumLessons.subject,
      grade: curriculumLessons.grade,
      moduleId: curriculumLessons.moduleId,
      lessonNumber: curriculumLessons.lessonNumber,
      title: curriculumLessons.title,
      status: curriculumLessons.status,
      editVersion: curriculumLessons.editVersion,
      contentVersion: curriculumLessons.contentVersion,
      publishedVersion: curriculumLessons.publishedVersion,
      updatedAt: curriculumLessons.updatedAt,
    }).from(curriculumLessons).orderBy(
      asc(curriculumLessons.subjectPackId), asc(curriculumLessons.grade),
      asc(curriculumLessons.moduleId), asc(curriculumLessons.lessonNumber), asc(curriculumLessons.id),
    )
    return reply.send({ lessons })
  })

  // GET /api/admin/curriculum/lessons/:id — full row (draft + published snapshot)
  app.get<{ Params: { id: string } }>('/lessons/:id', { schema: { params: idParams } }, async (req, reply) => {
    const [lesson] = await db.select().from(curriculumLessons).where(eq(curriculumLessons.id, req.params.id)).limit(1)
    if (!lesson) return reply.code(404).send({ error: 'Урок не знайдено' })
    return reply.send({ lesson })
  })

  // POST /api/admin/curriculum/lessons — create a draft from a full definition
  app.post<{ Body: { definition: unknown } }>('/lessons', {
    schema: {
      body: { type: 'object', required: ['definition'], properties: { definition: { type: 'object' } } },
    },
  }, async (req, reply) => {
    try {
      const lesson = prepareCurriculumDefinition(req.body.definition, null, 1)
      const created = await db.transaction(async tx => {
        const [row] = await tx.insert(curriculumLessons).values({
          id: lesson.id,
          ...curriculumRowColumns(lesson),
          contentVersion: 1,
          draftContent: lesson as unknown as Record<string, unknown>,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        }).returning()
        await tx.insert(curriculumLessonRevisions).values({
          lessonId: row!.id, editVersion: row!.editVersion, action: 'create',
          snapshot: curriculumRevisionSnapshot(row!), changedBy: req.user!.id,
        })
        return row!
      })
      return reply.code(201).send({ lesson: created })
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send({ error: 'Урок з таким id вже існує' })
      return sendError(reply, err)
    }
  })

  // PUT /api/admin/curriculum/lessons/:id — replace the draft; a content change
  // bumps content_version and returns the lesson to draft. The published
  // snapshot is untouched until the next publish.
  app.put<{ Params: { id: string }; Body: { definition: unknown; expectedEditVersion: number } }>('/lessons/:id', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['definition', 'expectedEditVersion'],
        properties: { definition: { type: 'object' }, expectedEditVersion: editVersion },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    try {
      const [existing] = await db.select().from(curriculumLessons).where(eq(curriculumLessons.id, id)).limit(1)
      if (!existing) return reply.code(404).send({ error: 'Урок не знайдено' })
      if (existing.editVersion !== req.body.expectedEditVersion) throw new CurriculumEditConflictError()

      const lesson = prepareCurriculumDefinition(req.body.definition, id, existing.contentVersion)
      if (!curriculumDefinitionChanged(existing.draftContent, lesson)) {
        return reply.send({ lesson: existing, changed: false })
      }
      const contentVersion = existing.contentVersion + 1
      lesson.metadata.contentVersion = contentVersion

      const updated = await db.transaction(async tx => {
        const [row] = await tx.update(curriculumLessons).set({
          ...curriculumRowColumns(lesson),
          draftContent: lesson as unknown as Record<string, unknown>,
          contentVersion,
          editVersion: existing.editVersion + 1,
          status: 'draft',
          updatedAt: new Date(),
          updatedBy: req.user!.id,
        }).where(and(eq(curriculumLessons.id, id), eq(curriculumLessons.editVersion, existing.editVersion))).returning()
        if (!row) throw new CurriculumEditConflictError()
        await tx.insert(curriculumLessonRevisions).values({
          lessonId: row.id, editVersion: row.editVersion, action: 'update',
          snapshot: curriculumRevisionSnapshot(row), changedBy: req.user!.id,
        })
        return row
      })
      return reply.send({ lesson: updated, changed: true })
    } catch (err) {
      return sendError(reply, err)
    }
  })

  // PUT /api/admin/curriculum/lessons/:id/status — workflow transition.
  // Publishing re-validates the draft (fail-closed: the pack may have changed)
  // and freezes it as the published snapshot for this content version.
  app.put<{ Params: { id: string }; Body: { status: CurriculumLessonStatus; expectedEditVersion: number } }>('/lessons/:id/status', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['status', 'expectedEditVersion'],
        properties: { status: { type: 'string', enum: [...CURRICULUM_STATUSES] }, expectedEditVersion: editVersion },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    const { status } = req.body
    try {
      const updated = await db.transaction(async tx => {
        const [current] = await tx.select().from(curriculumLessons).where(eq(curriculumLessons.id, id)).limit(1).for('update')
        if (!current) return null
        if (current.editVersion !== req.body.expectedEditVersion) throw new CurriculumEditConflictError()
        const transitionError = curriculumTransitionError(current.status, status)
        if (transitionError) throw new CurriculumTransitionError(transitionError)

        const now = new Date()
        const updates: Partial<typeof curriculumLessons.$inferInsert> = {
          status, editVersion: current.editVersion + 1, updatedAt: now, updatedBy: req.user!.id,
        }
        if (status === 'review') {
          updates.reviewedAt = now
          updates.reviewedBy = req.user!.id
        }
        if (status === 'published') {
          const lesson = prepareCurriculumDefinition(current.draftContent, id, current.contentVersion)
          updates.publishedVersion = current.contentVersion
          updates.publishedSnapshot = lesson as unknown as Record<string, unknown>
          updates.publishedAt = now
          updates.publishedBy = req.user!.id
        }
        const [row] = await tx.update(curriculumLessons).set(updates)
          .where(and(eq(curriculumLessons.id, id), eq(curriculumLessons.editVersion, current.editVersion)))
          .returning()
        if (!row) throw new CurriculumEditConflictError()
        await tx.insert(curriculumLessonRevisions).values({
          lessonId: row.id, editVersion: row.editVersion, action: 'status',
          snapshot: curriculumRevisionSnapshot(row), changedBy: req.user!.id,
        })
        return row
      })
      if (!updated) return reply.code(404).send({ error: 'Урок не знайдено' })
      return reply.send({ lesson: updated })
    } catch (err) {
      return sendError(reply, err)
    }
  })

  // GET /api/admin/curriculum/lessons/:id/revisions — immutable history (admin-only: contains keys)
  app.get<{ Params: { id: string } }>('/lessons/:id/revisions', { schema: { params: idParams } }, async (req, reply) => {
    const revisions = await db.select().from(curriculumLessonRevisions)
      .where(eq(curriculumLessonRevisions.lessonId, req.params.id))
      .orderBy(desc(curriculumLessonRevisions.editVersion))
    return reply.send({ revisions })
  })

  // POST /api/admin/curriculum/lessons/:id/restore — copy a revision's draft
  // into a new draft. History is never rewritten; the restore is itself a revision.
  app.post<{ Params: { id: string }; Body: { revisionEditVersion: number; expectedEditVersion: number } }>('/lessons/:id/restore', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['revisionEditVersion', 'expectedEditVersion'],
        properties: { revisionEditVersion: editVersion, expectedEditVersion: editVersion },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    try {
      const [current] = await db.select().from(curriculumLessons).where(eq(curriculumLessons.id, id)).limit(1)
      if (!current) return reply.code(404).send({ error: 'Урок не знайдено' })
      if (current.editVersion !== req.body.expectedEditVersion) throw new CurriculumEditConflictError()
      const [revision] = await db.select().from(curriculumLessonRevisions).where(and(
        eq(curriculumLessonRevisions.lessonId, id),
        eq(curriculumLessonRevisions.editVersion, req.body.revisionEditVersion),
      )).limit(1)
      if (!revision) return reply.code(404).send({ error: 'Ревізію не знайдено' })

      const contentVersion = current.contentVersion + 1
      const lesson = prepareCurriculumDefinition(draftFromCurriculumRevision(revision.snapshot), id, contentVersion)
      const updated = await db.transaction(async tx => {
        const [row] = await tx.update(curriculumLessons).set({
          ...curriculumRowColumns(lesson),
          draftContent: lesson as unknown as Record<string, unknown>,
          contentVersion,
          editVersion: current.editVersion + 1,
          status: 'draft',
          updatedAt: new Date(),
          updatedBy: req.user!.id,
        }).where(and(eq(curriculumLessons.id, id), eq(curriculumLessons.editVersion, current.editVersion))).returning()
        if (!row) throw new CurriculumEditConflictError()
        await tx.insert(curriculumLessonRevisions).values({
          lessonId: row.id, editVersion: row.editVersion, action: 'restore',
          snapshot: curriculumRevisionSnapshot(row), changedBy: req.user!.id,
        })
        return row
      })
      return reply.send({ lesson: updated })
    } catch (err) {
      return sendError(reply, err)
    }
  })
}
