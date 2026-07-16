import { normalizeLessonContent, type LessonContentInput } from './lesson-validation.js'

export const LESSON_EDITORIAL_STATUSES = ['draft', 'review', 'published', 'archived'] as const
export type LessonEditorialStatus = (typeof LESSON_EDITORIAL_STATUSES)[number]

export function normalizeLessonEditorialStatus(raw: unknown): LessonEditorialStatus {
  if (typeof raw === 'string' && (LESSON_EDITORIAL_STATUSES as readonly string[]).includes(raw)) return raw as LessonEditorialStatus
  throw new Error('Невідомий статус уроку')
}

export function lessonPublishedSnapshot(id: string, version: number, content: LessonContentInput): Record<string, unknown> {
  return { id, version, title: content.title, cards: content.cards, videoUrl: content.videoUrl ?? null, checkQuestions: content.checkQuestions }
}

export function lessonRevisionSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]))
}

export function contentFromLessonRevision(snapshot: Record<string, unknown>): LessonContentInput {
  return normalizeLessonContent({
    title: snapshot.title,
    cards: snapshot.cards,
    videoUrl: snapshot.videoUrl ?? snapshot.video_url,
    checkQuestions: snapshot.checkQuestions ?? snapshot.check_questions,
  })
}

export function contentFromPublishedSnapshot(snapshot: unknown): LessonContentInput {
  if (typeof snapshot !== 'object' || snapshot === null) throw new Error('Опубліковану версію уроку пошкоджено')
  return contentFromLessonRevision(snapshot as Record<string, unknown>)
}
