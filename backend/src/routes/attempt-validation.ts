export function isQuestionInAttempt(questionId: string, attemptQuestionIds: string[]): boolean {
  return attemptQuestionIds.includes(questionId)
}

/** Stored student answer: index, text/number, or an index array for multi-select/sort/match. */
export type AnswerValue = number | string | number[]

export type ScoredQuestion = {
  id: string
  type?: string
  correct: number | null
  explanation: string | null
  options?: unknown
}

function arraysEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((v, i) => Number(v) === Number(b[i]))
}

function unorderedIntegerArraysEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  const left = [...new Set(a)].filter(Number.isInteger).map(Number).sort((x, y) => x - y)
  const right = [...new Set(b)].filter(Number.isInteger).map(Number).sort((x, y) => x - y)
  if (left.length !== a.length || right.length !== b.length) return false
  return arraysEqual(left, right)
}

/** Оцінює input: числове порівняння з допуском або нечутливе до регістру текстове. */
function isInputCorrect(given: unknown, options: Record<string, unknown> | undefined): boolean {
  const answer = options?.['answer']
  if (answer == null || given == null) return false
  const isNum = options?.['inputType'] === 'number' || typeof answer === 'number'
  if (isNum) {
    const g = Number(given), a = Number(answer)
    if (Number.isNaN(g) || Number.isNaN(a)) return false
    return Math.abs(g - a) < 0.001
  }
  return String(given).trim().toLowerCase() === String(answer).trim().toLowerCase()
}

/**
 * Підраховує результат спроби. Оцінювання — лише на сервері.
 *
 * Типи і де лежить ключ:
 *   choice / truefalse / sequence — `correct` column (integer index)
 *   multi_select                  — `options.correctAnswers` (number[])
 *   sort                          — `options.correctOrder` (number[])
 *   match                         — `options.pairs` (number[])
 *   input                         — `options.answer` (string|number)
 *
 * hideKeys=true (дефолт) — не повертає correct/explanation у результатах (захист від oracle-атаки).
 */
export function scoreAttempt(
  attemptQuestions: ScoredQuestion[],
  studentAnswers: Record<string, AnswerValue>,
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
    const options = (question.options && typeof question.options === 'object' && !Array.isArray(question.options))
      ? question.options as Record<string, unknown>
      : undefined

    let isCorrect = false

    switch (type) {
      case 'choice':
      case 'truefalse':
      case 'sequence':
        // integer-індекс у колонці correct
        isCorrect = question.correct !== null && given === question.correct
        break
      case 'multi_select':
        // Multi-select uses all-or-nothing scoring; option order does not matter.
        isCorrect = unorderedIntegerArraysEqual(given, options?.['correctAnswers'])
        break
      case 'sort':
        // студент надсилає масив індексів у своєму порядку; ключ — correctOrder
        isCorrect = arraysEqual(given, options?.['correctOrder'])
        break
      case 'match':
        // студент надсилає масив обраних правих індексів по кожному лівому; ключ — pairs
        isCorrect = arraysEqual(given, options?.['pairs'])
        break
      case 'input':
        isCorrect = isInputCorrect(given, options)
        break
      // невідомий тип → 0
    }

    if (isCorrect) score++

    results[question.id] = hideKeys
      ? { isCorrect }
      : { correct: question.correct, explanation: question.explanation, isCorrect }
  }

  return { score, results }
}

export function scoreSavedAttempt(
  attemptQuestions: ScoredQuestion[],
  studentAnswers: Record<string, AnswerValue>,
  totalQ: number | null,
): { score: number; total: number } {
  return {
    score: scoreAttempt(attemptQuestions, studentAnswers).score,
    total: totalQ ?? attemptQuestions.length,
  }
}
