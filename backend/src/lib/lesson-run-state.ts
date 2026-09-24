// ── Lesson Engine: run state machine (stage F) ───────────────────────────────
// Pure rules for a lesson run. Routes only sequence I/O around these; every
// transition is authorised on the server, never inferred from the client.
//
//   prepared ──start──▶ active ◀──resume── paused
//      │                  │ └────pause────▶  │
//      │                  └──────finish──────┴──▶ finished
//      └──────────────cancel (any open)─────────▶ cancelled
//
// finished and cancelled are terminal (also enforced by a DB trigger).

import type { LessonDefinitionV1 } from './curriculum-lesson-schema.js'
import type { LessonRunEventType, LessonRunStatus } from '../db/schema.js'

export const LESSON_RUN_ACTIONS = ['start', 'pause', 'resume', 'finish', 'cancel'] as const
export type LessonRunAction = (typeof LESSON_RUN_ACTIONS)[number]

export const OPEN_RUN_STATUSES: readonly LessonRunStatus[] = ['prepared', 'active', 'paused']

interface Transition {
  from: readonly LessonRunStatus[]
  to: LessonRunStatus
  event: LessonRunEventType
}

const TRANSITIONS: Readonly<Record<LessonRunAction, Transition>> = {
  start:  { from: ['prepared'],                     to: 'active',    event: 'run_started' },
  pause:  { from: ['active'],                       to: 'paused',    event: 'run_paused' },
  resume: { from: ['paused'],                       to: 'active',    event: 'run_resumed' },
  finish: { from: ['active', 'paused'],             to: 'finished',  event: 'run_finished' },
  cancel: { from: ['prepared', 'active', 'paused'], to: 'cancelled', event: 'run_cancelled' },
}

export class LessonRunStateError extends Error {}

const STATUS_LABELS: Readonly<Record<LessonRunStatus, string>> = {
  prepared: 'підготовлений',
  active: 'триває',
  paused: 'на паузі',
  finished: 'завершений',
  cancelled: 'скасований',
}

/** The status an action leads to, or a LessonRunStateError when not allowed. */
export function applyRunAction(status: LessonRunStatus, action: LessonRunAction): { status: LessonRunStatus; event: LessonRunEventType } {
  const transition = TRANSITIONS[action]
  if (!transition.from.includes(status)) {
    throw new LessonRunStateError(`Урок ${STATUS_LABELS[status]}: цю дію зараз виконати не можна`)
  }
  return { status: transition.to, event: transition.event }
}

/** Timestamp columns an action sets, keyed by the target status. */
export function runActionTimestamps(action: LessonRunAction, now: Date): Record<string, Date | null> {
  switch (action) {
    case 'start': return { startedAt: now }
    case 'pause': return { pausedAt: now }
    case 'resume': return { pausedAt: null }
    case 'finish': return { finishedAt: now }
    case 'cancel': return { cancelledAt: now }
  }
}

/**
 * The navigable steps of a lesson: blocks marked `runtime.step`, in order. A
 * lesson with none still has one step (its first block), so a run always has
 * a current block.
 */
export function runSteps(lesson: LessonDefinitionV1): string[] {
  const steps = lesson.blocks.filter(block => block.runtime?.step === true).map(block => block.id)
  if (steps.length > 0) return steps
  return lesson.blocks.length > 0 ? [lesson.blocks[0]!.id] : []
}

/** Navigation is allowed while the lesson is live, including on pause (reteach). */
export function resolveStep(lesson: LessonDefinitionV1, status: LessonRunStatus, stepIndex: number): string {
  if (status !== 'active' && status !== 'paused') {
    throw new LessonRunStateError(`Урок ${STATUS_LABELS[status]}: перейти до кроку не можна`)
  }
  const steps = runSteps(lesson)
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
    throw new LessonRunStateError('Такого кроку в уроці немає')
  }
  return steps[stepIndex]!
}
