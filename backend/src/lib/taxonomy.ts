import type { QuestionTrack } from '../db/schema.js'

/**
 * Таксономія навчального вмісту. Джерело правди: docs/content-taxonomy.md.
 * Валідація fail-closed: невідомий topic/conceptKey/progressionBand → помилка.
 */

export const CT_CONCEPTS = [
  'algorithms',
  'decomposition',
  'abstraction',
  'patterns',
  'repetition',
  'logic',
  'efficiency',
  'classification',
  'debugging',
] as const

export type ConceptKey = typeof CT_CONCEPTS[number]

export const TOPICS_BY_TRACK: Record<QuestionTrack, readonly string[]> = {
  'informatics': [
    'information',
    'data',
    'computer-systems',
    'algorithms-programming',
    'networks-internet',
    'digital-safety',
    'digital-tools',
  ],
  'ai-basics': [
    'what-is-ai',
    'how-ai-learns',
    'ai-perception',
    'human-vs-ai',
    'ai-ethics-safety',
    'ai-tools',
  ],
  // Для ЦТ теми збігаються з концептами (ct_quiz)
  'computational-thinking': CT_CONCEPTS,
}

export const ALL_TOPICS: readonly string[] = [...new Set(Object.values(TOPICS_BY_TRACK).flat())]

export const PROGRESSION_BANDS = ['recognize', 'apply', 'reason'] as const
export type ProgressionBand = typeof PROGRESSION_BANDS[number]

/** topic вимагає track і має належати його списку. */
export function normalizeTopic(raw: unknown, track: QuestionTrack | null): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') throw new Error('Невідома тема питання')
  if (!track) throw new Error('Тему можна задати лише разом із напрямом')
  if (!TOPICS_BY_TRACK[track].includes(raw)) {
    throw new Error(`Тема «${raw}» не належить напряму «${track}»`)
  }
  return raw
}

export function normalizeConceptKey(raw: unknown): ConceptKey | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string' && (CT_CONCEPTS as readonly string[]).includes(raw)) return raw as ConceptKey
  throw new Error('Невідомий CT-концепт')
}

export function normalizeProgressionBand(raw: unknown): ProgressionBand | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string' && (PROGRESSION_BANDS as readonly string[]).includes(raw)) return raw as ProgressionBand
  throw new Error('Невідомий рівень мисленнєвої дії')
}
