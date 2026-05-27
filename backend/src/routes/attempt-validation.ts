export function isQuestionInAttempt(questionId: string, attemptQuestionIds: string[]): boolean {
  return attemptQuestionIds.includes(questionId)
}

/**
 * Підраховує результат спроби.
 *
 * Реалізовані типи:
 *   choice / truefalse — порівнює integer-індекс (given === correct)
 *
 * НЕ реалізовані (рахуються як 0):
 *   input    — потребує окремої колонки correct_text text у БД (зараз correct — integer)
 *   sort / sequence / match — складна структура, потребує окремого алгоритму
 *
 * hideKeys=true (дефолт) — не повертає correct/explanation у results (захист від oracle-атаки).
 */
export function scoreAttempt(
  attemptQuestions: { id: string; type?: string; correct: number | null; explanation: string | null }[],
  studentAnswers: Record<string, number | string>,
  hideKeys = true,
): {
  score: number
  results: Record<string, { correct?: number | null; explanation?: string | null; isCorrect: boolean }>
} {
  let score = 0
  const results: Record<string, { correct?: number | null; explanation?: string | null; isCorrect: boolean }> = {}

  for (const question of attemptQuestions) {
    const given = studentAnswers[question.id]
    const type = question.type ?? 'choice'

    let isCorrect = false

    if (type === 'choice' || type === 'truefalse') {
      // integer-індекс
      isCorrect = question.correct !== null && given === question.correct
    }
    // input / sort / sequence / match: isCorrect = false (не реалізовано)

    if (isCorrect) score++

    results[question.id] = hideKeys
      ? { isCorrect }
      : { correct: question.correct, explanation: question.explanation, isCorrect }
  }

  return { score, results }
}
