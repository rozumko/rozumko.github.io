import { validateQuestionShape, type QuestionType } from './question-input-validation.js'
import { questionDistributionIssues } from '../lib/question-channels.js'
import type { QuestionChannel, QuestionEditorialStatus } from '../db/schema.js'

export const QUESTION_EDITORIAL_STATUSES = ['draft', 'review', 'published', 'archived'] as const

export function normalizeQuestionEditorialStatus(raw: unknown): QuestionEditorialStatus {
  if (typeof raw === 'string' && (QUESTION_EDITORIAL_STATUSES as readonly string[]).includes(raw)) {
    return raw as QuestionEditorialStatus
  }
  throw new Error('Невідомий редакційний статус')
}

export function normalizeQuestionMedia(rawImg: unknown, rawAlt: unknown): { img: string | null; imageAlt: string | null } {
  const img = typeof rawImg === 'string' ? rawImg.trim() : ''
  const imageAlt = typeof rawAlt === 'string' ? rawAlt.trim() : ''
  if (img.length > 500) throw new Error('Посилання на зображення: не більше 500 символів')
  if (imageAlt.length > 240) throw new Error('Alt-текст: не більше 240 символів')
  if (img) {
    if (!(img.startsWith('/') || img.startsWith('./'))) {
      let parsed: URL
      try { parsed = new URL(img) } catch { throw new Error('Невалідне посилання на зображення') }
      if (parsed.protocol !== 'https:') throw new Error('Зображення: дозволено лише https або відносний шлях')
    }
    if (!imageAlt) throw new Error('Для зображення потрібен alt-текст')
  }
  return { img: img || null, imageAlt: img ? imageAlt : null }
}

export interface PublishableQuestion {
  q: string
  type: string
  options: unknown
  correct: number | null
  grade: number | null
  difficulty: string | null
  track: string | null
  topic: string | null
  img: string | null
  imageAlt: string | null
  isOlympiad: boolean | null
  channels: readonly QuestionChannel[]
}

export function questionReadinessIssues(question: PublishableQuestion): string[] {
  const issues: string[] = []
  if (!question.q.trim()) issues.push('відсутній текст питання')
  if (!Number.isInteger(question.grade) || question.grade! < 1 || question.grade! > 4) issues.push('не вказано клас')
  if (!['easy', 'medium', 'hard'].includes(question.difficulty ?? '')) issues.push('не вказано складність')
  if (!question.track) issues.push('не вказано напрям')
  if (!question.topic) issues.push('не вказано тему')
  try {
    validateQuestionShape(question.type as QuestionType, question.options, question.correct)
  } catch (error) {
    issues.push((error as Error).message)
  }
  try {
    normalizeQuestionMedia(question.img, question.imageAlt)
  } catch (error) {
    issues.push((error as Error).message)
  }
  issues.push(...questionDistributionIssues(question.isOlympiad, question.channels))
  return issues
}

/** JSON-safe immutable snapshot stored after every successful mutation. */
export function questionSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ]))
}

export function restoredQuestionValues(snapshot: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    'q', 'code', 'type', 'options', 'correct', 'explanation', 'img', 'imageAlt',
    'difficulty', 'track', 'topic', 'conceptKey', 'progressionBand', 'meta', 'grade', 'isOlympiad', 'channels',
  ] as const
  const legacyKeys: Record<string, string> = {
    imageAlt: 'image_alt', conceptKey: 'concept_key', progressionBand: 'progression_band', isOlympiad: 'is_olympiad',
  }
  return Object.fromEntries(allowed.flatMap(key => {
    if (key in snapshot) return [[key, snapshot[key]]]
    const legacy = legacyKeys[key]
    return legacy && legacy in snapshot ? [[key, snapshot[legacy]]] : []
  }))
}
