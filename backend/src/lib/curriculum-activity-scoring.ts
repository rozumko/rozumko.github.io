// ── Lesson Engine: server-side activity scoring ──────────────────────────────
// Scores a submitted answer against the server-only key of a published
// activity and returns the common result envelope. The browser never decides
// correctness (ADR-0001). Feedback says which submitted items were right — it
// never returns the key itself, so a wrong answer does not reveal the right one
// except through the authored explanation.

import type {
  ActivitySpec,
  ChoiceConfig,
  ChoiceKey,
  ClassifyConfig,
  ClassifyKey,
  LocalizedText,
  TrueFalseConfig,
  TrueFalseKey,
} from './curriculum-lesson-schema.js'

export type ActivityResultTrust = 'server-verified' | 'client-unverified' | 'teacher-observed'

/** Common result envelope shared by every mechanic (docs/lesson-engine). */
export interface ActivityResultEnvelope {
  activityInstanceId: string
  status: 'submitted'
  correct: number
  total: number
  mistakes: number
  normalizedScore: number
  trust: ActivityResultTrust
}

export interface ActivityFeedback {
  /** Correctness of each submitted item (the chosen option, each statement, each item). */
  items: { id: string; correct: boolean }[]
  explanation?: LocalizedText
}

export class ActivityAnswerError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function envelope(activity: ActivitySpec, items: ActivityFeedback['items']): ActivityResultEnvelope {
  const correct = items.filter(item => item.correct).length
  const total = items.length
  return {
    activityInstanceId: activity.instanceId,
    status: 'submitted',
    correct,
    total,
    mistakes: total - correct,
    normalizedScore: total === 0 ? 0 : correct / total,
    trust: 'server-verified',
  }
}

/** Requires an answer map to cover exactly the given ids, each with a valid value. */
function exactMap(raw: unknown, ids: string[], valid: (value: unknown) => boolean): Record<string, unknown> {
  if (!isRecord(raw)) throw new ActivityAnswerError('Відповідь має неправильний формат')
  const keys = Object.keys(raw)
  if (keys.length !== ids.length || !ids.every(id => Object.prototype.hasOwnProperty.call(raw, id) && valid(raw[id]))) {
    throw new ActivityAnswerError('Потрібно відповісти на кожен пункт')
  }
  return raw
}

/**
 * Scores an answer for a server-scored activity. Throws ActivityAnswerError
 * for a malformed or incomplete answer, and Error if the activity cannot be
 * scored on the server at all.
 */
export function scoreServerActivity(
  activity: ActivitySpec,
  answer: unknown,
): { result: ActivityResultEnvelope; feedback: ActivityFeedback } {
  if (activity.scoring.mode !== 'server' || !activity.scoring.key) {
    throw new Error(`activity ${activity.instanceId} is not server-scored`)
  }
  if (!isRecord(answer)) throw new ActivityAnswerError('Відповідь має неправильний формат')

  switch (activity.mechanic) {
    case 'choice': {
      const config = activity.config as ChoiceConfig
      const key = activity.scoring.key as ChoiceKey
      const optionId = answer.optionId
      if (typeof optionId !== 'string' || !config.options.some(option => option.id === optionId)) {
        throw new ActivityAnswerError('Оберіть один із варіантів')
      }
      const items = [{ id: optionId, correct: optionId === key.correctOptionId }]
      return { result: envelope(activity, items), feedback: { items, ...(key.explanation ? { explanation: key.explanation } : {}) } }
    }
    case 'truefalse': {
      const config = activity.config as TrueFalseConfig
      const key = activity.scoring.key as TrueFalseKey
      const ids = config.statements.map(statement => statement.id)
      const answers = exactMap(answer.answers, ids, value => typeof value === 'boolean')
      const items = ids.map(id => ({ id, correct: answers[id] === key.answers[id] }))
      return { result: envelope(activity, items), feedback: { items } }
    }
    case 'classify': {
      const config = activity.config as ClassifyConfig
      const key = activity.scoring.key as ClassifyKey
      const categoryIds = new Set(config.categories.map(category => category.id))
      const ids = config.items.map(item => item.id)
      const placement = exactMap(answer.placement, ids, value => typeof value === 'string' && categoryIds.has(value))
      const items = ids.map(id => ({ id, correct: placement[id] === key.placement[id] }))
      return { result: envelope(activity, items), feedback: { items } }
    }
    default:
      throw new Error(`mechanic ${activity.mechanic} has no server scorer`)
  }
}
