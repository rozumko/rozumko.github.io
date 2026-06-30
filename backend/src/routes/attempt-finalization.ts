import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { attemptQuestions, attempts, questions } from '../db/schema.js'
import { scoreSavedAttempt, type AnswerValue } from './attempt-validation.js'

export async function finalizeAttemptFromSavedAnswers(attemptId: string): Promise<{ score: number; total: number }> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select({ answers: attempts.answers, totalQ: attempts.totalQ })
      .from(attempts)
      .where(eq(attempts.id, attemptId))
      .limit(1)
      .for('update')

    if (!attempt) throw new Error('Attempt not found during finalization')

    const qs = await tx
      .select({ id: questions.id, type: questions.type, correct: questions.correct, explanation: questions.explanation, options: questions.options })
      .from(attemptQuestions)
      .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
      .where(eq(attemptQuestions.attemptId, attemptId))
      .orderBy(asc(attemptQuestions.position))

    const result = scoreSavedAttempt(qs, (attempt.answers as Record<string, AnswerValue>) ?? {}, attempt.totalQ)

    await tx
      .update(attempts)
      .set({
        status: 'finished',
        score: result.score,
        finishedAt: new Date(),
      })
      .where(eq(attempts.id, attemptId))

    return result
  })
}
