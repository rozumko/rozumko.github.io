export function getPublicQuestionRequest(mode: string, difficulty: string | null): {
  isOlympiad: false
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
  return { isOlympiad: false, difficulty: diff, hideAnswers }
}
