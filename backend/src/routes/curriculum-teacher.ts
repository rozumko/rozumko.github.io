// Lesson Engine teacher API (stage D): read-only access to published
// curriculum lessons for the teacher document and presentation views. Only the
// published snapshot is served, always through toDisplaySafeLesson(), so
// drafts and answer keys never reach the browser. Dark unless
// LESSON_ENGINE_ENABLED is set; archived lessons are hidden.

import type { FastifyInstance } from 'fastify'
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { curriculumLessons } from '../db/schema.js'
import { requireAuth } from '../lib/auth.js'
import { isLessonEngineEnabled } from '../lib/lesson-engine-flag.js'
import { toDisplaySafeLesson, type LessonDefinitionV1 } from '../lib/curriculum-lesson-schema.js'
import { CURRICULUM_LESSON_ID_PATTERN } from './curriculum-editorial.js'

export interface TeacherCurriculumLessonSummary {
  id: string
  subjectPackId: string
  grade: number
  moduleId: string | null
  lessonNumber: number | null
  title: LessonDefinitionV1['title']
  durationMin: number
  publishedVersion: number
}

/** Summary built from the published snapshot, never from draft columns. */
export function teacherLessonSummary(snapshot: Record<string, unknown>, publishedVersion: number): TeacherCurriculumLessonSummary {
  const lesson = snapshot as unknown as LessonDefinitionV1
  return {
    id: lesson.id,
    subjectPackId: lesson.subjectPackId,
    grade: lesson.grade,
    moduleId: lesson.moduleId ?? null,
    lessonNumber: lesson.lessonNumber ?? null,
    title: lesson.title,
    durationMin: lesson.durationMin,
    publishedVersion,
  }
}

export function teacherLessonView(snapshot: Record<string, unknown>): LessonDefinitionV1 {
  return toDisplaySafeLesson(snapshot as unknown as LessonDefinitionV1)
}

const visibleToTeachers = and(isNotNull(curriculumLessons.publishedVersion), ne(curriculumLessons.status, 'archived'))

export async function curriculumTeacherRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (_req, reply) => {
    if (!isLessonEngineEnabled()) return reply.code(404).send({ error: 'Not Found' })
  })
  app.addHook('preHandler', requireAuth)

  // GET /api/teacher/curriculum/lessons — published, non-archived lessons
  app.get('/lessons', async (_req, reply) => {
    const rows = await db.select({
      publishedVersion: curriculumLessons.publishedVersion,
      publishedSnapshot: curriculumLessons.publishedSnapshot,
    }).from(curriculumLessons).where(visibleToTeachers)

    const lessons = rows
      .map(row => teacherLessonSummary(row.publishedSnapshot!, row.publishedVersion!))
      .sort((a, b) => a.subjectPackId.localeCompare(b.subjectPackId)
        || a.grade - b.grade
        || (a.moduleId ?? '').localeCompare(b.moduleId ?? '')
        || (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0)
        || a.id.localeCompare(b.id))
    return reply.send({ lessons })
  })

  // GET /api/teacher/curriculum/lessons/:id — display-safe published definition
  app.get<{ Params: { id: string } }>('/lessons/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', maxLength: 64, pattern: CURRICULUM_LESSON_ID_PATTERN } },
      },
    },
  }, async (req, reply) => {
    const [row] = await db.select({
      publishedVersion: curriculumLessons.publishedVersion,
      publishedSnapshot: curriculumLessons.publishedSnapshot,
    }).from(curriculumLessons).where(and(eq(curriculumLessons.id, req.params.id), visibleToTeachers)).limit(1)
    if (!row) return reply.code(404).send({ error: 'Урок не знайдено' })
    return reply.send({ lesson: teacherLessonView(row.publishedSnapshot!), publishedVersion: row.publishedVersion })
  })
}
