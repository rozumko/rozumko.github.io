// Pure model of the teacher's run console (stage F). The server owns the run
// state; this only maps it to labels, available controls and step context.
// Type-only imports keep it importable by node tests.

import type { LessonBlock, LessonDefinition, LessonRunAction, LessonRunStatus } from './types.js'

export const RUN_STATUS_LABELS: Readonly<Record<LessonRunStatus, string>> = {
  prepared: 'Підготовлено',
  active: 'Триває',
  paused: 'Пауза',
  finished: 'Завершено',
  cancelled: 'Скасовано',
}

/** Lifecycle buttons per status, mirroring the server state machine. */
export function runLifecycleActions(status: LessonRunStatus): LessonRunAction[] {
  switch (status) {
    case 'prepared': return ['start', 'cancel']
    case 'active': return ['pause', 'finish']
    case 'paused': return ['resume', 'finish']
    default: return []
  }
}

export const RUN_ACTION_LABELS: Readonly<Record<LessonRunAction, string>> = {
  start: 'Почати урок',
  pause: 'Пауза',
  resume: 'Продовжити',
  finish: 'Завершити урок',
  cancel: 'Скасувати',
}

export function canNavigate(status: LessonRunStatus): boolean {
  return status === 'active' || status === 'paused'
}

export function isOpenRun(status: LessonRunStatus): boolean {
  return status === 'prepared' || status === 'active' || status === 'paused'
}

/**
 * Non-step blocks (teacher notes, support, extension…) shown alongside the
 * step they follow. Blocks before the first step belong to the first step.
 */
export function stepAttachments(lesson: LessonDefinition, steps: readonly string[]): Map<string, LessonBlock[]> {
  const attachments = new Map<string, LessonBlock[]>(steps.map(id => [id, []]))
  const stepSet = new Set(steps)
  let owner = steps[0]
  for (const block of lesson.blocks) {
    if (stepSet.has(block.id)) {
      owner = block.id
      continue
    }
    if (owner && block.views.document) attachments.get(owner)!.push(block)
  }
  return attachments
}

/** Short label for a step in the step list. */
export function stepTitle(block: LessonBlock | undefined, fallback: string): string {
  if (!block) return fallback
  const headline = block.presentation?.headline?.uk
  if (headline) return headline
  for (const key of ['heading', 'title', 'question', 'prompt'] as const) {
    const value = block.content[key] as { uk?: unknown } | undefined
    if (value && typeof value.uk === 'string') return value.uk
  }
  return fallback
}
