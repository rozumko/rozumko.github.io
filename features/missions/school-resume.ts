export interface ResumableQuestion {
  id?: unknown
}

export interface SchoolMissionResume<Q> {
  remaining: Q[]
  completedCount: number
  priorCorrect: number
  totalCount: number
}

export function prepareSchoolMissionResume<Q extends ResumableQuestion>(
  questions: Q[],
  answeredQuestionIds: string[],
  score: number,
): SchoolMissionResume<Q> {
  const answered = new Set(answeredQuestionIds)
  const remaining = questions.filter(q => !answered.has(String(q.id)))
  const completedCount = questions.length - remaining.length
  const safeScore = Number.isFinite(score) ? Math.floor(score) : 0

  return {
    remaining,
    completedCount,
    priorCorrect: Math.max(0, Math.min(safeScore, completedCount)),
    totalCount: questions.length,
  }
}

export function isStaleParticipantError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: unknown }).status
  return status === 403 || status === 404
}
