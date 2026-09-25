// Pure projections of one lesson definition into its views. The board (the
// presentation projection) is derived here and nowhere else, so what can reach
// the class screen is decided in one testable place.

import type {
  ActivityMechanic,
  ActivityTelemetry,
  BlockModality,
  BlockPresentation,
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
  canvas: 'Вільний блок',
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
