import type { QuestionChannel } from '../db/schema.js'

export const QUESTION_CHANNELS = ['class_game', 'path', 'olympiad_training'] as const satisfies readonly QuestionChannel[]

export function normalizeQuestionChannels(raw: unknown): QuestionChannel[] {
  if (!Array.isArray(raw)) throw new Error('Канали питання мають бути масивом')
  const supplied = new Set<QuestionChannel>()
  for (const value of raw) {
    if (typeof value !== 'string' || !(QUESTION_CHANNELS as readonly string[]).includes(value)) {
      throw new Error('Невідомий канал питання')
    }
    supplied.add(value as QuestionChannel)
  }
  return QUESTION_CHANNELS.filter(channel => supplied.has(channel))
}

export function assertQuestionDistribution(isOlympiad: boolean, channels: readonly QuestionChannel[]): void {
  if (isOlympiad && channels.length) {
    throw new Error('Питання основного туру не можна показувати у тренувальних розділах')
  }
}

export function questionDistributionIssues(
  isOlympiad: boolean | null | undefined,
  channels: readonly QuestionChannel[] | null | undefined,
): string[] {
  if (isOlympiad) return channels?.length ? ['питання основного туру має тренувальні канали'] : []
  return channels?.length ? [] : ['не вибрано жодного розділу використання']
}
