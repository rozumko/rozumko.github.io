// ── Lesson Engine: activities on devices and live class state (stage G2) ─────
// Pure rules shared by the student and teacher routes: what a device may see,
// how its submission is scored, and how the teacher's class grid is derived.
// Nothing here leaves an answer key in a browser-bound value.

import type { ActivitySpec, ChoiceConfig, GameConfig, LocalizedText, SubjectPack } from './curriculum-lesson-schema.js'
import { ActivityAnswerError, scoreServerActivity, type ActivityFeedback, type ActivityResultEnvelope } from './curriculum-activity-scoring.js'
import { normalizeActivityResult, resolveActivityDefinition, resolveActivityLevel } from './school-activities.js'

/** A device counts as online if it polled within this window. */
export const LIVE_ONLINE_WINDOW_MS = 20_000

/** Below this score a completed attempt is flagged for the teacher. */
export const NEEDS_ATTENTION_BELOW = 0.7

/** Evidence gets one attempt unless the lesson says otherwise; practice is generous. */
export function attemptLimit(activity: ActivitySpec): number {
  return activity.attempts?.max ?? (activity.telemetry === 'evidence' ? 1 : 10)
}

/** Activities a teacher can send to devices. External tools are launch-only. */
export function isDispatchable(activity: ActivitySpec): boolean {
  return ['choice', 'truefalse', 'classify', 'game', 'external'].includes(activity.mechanic)
}

export function acceptsAttempts(activity: ActivitySpec): boolean {
  return activity.mechanic !== 'external'
}

export interface StudentActivityView {
  instanceId: string
  mechanic: ActivitySpec['mechanic']
  telemetry: ActivitySpec['telemetry']
  config: Record<string, unknown>
  scoring: { mode: ActivitySpec['scoring']['mode'] }
  /** Resolved from the pack allowlist; the lesson itself never carries a URL. */
  external?: { url: string; title: LocalizedText }
}

/** What a device may see of an activity: config without any key. */
export function studentActivityView(activity: ActivitySpec, pack: Pick<SubjectPack, 'externalTools'> | null): StudentActivityView {
  const view: StudentActivityView = {
    instanceId: activity.instanceId,
    mechanic: activity.mechanic,
    telemetry: activity.telemetry,
    config: structuredClone(activity.config) as unknown as Record<string, unknown>,
    scoring: { mode: activity.scoring.mode },
  }
  if (activity.mechanic === 'external' && pack) {
    const toolKey = String((activity.config as { toolKey?: unknown }).toolKey ?? '')
    const tool = Object.prototype.hasOwnProperty.call(pack.externalTools, toolKey) ? pack.externalTools[toolKey] : undefined
    if (tool) view.external = { url: tool.url, title: tool.title }
  }
  return view
}

export interface GameRunInput {
  correct: number
  total: number
  mistakes: number
  durationSec: number
}

export interface ScoredAttempt {
  /** Trust follows the mechanic: server mechanics are verified, games are not (DB-checked too). */
  result: Omit<ActivityResultEnvelope, 'trust'> & { durationSec?: number; trust: 'server-verified' | 'client-unverified' }
  feedback: ActivityFeedback | null
  answerPayload: Record<string, unknown>
}

/**
 * Scores one device submission. Server mechanics score against the run's
 * frozen key; games are bounded by the platform registry and stay
 * client-unverified. Evidence returns no per-item feedback: the child's
 * neighbours must not learn the answers from their screen.
 */
export function scoreStudentAttempt(activity: ActivitySpec, submission: { answer?: unknown; gameResult?: unknown }): ScoredAttempt {
  if (activity.mechanic === 'game') {
    const game = submission.gameResult as Partial<GameRunInput> | undefined
    const config = activity.config as GameConfig
    const definition = resolveActivityDefinition(config.gameKey)
    let normalized
    try {
      normalized = normalizeActivityResult(definition, resolveActivityLevel(definition, config.level), {
        correct: Number(game?.correct), total: Number(game?.total),
        mistakes: Number(game?.mistakes), durationSec: Number(game?.durationSec),
      })
    } catch {
      throw new ActivityAnswerError('Невірний результат гри')
    }
    return {
      result: {
        activityInstanceId: activity.instanceId,
        status: 'submitted',
        correct: normalized.correct,
        total: normalized.total,
        mistakes: normalized.mistakes,
        normalizedScore: normalized.total === 0 ? 0 : normalized.correct / normalized.total,
        durationSec: normalized.durationSec,
        trust: 'client-unverified',
      },
      feedback: null,
      answerPayload: { gameResult: normalized },
    }
  }
  if (!acceptsAttempts(activity)) throw new ActivityAnswerError('Ця активність не приймає відповідей')
  const { result, feedback } = scoreServerActivity(activity, submission.answer)
  return {
    result: { ...result, trust: 'server-verified' },
    feedback: activity.telemetry === 'evidence' ? null : feedback,
    answerPayload: { answer: submission.answer as Record<string, unknown> },
  }
}

export type LiveCellState = 'not-started' | 'working' | 'completed' | 'needs-attention' | 'offline' | 'skipped'

export interface LiveCellInput {
  attempts: { normalizedScore: number }[]
  dispatchOpen: boolean
  dispatchOpenedAt: Date
  deviceLastSeenAt: Date | null
  now: Date
}

/** One cell of the teacher's grid: a student × an activity sent to devices. */
export function liveCellState(input: LiveCellInput): LiveCellState {
  const last = input.attempts[input.attempts.length - 1]
  if (last) return last.normalizedScore >= NEEDS_ATTENTION_BELOW ? 'completed' : 'needs-attention'
  if (!input.dispatchOpen) return 'skipped'
  const seen = input.deviceLastSeenAt
  if (!seen || input.now.getTime() - seen.getTime() > LIVE_ONLINE_WINDOW_MS) return 'offline'
  return seen.getTime() >= input.dispatchOpenedAt.getTime() ? 'working' : 'not-started'
}

export interface ChoicePattern {
  optionId: string
  optionText: LocalizedText
  count: number
  of: number
}

/**
 * "8 з 24 обрали однакову неправильну відповідь": the most common wrong option
 * among students' latest choice attempts, when at least two share it. Evidence
 * for the teacher's decision, never a verdict.
 */
export function choiceWrongPattern(
  activity: ActivitySpec,
  latest: { answerPayload: Record<string, unknown>; normalizedScore: number }[],
): ChoicePattern | null {
  if (activity.mechanic !== 'choice') return null
  const counts = new Map<string, number>()
  for (const attempt of latest) {
    if (attempt.normalizedScore >= 1) continue
    const optionId = (attempt.answerPayload.answer as { optionId?: unknown } | undefined)?.optionId
    if (typeof optionId === 'string') counts.set(optionId, (counts.get(optionId) ?? 0) + 1)
  }
  let top: [string, number] | null = null
  for (const entry of counts) if (!top || entry[1] > top[1]) top = entry
  if (!top || top[1] < 2) return null
  const option = (activity.config as ChoiceConfig).options.find(o => o.id === top![0])
  return option ? { optionId: option.id, optionText: option.text, count: top[1], of: latest.length } : null
}

/** Last element (Array#at is not in every consumer's lib). */
function lastOf<T>(list: readonly T[] | undefined): T | undefined {
  return list && list.length > 0 ? list[list.length - 1] : undefined
}

export interface LiveSnapshotInput {
  activities: Map<string, ActivitySpec>
  dispatches: { id: string; blockId: string; activityInstanceId: string; openedAt: Date; closedAt: Date | null }[]
  students: { id: string; label: string | null }[]
  devices: { lessonRunStudentId: string | null; lastSeenAt: Date | null }[]
  attempts: {
    dispatchId: string
    lessonRunStudentId: string
    attemptNo: number
    normalizedScore: number
    correct: number
    total: number
    answerPayload: Record<string, unknown>
  }[]
  now: Date
}

export interface LiveCell {
  state: LiveCellState
  attempts: number
  correct: number | null
  total: number | null
}

/** The teacher's class grid: students × dispatched activities, plus choice patterns. */
export function liveSnapshot(input: LiveSnapshotInput) {
  const deviceByStudent = new Map<string, Date | null>()
  for (const device of input.devices) {
    if (!device.lessonRunStudentId) continue
    const prev = deviceByStudent.get(device.lessonRunStudentId)
    if (prev === undefined || (device.lastSeenAt && (!prev || device.lastSeenAt > prev))) {
      deviceByStudent.set(device.lessonRunStudentId, device.lastSeenAt)
    }
  }
  const attemptsByCell = new Map<string, LiveSnapshotInput['attempts']>()
  for (const attempt of [...input.attempts].sort((a, b) => a.attemptNo - b.attemptNo)) {
    const key = `${attempt.lessonRunStudentId}:${attempt.dispatchId}`
    attemptsByCell.set(key, [...(attemptsByCell.get(key) ?? []), attempt])
  }

  const dispatches = input.dispatches.map(dispatch => {
    const activity = input.activities.get(dispatch.activityInstanceId)
    const latest = input.students
      .map(student => lastOf(attemptsByCell.get(`${student.id}:${dispatch.id}`)))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
    return {
      id: dispatch.id,
      blockId: dispatch.blockId,
      activityInstanceId: dispatch.activityInstanceId,
      mechanic: activity?.mechanic ?? null,
      telemetry: activity?.telemetry ?? null,
      open: dispatch.closedAt === null,
      openedAt: dispatch.openedAt,
      pattern: activity ? choiceWrongPattern(activity, latest) : null,
    }
  })

  const students = input.students
    .filter(student => student.label !== null)
    .map(student => {
      const lastSeenAt = deviceByStudent.get(student.id) ?? null
      const cells: Record<string, LiveCell> = {}
      for (const dispatch of input.dispatches) {
        const attempts = attemptsByCell.get(`${student.id}:${dispatch.id}`) ?? []
        const last = lastOf(attempts)
        cells[dispatch.id] = {
          state: liveCellState({
            attempts,
            dispatchOpen: dispatch.closedAt === null,
            dispatchOpenedAt: dispatch.openedAt,
            deviceLastSeenAt: lastSeenAt,
            now: input.now,
          }),
          attempts: attempts.length,
          correct: last?.correct ?? null,
          total: last?.total ?? null,
        }
      }
      const online = lastSeenAt !== null && input.now.getTime() - lastSeenAt.getTime() <= LIVE_ONLINE_WINDOW_MS
      return { lessonRunStudentId: student.id, label: student.label!, hasDevice: deviceByStudent.has(student.id), online, cells }
    })

  return { dispatches, students }
}
