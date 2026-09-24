// Pure editorial rules for Lesson Engine curriculum lessons (stage C). The
// route file (curriculum-admin.ts) only sequences I/O around these.

import {
  validateLessonAgainstPack,
  validateLessonDefinition,
  type GameConfig,
  type LessonDefinitionV1,
  type LessonValidationIssue,
  type SubjectPack,
} from '../lib/curriculum-lesson-schema.js'
import { resolveActivityDefinition, resolveActivityLevel } from '../lib/school-activities.js'
import type { CurriculumLessonStatus } from '../db/schema.js'

export const CURRICULUM_STATUSES = ['draft', 'review', 'published', 'archived'] as const satisfies readonly CurriculumLessonStatus[]

export const CURRICULUM_LESSON_ID_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$'

/**
 * Allowed status moves. Publishing always passes through review, and a
 * published lesson returns to draft only by being edited (which bumps its
 * content version) — never by a bare status flip.
 */
const TRANSITIONS: Readonly<Record<CurriculumLessonStatus, readonly CurriculumLessonStatus[]>> = {
  draft: ['review', 'archived'],
  review: ['draft', 'published', 'archived'],
  published: ['archived'],
  archived: ['draft'],
}

export function curriculumTransitionError(from: CurriculumLessonStatus, to: CurriculumLessonStatus): string | null {
  if (TRANSITIONS[from].includes(to)) return null
  return `Не можна перевести урок зі статусу «${from}» у «${to}»`
}

export class CurriculumValidationError extends Error {
  constructor(readonly issues: LessonValidationIssue[]) {
    super('Урок не пройшов перевірку')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates an editor-supplied definition for storage. `contentVersion` is
 * server-owned and stamped before validation; `lessonId` pins the definition
 * to the row being edited. `pack` is the lesson's subject pack joined with its
 * active outcomes (resolveSubjectPack), or null when the pack is not
 * registered. Fails closed on schema errors, an unregistered subject pack, or
 * a pack mismatch.
 */
export function prepareCurriculumDefinition(
  raw: unknown,
  lessonId: string | null,
  contentVersion: number,
  pack: SubjectPack | null,
): LessonDefinitionV1 {
  if (!isRecord(raw)) throw new CurriculumValidationError([{ path: '', message: 'must be an object' }])
  const input = structuredClone(raw)
  if (isRecord(input.metadata)) input.metadata.contentVersion = contentVersion

  const result = validateLessonDefinition(input)
  // `in` narrows in the frontend build too (no strictNullChecks there; Playwright imports this file).
  if ('errors' in result) throw new CurriculumValidationError(result.errors)
  const lesson = result.lesson

  const issues: LessonValidationIssue[] = []
  if (lessonId !== null && lesson.id !== lessonId) {
    issues.push({ path: 'id', message: 'must match the lesson being edited' })
  }
  if (!pack || pack.id !== lesson.subjectPackId) issues.push({ path: 'subjectPackId', message: 'is not a registered subject pack' })
  else issues.push(...validateLessonAgainstPack(lesson, pack))
  issues.push(...gameRegistryIssues(lesson))
  if (issues.length > 0) throw new CurriculumValidationError(issues)
  return lesson
}

/** A game block must name a game and level the platform registry actually has. */
function gameRegistryIssues(lesson: LessonDefinitionV1): LessonValidationIssue[] {
  const issues: LessonValidationIssue[] = []
  lesson.blocks.forEach((block, i) => {
    if (block.type !== 'activity' || block.activity.mechanic !== 'game') return
    const config = block.activity.config as GameConfig
    try {
      resolveActivityLevel(resolveActivityDefinition(config.gameKey), config.level)
    } catch {
      issues.push({ path: `blocks[${i}].activity.config`, message: 'names an unknown game or level' })
    }
  })
  return issues
}

/** Stable JSON with sorted keys, so key order in editor payloads is irrelevant. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function withoutContentVersion(definition: unknown): unknown {
  if (!isRecord(definition) || !isRecord(definition.metadata)) return definition
  const { contentVersion: _ignored, ...metadata } = definition.metadata
  return { ...definition, metadata }
}

/** True when the lesson content differs, ignoring the server-stamped content version. */
export function curriculumDefinitionChanged(previous: unknown, next: LessonDefinitionV1): boolean {
  return canonical(withoutContentVersion(previous)) !== canonical(withoutContentVersion(next))
}

/** Denormalized columns kept in sync with the definition for listing and ordering. */
export function curriculumRowColumns(lesson: LessonDefinitionV1) {
  return {
    subjectPackId: lesson.subjectPackId,
    subject: lesson.subject,
    grade: lesson.grade,
    moduleId: lesson.moduleId ?? null,
    lessonNumber: lesson.lessonNumber ?? null,
    title: lesson.title.uk,
    schemaVersion: lesson.schemaVersion,
  }
}

export function curriculumRevisionSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]))
}

/** Reads the draft definition out of a stored revision snapshot. */
export function draftFromCurriculumRevision(snapshot: Record<string, unknown>): unknown {
  const draft = snapshot.draftContent ?? snapshot.draft_content
  if (!isRecord(draft)) throw new CurriculumValidationError([{ path: 'snapshot', message: 'revision has no draft content' }])
  return draft
}
