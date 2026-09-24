// Lesson Engine editorial API (stage C): admin-only CRUD, draft → review →
// published → archived, optimistic locking and immutable revisions — the
// micro-lesson pattern (ADR-0006) applied to curriculum lessons. Rows carry
// server-only answer keys, so nothing here is reachable by teachers or
// students; the whole surface is dark unless LESSON_ENGINE_ENABLED is set.

import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  curriculumLessonRevisions,
  curriculumLessons,
  curriculumOutcomeRevisions,
  curriculumOutcomes,
  type CurriculumLessonStatus,
  type CurriculumOutcomeStatus,
} from '../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { resolveSubjectPack } from '../lib/curriculum-outcomes.js'
import { SUBJECT_PACKS, findSubjectPack } from '../lib/subject-packs.js'
import { resolveActivityDefinition } from '../lib/school-activities.js'
import {
  OUTCOME_ID_PATTERN,
  OUTCOME_STATUSES,
  OutcomeValidationError,
  generateOutcomeId,
  outcomeColumns,
  outcomeSnapshot,
  outcomeUsage,
  peekSubjectPackId,
  prepareOutcome,
} from '../lib/curriculum-outcome-rules.js'
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
class OutcomeEditConflictError extends Error {}

const CONFLICT_MESSAGE = 'Урок уже змінив інший редактор. Онови дані й повтори дію.'

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', maxLength: 64, pattern: CURRICULUM_LESSON_ID_PATTERN } },
} as const

const editVersion = { type: 'integer', minimum: 1 } as const

// New content may use only active outcomes; archived ones stay for old reports.
const ACTIVE_ONLY = { includeArchived: false } as const

const outcomeIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', maxLength: 64, pattern: OUTCOME_ID_PATTERN } },
} as const

const packIdSchema = { type: 'string', maxLength: 64, pattern: CURRICULUM_LESSON_ID_PATTERN } as const

const OUTCOME_CONFLICT_MESSAGE = 'Результат уже змінив інший редактор. Онови дані й повтори дію.'

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof CurriculumValidationError || err instanceof OutcomeValidationError) {
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

  // POST /api/admin/curriculum/lessons/validate — the editor's "check" button:
  // the same checks as a save, nothing is stored. `lessonId` pins an existing row.
  app.post<{ Body: { definition: unknown; lessonId?: string } }>('/lessons/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['definition'],
        properties: {
          definition: { type: 'object' },
          lessonId: { type: 'string', maxLength: 64, pattern: CURRICULUM_LESSON_ID_PATTERN },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const pack = await resolveSubjectPack(peekSubjectPackId(req.body.definition), ACTIVE_ONLY)
      prepareCurriculumDefinition(req.body.definition, req.body.lessonId ?? null, 1, pack)
      return reply.send({ ok: true, issues: [] })
    } catch (err) {
      if (err instanceof CurriculumValidationError) return reply.send({ ok: false, issues: err.issues })
      throw err
    }
  })

  // POST /api/admin/curriculum/lessons — create a draft from a full definition
  app.post<{ Body: { definition: unknown } }>('/lessons', {
    schema: {
      body: { type: 'object', required: ['definition'], properties: { definition: { type: 'object' } } },
    },
  }, async (req, reply) => {
    try {
      const pack = await resolveSubjectPack(peekSubjectPackId(req.body.definition), ACTIVE_ONLY)
      const lesson = prepareCurriculumDefinition(req.body.definition, null, 1, pack)
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

      const pack = await resolveSubjectPack(peekSubjectPackId(req.body.definition), ACTIVE_ONLY)
      const lesson = prepareCurriculumDefinition(req.body.definition, id, existing.contentVersion, pack)
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
          const pack = await resolveSubjectPack(peekSubjectPackId(current.draftContent), ACTIVE_ONLY)
          const lesson = prepareCurriculumDefinition(current.draftContent, id, current.contentVersion, pack)
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
      const restored = draftFromCurriculumRevision(revision.snapshot)
      const pack = await resolveSubjectPack(peekSubjectPackId(restored), ACTIVE_ONLY)
      const lesson = prepareCurriculumDefinition(restored, id, contentVersion, pack)
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

  // ── Learning outcome directory (migration 0057) ─────────────────────────

  // GET /api/admin/curriculum/packs — registered subject packs (code-owned),
  // with the tools and games a lesson in each pack may use.
  app.get('/packs', async (_req, reply) => {
    const packs = Object.values(SUBJECT_PACKS).map(pack => ({
      id: pack.id,
      subject: pack.subject,
      title: pack.title,
      gradeRange: pack.gradeRange,
      tools: Object.entries(pack.externalTools).map(([key, tool]) => ({ key, title: tool.title })),
      games: pack.games.map(key => ({ key, levels: resolveActivityDefinition(key).levels.map(level => level.id) })),
    }))
    return reply.send({ packs })
  })

  // GET /api/admin/curriculum/outcomes — the directory, archived included, with
  // the lessons (draft or published) that reference each outcome.
  app.get<{ Querystring: { subjectPackId?: string } }>('/outcomes', {
    schema: { querystring: { type: 'object', properties: { subjectPackId: packIdSchema }, additionalProperties: false } },
  }, async (req, reply) => {
    const packId = req.query.subjectPackId
    const [outcomes, lessons] = await Promise.all([
      db.select().from(curriculumOutcomes)
        .where(packId ? eq(curriculumOutcomes.subjectPackId, packId) : undefined)
        .orderBy(asc(curriculumOutcomes.subjectPackId), asc(curriculumOutcomes.code)),
      db.select({
        id: curriculumLessons.id,
        draftContent: curriculumLessons.draftContent,
        publishedSnapshot: curriculumLessons.publishedSnapshot,
      }).from(curriculumLessons),
    ])
    return reply.send({ outcomes, usage: outcomeUsage(lessons) })
  })

  // POST /api/admin/curriculum/outcomes — add an outcome to a registered pack
  app.post<{ Body: { subjectPackId: string; id?: string; outcome: unknown } }>('/outcomes', {
    schema: {
      body: {
        type: 'object',
        required: ['subjectPackId', 'outcome'],
        additionalProperties: false,
        properties: {
          subjectPackId: packIdSchema,
          id: { type: 'string', maxLength: 64, pattern: OUTCOME_ID_PATTERN },
          outcome: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      if (!findSubjectPack(req.body.subjectPackId)) {
        throw new OutcomeValidationError([{ path: 'subjectPackId', message: 'is not a registered subject pack' }])
      }
      const outcome = prepareOutcome(req.body.outcome)
      const created = await db.transaction(async tx => {
        const [row] = await tx.insert(curriculumOutcomes).values({
          id: req.body.id ?? generateOutcomeId(),
          subjectPackId: req.body.subjectPackId,
          ...outcomeColumns(outcome),
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        }).returning()
        await tx.insert(curriculumOutcomeRevisions).values({
          outcomeId: row!.id, editVersion: row!.editVersion, action: 'create',
          snapshot: outcomeSnapshot(row!), changedBy: req.user!.id,
        })
        return row!
      })
      return reply.code(201).send({ outcome: created })
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send({ error: 'Результат з таким id або кодом уже є в цьому предметі' })
      return sendError(reply, err)
    }
  })

  // PUT /api/admin/curriculum/outcomes/:id — edit wording, source or mappings.
  // The id and pack never change: evidence refers to them.
  app.put<{ Params: { id: string }; Body: { outcome: unknown; expectedEditVersion: number } }>('/outcomes/:id', {
    schema: {
      params: outcomeIdParams,
      body: {
        type: 'object',
        required: ['outcome', 'expectedEditVersion'],
        additionalProperties: false,
        properties: { outcome: { type: 'object' }, expectedEditVersion: editVersion },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    try {
      const outcome = prepareOutcome(req.body.outcome)
      const updated = await db.transaction(async tx => {
        const [current] = await tx.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.id, id)).limit(1).for('update')
        if (!current) return null
        if (current.editVersion !== req.body.expectedEditVersion) throw new OutcomeEditConflictError()
        const [row] = await tx.update(curriculumOutcomes).set({
          ...outcomeColumns(outcome),
          editVersion: current.editVersion + 1,
          updatedAt: new Date(),
          updatedBy: req.user!.id,
        }).where(eq(curriculumOutcomes.id, id)).returning()
        await tx.insert(curriculumOutcomeRevisions).values({
          outcomeId: row!.id, editVersion: row!.editVersion, action: 'update',
          snapshot: outcomeSnapshot(row!), changedBy: req.user!.id,
        })
        return row!
      })
      if (!updated) return reply.code(404).send({ error: 'Результат не знайдено' })
      return reply.send({ outcome: updated })
    } catch (err) {
      if (err instanceof OutcomeEditConflictError) return reply.code(409).send({ error: OUTCOME_CONFLICT_MESSAGE })
      if (isUniqueViolation(err)) return reply.code(409).send({ error: 'Результат з таким кодом уже є в цьому предметі' })
      return sendError(reply, err)
    }
  })

  // PUT /api/admin/curriculum/outcomes/:id/status — archive or restore.
  // Archiving blocks new saves and publishes that use the outcome; published
  // lessons, running lessons and reports are unaffected.
  app.put<{ Params: { id: string }; Body: { status: CurriculumOutcomeStatus; expectedEditVersion: number } }>('/outcomes/:id/status', {
    schema: {
      params: outcomeIdParams,
      body: {
        type: 'object',
        required: ['status', 'expectedEditVersion'],
        additionalProperties: false,
        properties: { status: { type: 'string', enum: [...OUTCOME_STATUSES] }, expectedEditVersion: editVersion },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params
    try {
      const updated = await db.transaction(async tx => {
        const [current] = await tx.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.id, id)).limit(1).for('update')
        if (!current) return null
        if (current.editVersion !== req.body.expectedEditVersion) throw new OutcomeEditConflictError()
        if (current.status === req.body.status) return current
        const [row] = await tx.update(curriculumOutcomes).set({
          status: req.body.status,
          editVersion: current.editVersion + 1,
          updatedAt: new Date(),
          updatedBy: req.user!.id,
        }).where(eq(curriculumOutcomes.id, id)).returning()
        await tx.insert(curriculumOutcomeRevisions).values({
          outcomeId: row!.id, editVersion: row!.editVersion, action: 'status',
          snapshot: outcomeSnapshot(row!), changedBy: req.user!.id,
        })
        return row!
      })
      if (!updated) return reply.code(404).send({ error: 'Результат не знайдено' })
      return reply.send({ outcome: updated })
    } catch (err) {
      if (err instanceof OutcomeEditConflictError) return reply.code(409).send({ error: OUTCOME_CONFLICT_MESSAGE })
      return sendError(reply, err)
    }
  })

  // GET /api/admin/curriculum/outcomes/:id/revisions — append-only history
  app.get<{ Params: { id: string } }>('/outcomes/:id/revisions', { schema: { params: outcomeIdParams } }, async (req, reply) => {
    const revisions = await db.select().from(curriculumOutcomeRevisions)
      .where(eq(curriculumOutcomeRevisions.outcomeId, req.params.id))
      .orderBy(desc(curriculumOutcomeRevisions.editVersion))
    return reply.send({ revisions })
  })
}
