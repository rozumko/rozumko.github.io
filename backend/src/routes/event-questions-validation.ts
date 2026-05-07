export type EventQuestionSelectionInput = {
  grade?: number
  questionIds?: string[]
}

export type NormalizedEventQuestionSelection = {
  grade: number
  questionIds: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeEventQuestionSelection(input: EventQuestionSelectionInput): NormalizedEventQuestionSelection {
  const grade = Number(input.grade)
  if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
    throw new Error('Клас має бути числом від 1 до 4')
  }

  const questionIds = input.questionIds ?? []
  if (!Array.isArray(questionIds)) {
    throw new Error('questionIds має бути масивом')
  }
  if (questionIds.length > 100) {
    throw new Error('Забагато питань для одного класу')
  }

  const normalized = questionIds.map(id => id.trim())
  if (normalized.some(id => !UUID_RE.test(id))) {
    throw new Error('Список містить некоректний id питання')
  }

  const unique = new Set(normalized)
  if (unique.size !== normalized.length) {
    throw new Error('Питання в наборі не повинні повторюватися')
  }

  return { grade, questionIds: normalized }
}

export function assertQuestionsBelongToGrade(
  requestedIds: string[],
  foundQuestions: { id: string; grade: number | null }[],
  grade: number
): void {
  if (foundQuestions.length !== requestedIds.length) {
    throw new Error('Одне або кілька питань не знайдено')
  }

  const wrongGrade = foundQuestions.find(question => question.grade !== grade)
  if (wrongGrade) {
    throw new Error('У наборі є питання не з цього класу')
  }
}
