// Messages between the teacher's page (presenter) and the projector window
// (lesson-board.html). Both are same-origin pages of one browser, talking over
// a BroadcastChannel. The presenter is the source of truth for the slide; the
// board only renders it. The board has no teacher session of its own, so a
// "do it together" check is proxied through the presenter.
//
// Every message is parsed defensively: anything malformed is dropped.

import type { LessonDefinition } from './types.js'
import type { PresentationSlide } from './projection.js'

export const BOARD_CHANNEL = 'rozumko-lesson-board'
export const BOARD_WINDOW_NAME = 'rozumko-lesson-board'
export const BOARD_PAGE = 'lesson-board.html'

export type BoardMessage =
  /** board → presenter: a board page loaded and has nothing to show yet. */
  | { type: 'hello' }
  /** presenter → board: take over the board with this lesson. */
  | { type: 'claim'; session: string; lesson: LessonDefinition; blockId: string }
  /** presenter → board: show this slide. */
  | { type: 'show'; session: string; blockId: string }
  /** presenter → board: the presentation is over; close the window. */
  | { type: 'end'; session: string }
  /** board → presenter: the class screen moved to this slide (keys or swipe on the board). */
  | { type: 'slide'; session: string; blockId: string }
  /** board → presenter: the board window was closed. */
  | { type: 'closed'; session: string }
  /** board → presenter: check an answer given on the board. */
  | { type: 'check'; session: string; requestId: string; instanceId: string; answer: unknown }
  /** presenter → board: the server's verdict, or an error message. */
  | { type: 'check-result'; session: string; requestId: string; result?: unknown; error?: string }

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value)
}

function isLessonLike(value: unknown): value is LessonDefinition {
  if (typeof value !== 'object' || value === null) return false
  const lesson = value as Partial<LessonDefinition>
  return typeof lesson.id === 'string' && Array.isArray(lesson.blocks) && typeof lesson.title?.uk === 'string'
}

export function parseBoardMessage(data: unknown): BoardMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const msg = data as Record<string, unknown>
  switch (msg.type) {
    case 'hello':
      return { type: 'hello' }
    case 'claim':
      return isId(msg.session) && isLessonLike(msg.lesson) && isId(msg.blockId)
        ? { type: 'claim', session: msg.session, lesson: msg.lesson, blockId: msg.blockId }
        : null
    case 'show':
    case 'slide':
      return isId(msg.session) && isId(msg.blockId) ? { type: msg.type, session: msg.session, blockId: msg.blockId } : null
    case 'end':
    case 'closed':
      return isId(msg.session) ? { type: msg.type, session: msg.session } : null
    case 'check':
      return isId(msg.session) && isId(msg.requestId) && isId(msg.instanceId)
        ? { type: 'check', session: msg.session, requestId: msg.requestId, instanceId: msg.instanceId, answer: msg.answer }
        : null
    case 'check-result':
      if (!isId(msg.session) || !isId(msg.requestId)) return null
      return {
        type: 'check-result',
        session: msg.session,
        requestId: msg.requestId,
        ...(typeof msg.error === 'string' ? { error: msg.error } : { result: msg.result }),
      }
    default:
      return null
  }
}

/**
 * The lesson as the board receives it: only the blocks that can be slides.
 * Teacher notes, speaker hints and non-projected blocks never leave the
 * teacher's page, even inside the same browser. `slides` is
 * presentationSlides(lesson), the only gate onto the board.
 */
export function boardLesson(lesson: LessonDefinition, slides: readonly Pick<PresentationSlide, 'blockId'>[]): LessonDefinition {
  const slideIds = new Set(slides.map(slide => slide.blockId))
  return {
    ...lesson,
    blocks: lesson.blocks
      .filter(block => slideIds.has(block.id))
      .map(block => {
        if (!block.presentation) return block
        const { speakerNotes: _speakerNotes, ...shown } = block.presentation
        return { ...block, presentation: shown }
      }),
  }
}
