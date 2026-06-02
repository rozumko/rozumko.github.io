export function getPublicQuestionRequest(mode: string, difficulty: string | null): {
  isOlympiad: false
  difficulty?: string
  hideAnswers: boolean
} {
  if (mode === 'olympiad') {
    throw new Error('Офіційні питання можна отримати лише через код доступу.')
  }

  // Публічний API видає лише тренувальні питання. У demo ховаємо ключі відповідей.
  const hideAnswers = mode === 'demo'
  const diff = mode === 'demo' ? 'hard' : (difficulty ?? undefined)
  return { isOlympiad: false, difficulty: diff, hideAnswers }
}
