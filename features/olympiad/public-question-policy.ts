export function getPublicQuestionRequest(mode: string, difficulty: string | null): {
  isOlympiad: false
  channel: 'path' | 'olympiad_training'
  difficulty?: string
  hideAnswers: boolean
} {
  if (mode === 'olympiad') {
    throw new Error('Офіційні питання можна отримати лише через код доступу.')
  }

  // Публічний API видає лише тренувальні питання без ключів. Local feedback
  // для practice живе у static bundle, а не в цьому endpoint.
  const hideAnswers = true
  const diff = mode === 'demo' ? 'hard' : (difficulty ?? undefined)
  const channel = mode === 'practice' ? 'olympiad_training' : 'path'
  return { isOlympiad: false, channel, difficulty: diff, hideAnswers }
}
