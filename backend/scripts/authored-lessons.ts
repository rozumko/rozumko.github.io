// Shared loader/validator for authored micro-lesson JSON (temp/authored-lessons).
// SINGLE source of truth for validate-lessons.ts and import-authored-lessons.ts,
// so the validator checks exactly what the importer writes. Delegates all content
// validation to the admin normalizeLessonContent + normalizeLessonSlug (fail-closed).

import { readFileSync } from 'fs'
import { basename } from 'path'
import {
  normalizeLessonContent,
  normalizeLessonSlug,
  type LessonContentInput,
} from '../src/routes/lesson-validation.js'
import { collectFiles } from './authored-questions.js'

export interface AuthoredLesson {
  id?: unknown
  title?: unknown
  videoUrl?: unknown
  cards?: unknown
  checkQuestions?: unknown
}

export interface LoadedLesson { file: string; index: number; lesson: AuthoredLesson }

/** Reads and parses files; returns lessons plus any structural (parse) errors. */
export function loadLessonFiles(targets: string[]): { loaded: LoadedLesson[]; errors: string[] } {
  const loaded: LoadedLesson[] = []
  const errors: string[] = []
  for (const file of targets.flatMap(collectFiles)) {
    let parsed: { lessons?: unknown }
    try { parsed = JSON.parse(readFileSync(file, 'utf8')) }
    catch (e) { errors.push(`${basename(file)}: невалідний JSON: ${(e as Error).message}`); continue }
    if (!Array.isArray(parsed.lessons)) { errors.push(`${basename(file)}: очікується { "lessons": [...] }`); continue }
    parsed.lessons.forEach((lesson, index) => loaded.push({ file, index, lesson: lesson as AuthoredLesson }))
  }
  return { loaded, errors }
}

/** Returns errors for one lesson (empty = valid). One error per lesson (fail-fast, like admin). */
export function validateAuthoredLesson(file: string, index: number, lesson: AuthoredLesson): string[] {
  const at = `${basename(file)} [#${index}${lesson?.id ? ` ${String(lesson.id)}` : ''}]`
  try {
    normalizeLessonSlug(lesson.id)
    normalizeLessonContent(lesson)
    return []
  } catch (e) {
    return [`${at}: ${(e as Error).message}`]
  }
}

/** Maps a lesson to { id, content } (re-runs normalization — throws if invalid). */
export function toLessonRow(lesson: AuthoredLesson): { id: string; content: LessonContentInput } {
  return { id: normalizeLessonSlug(lesson.id), content: normalizeLessonContent(lesson) }
}

/** Flags slug ids used by more than one authored lesson. */
export function duplicateIds(loaded: LoadedLesson[]): string[] {
  const seen = new Map<string, number>()
  const dups: string[] = []
  for (const { lesson } of loaded) {
    let id: string
    try { id = normalizeLessonSlug(lesson.id) }
    catch { continue }
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    if (n === 2) dups.push(id)
  }
  return dups
}
