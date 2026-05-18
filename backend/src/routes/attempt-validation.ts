export function isQuestionInAttempt(questionId: string, attemptQuestionIds: string[]): boolean {
  return attemptQuestionIds.includes(questionId)
}

// hideKeys=true для всіх спроб із кодом (олімпіада):
// correct та explanation не повертаються клієнту — лише isCorrect.
// hideKeys=false зарезервовано для майбутнього тренувального режиму без кодів.
export function scoreAttempt(
  attemptQuestions: { id: string; correct: number; explanation: string | null }[],
  studentAnswers: Record<string, number>,
  hideKeys = true,
): {
  score: number
  results: Record<string, { correct?: number; explanation?: string | null; isCorrect: boolean }>
} {
  let score = 0
  const results: Record<string, { correct?: number; explanation?: string | null; isCorrect: boolean }> = {}

  for (const question of attemptQuestions) {
    const given = studentAnswers[question.id]
    const isCorrect = given === question.correct
    if (isCorrect) score++
    results[question.id] = hideKeys
      ? { isCorrect }
      : { correct: question.correct, explanation: question.explanation, isCorrect }
  }

  return { score, results }
}
