import type { ActivitySpec, ChoiceConfig, ClassifyConfig, TrueFalseConfig, GameConfig } from './curriculum-lesson-schema.js'
import { ActivityAnswerError } from './curriculum-activity-scoring.js'
import { ACTIVITY_MAX_DURATION_SEC, ACTIVITY_MAX_MISTAKES, resolveActivityDefinition, resolveActivityLevel } from './school-activities.js'

/** Recovery data is untrusted UI state, never a graded attempt or evidence. */
export function validateLessonProgress(activity: ActivitySpec, value: Record<string, unknown>): Record<string, unknown> {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32_768) throw new ActivityAnswerError('Стан завдання завеликий.')
  if (Object.keys(value).some(key => !['selection', 'gameState', 'gameResult', 'finished'].includes(key))) {
    throw new ActivityAnswerError('Невідоме поле стану завдання.')
  }
  if (activity.mechanic === 'game') {
    if (value.selection !== undefined || typeof value.finished !== 'boolean' || !value.gameResult) throw new ActivityAnswerError('Некоректний стан гри.')
    const config = activity.config as GameConfig
    const level = resolveActivityLevel(resolveActivityDefinition(config.gameKey), config.level)
    const result = value.gameResult as { correct: number; total: number; mistakes: number; durationSec: number }
    // A checkpoint can be made on the first keystroke; grading minimum times do not apply.
    if (!level || ![result.correct, result.total, result.mistakes, result.durationSec].every(Number.isInteger) ||
      result.total < 0 || result.total > level.maxTotal || result.correct < 0 || result.correct > result.total ||
      result.mistakes < 0 || result.mistakes > ACTIVITY_MAX_MISTAKES || result.durationSec < 0 || result.durationSec > ACTIVITY_MAX_DURATION_SEC) {
      throw new ActivityAnswerError('Некоректний проміжний результат гри.')
    }
    if (value.gameState !== undefined && (typeof value.gameState !== 'object' || value.gameState === null || Array.isArray(value.gameState))) {
      throw new ActivityAnswerError('Некоректний стан гри.')
    }
    return value
  }
  if (activity.mechanic === 'external' || Object.keys(value).some(key => key !== 'selection')) throw new ActivityAnswerError('Некоректний стан завдання.')
  const selection = value.selection
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw new ActivityAnswerError('Некоректний вибір.')
  const allowed = new Map<string, Set<string>>()
  if (activity.mechanic === 'choice') allowed.set('choice', new Set((activity.config as ChoiceConfig).options.map(o => o.id)))
  if (activity.mechanic === 'classify') {
    const config = activity.config as ClassifyConfig
    for (const item of config.items) allowed.set(item.id, new Set(config.categories.map(c => c.id)))
  }
  if (activity.mechanic === 'truefalse') {
    for (const item of (activity.config as TrueFalseConfig).statements) allowed.set(item.id, new Set(['true', 'false']))
  }
  for (const [id, selected] of Object.entries(selection)) {
    if (typeof selected !== 'string' || !allowed.get(id)?.has(selected)) throw new ActivityAnswerError('Вибір не належить цьому завданню.')
  }
  return { selection }
}

/** A former laptop cannot write after reassignment, even if reassigned back. */
export function holdsLessonAssignment(device: { lessonRunStudentId: string | null; assignmentVersion: number }, studentId: string, version: number): boolean {
  return device.lessonRunStudentId === studentId && device.assignmentVersion === version
}
