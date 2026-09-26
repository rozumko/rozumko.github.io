// Pure rules for the Lesson Engine learning outcome directory (migration 0057).
// DB access lives in curriculum-outcomes.ts; routes only sequence I/O.

import { randomBytes } from 'node:crypto'
import {
  validateLearningOutcome,
  type LearningOutcome,
  type LessonValidationIssue,
} from './curriculum-lesson-schema.js'
import type { CurriculumOutcomeRow, CurriculumOutcomeStatus } from '../db/schema.js'

export const OUTCOME_ID_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$'
export const OUTCOME_STATUSES = ['active', 'archived'] as const satisfies readonly CurriculumOutcomeStatus[]
export const MAX_OUTCOME_MAPPINGS = 10

export class OutcomeValidationError extends Error {
  constructor(readonly issues: LessonValidationIssue[]) {
    super('Результат навчання не пройшов перевірку')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function trimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

/**
 * Validates an editor-supplied outcome. Strings are trimmed and empty optional
 * fields dropped before the shared schema rules run, so the stored outcome is
 * exactly what a lesson validator would accept from a pack.
 */
export function prepareOutcome(raw: unknown): LearningOutcome {
  if (!isRecord(raw)) throw new OutcomeValidationError([{ path: '', message: 'must be an object' }])
  const input: Record<string, unknown> = { ...raw }
  for (const key of ['code', 'source', 'sourceRef', 'gradeBand']) {
    if (key in input) input[key] = trimmed(input[key])
    if ((key === 'sourceRef' || key === 'gradeBand') && (input[key] === '' || input[key] === null)) delete input[key]
  }
  if (isRecord(input.title)) {
    const title: Record<string, unknown> = { ...input.title, uk: trimmed(input.title.uk) }
    if (title.en === null || trimmed(title.en) === '') delete title.en
    else if (title.en !== undefined) title.en = trimmed(title.en)
    input.title = title
  }
  if (Array.isArray(input.mappings)) {
    input.mappings = input.mappings.map(m => {
      if (!isRecord(m)) return m
      const mapping: Record<string, unknown> = { ...m, framework: trimmed(m.framework), ref: trimmed(m.ref) }
      // The editor sends '' for "strength not set".
      if (mapping.strength === '' || mapping.strength === null) delete mapping.strength
      return mapping
    })
  }

  const issues = validateLearningOutcome(input)
  if (Array.isArray(input.mappings) && input.mappings.length > MAX_OUTCOME_MAPPINGS) {
    issues.push({ path: 'mappings', message: `must have at most ${MAX_OUTCOME_MAPPINGS} items` })
  }
  if (issues.length > 0) throw new OutcomeValidationError(issues)
  return input as unknown as LearningOutcome
}

/** A fresh directory id when the editor does not name one. */
export function generateOutcomeId(): string {
  return `out-${randomBytes(5).toString('hex')}`
}

export function outcomeColumns(outcome: LearningOutcome) {
  return {
    code: outcome.code,
    titleUk: outcome.title.uk,
    titleEn: outcome.title.en ?? null,
    source: outcome.source,
    sourceRef: outcome.sourceRef ?? null,
    gradeBand: outcome.gradeBand ?? null,
    mappings: outcome.mappings,
  }
}

export function outcomeFromRow(row: CurriculumOutcomeRow): LearningOutcome {
  const outcome: LearningOutcome = {
    code: row.code,
    title: row.titleEn ? { uk: row.titleUk, en: row.titleEn } : { uk: row.titleUk },
    source: row.source as LearningOutcome['source'],
    mappings: row.mappings ?? [],
  }
  if (row.sourceRef) outcome.sourceRef = row.sourceRef
  if (row.gradeBand) outcome.gradeBand = row.gradeBand
  return outcome
}

/** The outcome registry a pack exposes to lesson validation or reports. */
export function outcomeRegistry(rows: CurriculumOutcomeRow[], options: { includeArchived: boolean }): Record<string, LearningOutcome> {
  const registry: Record<string, LearningOutcome> = {}
  for (const row of rows) {
    if (!options.includeArchived && row.status !== 'active') continue
    registry[row.id] = outcomeFromRow(row)
  }
  return registry
}

export function outcomeSnapshot(row: CurriculumOutcomeRow): Record<string, unknown> {
  return {
    id: row.id,
    subjectPackId: row.subjectPackId,
    code: row.code,
    titleUk: row.titleUk,
    titleEn: row.titleEn,
    source: row.source,
    sourceRef: row.sourceRef,
    gradeBand: row.gradeBand,
    mappings: row.mappings,
    status: row.status,
  }
}

function lessonOutcomeIds(definition: unknown): string[] {
  if (!isRecord(definition) || !Array.isArray(definition.learningOutcomes)) return []
  return definition.learningOutcomes
    .map(link => (isRecord(link) && typeof link.outcomeId === 'string' ? link.outcomeId : null))
    .filter((id): id is string => id !== null)
}

/** outcome id → ids of lessons whose draft or published version targets it. */
export function outcomeUsage(
  lessons: { id: string; draftContent: unknown; publishedSnapshot: unknown }[],
): Record<string, string[]> {
  const usage: Record<string, string[]> = Object.create(null)
  for (const lesson of lessons) {
    const ids = new Set([...lessonOutcomeIds(lesson.draftContent), ...lessonOutcomeIds(lesson.publishedSnapshot)])
    for (const id of ids) (usage[id] ??= []).push(lesson.id)
  }
  return usage
}

/** The subject pack a raw lesson definition names, before full validation. */
export function peekSubjectPackId(definition: unknown): string | null {
  return isRecord(definition) && typeof definition.subjectPackId === 'string' ? definition.subjectPackId : null
}
