// Pure projections of one lesson definition into its views. The board (the
// presentation projection) is derived here and nowhere else, so what can reach
// the class screen is decided in one testable place.

import type {
  ActivityMechanic,
  ActivityTelemetry,
  BlockModality,
  BlockPresentation,
  CurriculumLessonSummary,
  LessonAsset,
  LessonBlock,
  LessonBlockType,
  LessonDefinition,
} from './types.js'

export interface PresentationSlide {
  blockId: string
  block: LessonBlock
  presentation: BlockPresentation
  assets: LessonAsset[]
}

/**
 * Board slides: only student-visible blocks with an authored projection.
 * Teacher-only blocks never qualify, whatever their `views` flags claim.
 */
export function presentationSlides(lesson: LessonDefinition): PresentationSlide[] {
  const assets = new Map((lesson.assets ?? []).map(asset => [asset.id, asset]))
  return lesson.blocks
    .filter(block => block.views.presentation && block.audience.student && block.type !== 'teacher-note' && block.presentation)
    .map(block => ({
      blockId: block.id,
      block,
      presentation: block.presentation!,
      assets: (block.presentation!.assetIds ?? []).map(id => assets.get(id)).filter((a): a is LessonAsset => Boolean(a)),
    }))
}

/** Teacher document: every block marked for the document view, in order. */
export function documentBlocks(lesson: LessonDefinition): LessonBlock[] {
  return lesson.blocks.filter(block => block.views.document)
}

export function findAsset(lesson: LessonDefinition, id: unknown): LessonAsset | null {
  return (lesson.assets ?? []).find(asset => asset.id === id) ?? null
}

export const BLOCK_TYPE_LABELS: Readonly<Record<LessonBlockType, string>> = {
  hero: 'Початок уроку',
  'essential-question': 'Питання уроку',
  objectives: 'Цілі',
  explanation: 'Пояснення',
  visual: 'Схема',
  discussion: 'Обговорення',
  practice: 'Практична робота',
  canvas: 'Текст і медіа',
  activity: 'Інтерактив',
  support: 'Підтримка',
  extension: 'Для тих, хто хоче більше',
  reflection: 'Рефлексія',
  'success-criteria': 'Критерії успіху',
  vocabulary: 'Словник',
  'teacher-note': 'Для вчителя',
  break: 'Перерва',
}

export const MODALITY_LABELS: Readonly<Record<BlockModality, string>> = {
  screen: 'За пристроєм',
  'teacher-led': 'Веде вчитель',
  discussion: 'Обговорення',
  paper: 'На папері',
  movement: 'Рухова',
  unplugged: 'Без пристроїв',
}

export const TELEMETRY_LABELS: Readonly<Record<ActivityTelemetry, string>> = {
  practice: 'Тренування',
  checkpoint: 'Перевірка розуміння',
  evidence: 'Навчальний доказ',
}

export const MECHANIC_LABELS: Readonly<Record<ActivityMechanic, string>> = {
  choice: 'Вибір відповіді',
  truefalse: 'Так чи ні',
  classify: 'Розподіл за групами',
  external: 'Зовнішній тренажер',
  game: 'Гра Розумко',
}

/** "2 клас · Урок 8 · 40 хв" */
export function lessonMetaLine(lesson: Pick<LessonDefinition, 'grade' | 'lessonNumber' | 'durationMin'>): string {
  return [
    `${lesson.grade} клас`,
    lesson.lessonNumber ? `Урок ${lesson.lessonNumber}` : null,
    `${lesson.durationMin} хв`,
  ].filter(Boolean).join(' · ')
}

// ── Lesson list filters ─────────────────────────────────────────────────────

/** «g2-m3» → 3; a module id without that shape has no number. */
export function moduleNumber(moduleId: string | null): number | null {
  const match = /-m(\d+)$/.exec(moduleId ?? '')
  return match ? Number(match[1]) : null
}

export function moduleLabel(moduleId: string | null): string {
  const n = moduleNumber(moduleId)
  if (n !== null) return `Модуль ${n}`
  return moduleId ?? 'Без модуля'
}

export interface LessonListFilter {
  /** Words that must all appear in the title (either language) or as «урок N». */
  query: string
  grade: number | null
  moduleId: string | null
}

type ListedLesson = Pick<CurriculumLessonSummary, 'grade' | 'moduleId' | 'lessonNumber' | 'title'>

export function filterLessons<T extends ListedLesson>(lessons: readonly T[], filter: LessonListFilter): T[] {
  const words = filter.query.toLocaleLowerCase('uk').split(/\s+/).filter(Boolean)
  return lessons.filter(lesson => {
    if (filter.grade !== null && lesson.grade !== filter.grade) return false
    if (filter.moduleId !== null && lesson.moduleId !== filter.moduleId) return false
    const haystack = `${lesson.title.uk} ${lesson.title.en ?? ''} урок ${lesson.lessonNumber ?? ''}`.toLocaleLowerCase('uk')
    return words.every(word => haystack.includes(word))
  })
}

/** Modules to offer for a grade (all grades when null), in course order. */
export function lessonModules(lessons: readonly ListedLesson[], grade: number | null): { moduleId: string | null; grade: number }[] {
  const seen = new Map<string, { moduleId: string | null; grade: number }>()
  for (const lesson of lessons) {
    if (grade !== null && lesson.grade !== grade) continue
    seen.set(`${lesson.grade}|${lesson.moduleId ?? ''}`, { moduleId: lesson.moduleId, grade: lesson.grade })
  }
  return [...seen.values()].sort((a, b) => a.grade - b.grade
    || (moduleNumber(a.moduleId) ?? Infinity) - (moduleNumber(b.moduleId) ?? Infinity)
    || (a.moduleId ?? '').localeCompare(b.moduleId ?? ''))
}
