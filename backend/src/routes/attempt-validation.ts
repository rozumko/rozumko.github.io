export function isQuestionInAttempt(questionId: string, attemptQuestionIds: string[]): boolean {
  return attemptQuestionIds.includes(questionId)
}

export function scoreAttempt(
  attemptQuestions: { id: string; correct: number; explanation: string | null }[],
  studentAnswers: Record<string, number>
): {
  score: number
  results: Record<string, { correct: number; explanation: string | null; isCorrect: boolean }>
} {
  let score = 0
  const results: Record<string, { correct: number; explanation: string | null; isCorrect: boolean }> = {}

  for (const question of attemptQuestions) {
    const given = studentAnswers[question.id]
    const isCorrect = given === question.correct
    if (isCorrect) score++
    results[question.id] = {
      correct: question.correct,
      explanation: question.explanation,
      isCorrect,
    }
  }

  return { score, results }
}
