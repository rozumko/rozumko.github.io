// Pure model of the teacher's run console (stage F). The server owns the run
// state; this only maps it to labels, available controls and step context.
// Type-only imports keep it importable by node tests.

import type { LessonBlock, LessonDefinition, LessonRunAction, LessonRunDevice, LessonRunStatus, LessonRunView, LiveCellState, LiveSnapshot } from './types.js'

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

// ── Web join (stage G1) ──────────────────────────────────────────────────────

/** "123456" → "123 456": easier to read aloud and copy off the board. */
export function formatJoinCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

export interface StudentOption {
  value: string
  label: string
}

/**
 * Roster choices for one device. A student already on another device stays
 * selectable (the server moves them) but says where they are now. Deleted
 * students (no label) cannot be chosen.
 */
export function studentOptions(
  students: LessonRunView['students'],
  devices: readonly LessonRunDevice[],
  deviceId: string,
): StudentOption[] {
  const onDevice = new Map(devices.filter(d => d.lessonRunStudentId && d.id !== deviceId).map(d => [d.lessonRunStudentId!, d.pairingNumber]))
  return students
    .filter(student => student.label !== null)
    .map(student => {
      const elsewhere = onDevice.get(student.id)
      return { value: student.id, label: elsewhere ? `${student.label} (зараз на № ${elsewhere})` : student.label! }
    })
}

/** "Призначено 2 з 3 учнів" — roster students with a live device. */
export function mappingSummary(students: LessonRunView['students'], devices: readonly LessonRunDevice[]): string {
  const roster = students.filter(student => student.label !== null)
  const mapped = new Set(devices.map(d => d.lessonRunStudentId).filter(Boolean))
  const count = roster.filter(student => mapped.has(student.id)).length
  return `Призначено ${count} з ${roster.length} учнів`
}

// ── Live class state (stage G2) ──────────────────────────────────────────────

/** Icon + word, never colour alone. */
export const LIVE_STATE_LABELS: Readonly<Record<LiveCellState, { icon: string; text: string }>> = {
  'completed': { icon: '✓', text: 'Готово' },
  'needs-attention': { icon: '!', text: 'Увага' },
  'working': { icon: '…', text: 'Працює' },
  'not-started': { icon: '○', text: 'Не почав' },
  'offline': { icon: '⨯', text: 'Офлайн' },
  'skipped': { icon: '–', text: 'Пропущено' },
}

export function liveCellText(cell: LiveSnapshot['students'][number]['cells'][string]): string {
  const label = LIVE_STATE_LABELS[cell.state]
  const score = cell.correct !== null && cell.total !== null ? ` ${cell.correct}/${cell.total}` : ''
  return `${label.icon} ${label.text}${score}`
}

/** Counts per state for the open activity: "Готово 12 · Увага 3 · Працює 5 …". */
export function liveSummary(snapshot: LiveSnapshot, dispatchId: string): string {
  const counts = new Map<LiveCellState, number>()
  for (const student of snapshot.students) {
    const state = student.cells[dispatchId]?.state
    if (state) counts.set(state, (counts.get(state) ?? 0) + 1)
  }
  return (Object.keys(LIVE_STATE_LABELS) as LiveCellState[])
    .filter(state => counts.get(state))
    .map(state => `${LIVE_STATE_LABELS[state].text} ${counts.get(state)}`)
    .join(' · ')
}

/** Blocks the teacher may send to devices from this step. */
export function isSendable(block: LessonBlock | undefined): boolean {
  return block?.type === 'activity' && block.views.remote && block.activity !== undefined
}
