import type { CanvasBlock, LessonDefinitionV1, LocalizedText, PracticeBlock } from './curriculum-lesson-schema.js'
import { studentActivityView } from './lesson-live.js'
import { findSubjectPack } from './subject-packs.js'

/** The same authored slide as the projector, with an explicit public-field allowlist. */
export function studentPresentationSlide(lesson: LessonDefinitionV1, blockId: string) {
  const block = lesson.blocks.find(item => item.id === blockId)
  if (!block || !block.audience.student || !block.views.presentation || block.type === 'teacher-note' || !block.presentation) return null
  const content = block.content as unknown as Record<string, unknown>
  const headline = block.presentation.headline ?? ['title', 'question', 'heading', 'prompt']
    .map(key => content[key] as LocalizedText | undefined).find(value => typeof value?.uk === 'string') ?? null
  const assetIds = new Set(block.presentation.assetIds ?? [])
  return {
    blockId: block.id,
    layout: block.presentation.layout,
    headline,
    shortText: block.presentation.shortText ?? [],
    assets: (lesson.assets ?? []).filter(asset => assetIds.has(asset.id)),
    canvasItems: block.type === 'canvas' ? block.content.board : [],
    activity: block.type === 'activity' ? studentActivityView(block.activity, findSubjectPack(lesson.subjectPackId)) : null,
  }
}

export interface StudentPracticeMaterial {
  kind: 'practice'
  blockId: string
  heading: LocalizedText | null
  intro: LocalizedText | null
  table: PracticeBlock['content']['table'] | null
  steps: PracticeBlock['content']['steps']
}

export interface StudentCanvasMaterial {
  kind: 'canvas'
  blockId: string
  heading: LocalizedText
  items: CanvasBlock['content']['student']
}

/** Send only the authored student practice fields for the active run step. */
export function studentPracticeMaterial(lesson: LessonDefinitionV1, blockId: string): StudentPracticeMaterial | StudentCanvasMaterial | null {
  const block = lesson.blocks.find(item => item.id === blockId)
  if (!block || !block.audience.student || !block.views.remote || !block.runtime?.step) return null
  if (block.type === 'canvas') return {
    kind: 'canvas', blockId: block.id, heading: block.content.heading, items: block.content.student,
  }
  if (block.type !== 'practice') return null
  return {
    kind: 'practice',
    blockId: block.id,
    heading: block.content.heading ?? null,
    intro: block.content.intro ?? null,
    table: block.content.table ?? null,
    steps: block.content.steps,
  }
}
