// Pure board-activity logic (stage E): which mode an activity uses, the
// questions a widget asks, the answer it sends, and a game's result envelope.
// Type-only imports keep it importable by node tests.

import type { ActivityRunResult } from '../activities/activity-contract.js'
import type { ActivityResult, ActivityView, BoardAnswer, LocalizedText } from './types.js'

export type BoardActivityMode = 'together' | 'students-only' | 'game' | 'view-only'


const OPTION_LETTERS = 'АБВГҐД'

export function boardActivityMode(activity: ActivityView): BoardActivityMode {
  if (activity.mechanic === 'game') return 'game'
  if (activity.scoring.mode !== 'server') return 'view-only'
  return activity.telemetry === 'evidence' ? 'students-only' : 'together'
}

export interface BoardQuestion {
  id: string
  label: string
  options: { value: string; label: string }[]
}

export function isLocalized(value: unknown): value is LocalizedText {
  return typeof value === 'object' && value !== null && typeof (value as LocalizedText).uk === 'string'
}

function entries(value: unknown, textField: 'text' | 'label'): { id: string; text: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const record = item as Record<string, unknown>
    return typeof record.id === 'string' && isLocalized(record[textField])
      ? [{ id: record.id, text: (record[textField] as LocalizedText).uk }]
      : []
  })
}

/** The questions a board widget asks, derived from display-safe config only. */
export function boardQuestions(activity: ActivityView): BoardQuestion[] {
  const config = activity.config
  switch (activity.mechanic) {
    case 'choice': {
      const options = entries(config.options, 'text')
      return [{
        id: 'choice',
        label: isLocalized(config.prompt) ? config.prompt.uk : '',
        options: options.map((option, i) => ({ value: option.id, label: `${OPTION_LETTERS[i] ?? i + 1}) ${option.text}` })),
      }]
    }
    case 'truefalse':
      return entries(config.statements, 'text').map(statement => ({
        id: statement.id,
        label: statement.text,
        options: [{ value: 'true', label: 'Так' }, { value: 'false', label: 'Ні' }],
      }))
    case 'classify': {
      const categories = entries(config.categories, 'label')
      return entries(config.items, 'label').map(item => ({
        id: item.id,
        label: item.text,
        options: categories.map(category => ({ value: category.id, label: category.text })),
      }))
    }
    default:
      return []
  }
}

/** Builds the API answer once every question has a selection; otherwise null. */
export function answerFromSelection(activity: ActivityView, selection: ReadonlyMap<string, string>): BoardAnswer | null {
  const questions = boardQuestions(activity)
  if (questions.length === 0 || !questions.every(question => selection.has(question.id))) return null
  switch (activity.mechanic) {
    case 'choice':
      return { optionId: selection.get('choice')! }
    case 'truefalse':
      return { answers: Object.fromEntries(questions.map(q => [q.id, selection.get(q.id) === 'true'])) }
    case 'classify':
      return { placement: Object.fromEntries(questions.map(q => [q.id, selection.get(q.id)!])) }
    default:
      return null
  }
}

/** A game reports its own aggregate; it stays client-unverified whatever it claims. */
export function gameResultEnvelope(instanceId: string, run: ActivityRunResult): ActivityResult {
  const total = Math.max(0, Math.floor(run.total))
  const correct = Math.min(Math.max(0, Math.floor(run.correct)), total)
  return {
    activityInstanceId: instanceId,
    status: 'submitted',
    correct,
    total,
    mistakes: Math.max(0, Math.floor(run.mistakes)),
    normalizedScore: total === 0 ? 0 : correct / total,
    durationSec: Math.max(0, Math.floor(run.durationSec)),
    trust: 'client-unverified',
  }
}
