import type { CanvasBlock, LessonDefinitionV1, LocalizedText, PracticeBlock } from './curriculum-lesson-schema.js'

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
