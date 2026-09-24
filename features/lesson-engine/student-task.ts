// The activity a teacher sent, on a child's device (stage G2). The server
// decides everything: correctness, attempts left, and whether the score is
// shown at all (evidence withholds it). A submission keeps its client attempt
// id until the server confirms it, so a retried send can never count twice.

import { findActivity, findActivityLevel } from '../activities/registry.js'
import type { ActivityHandle, ActivityRunResult } from '../activities/activity-contract.js'
import { renderAnswerForm, type AnswerOutcome } from './activity-board.js'
import { richElement } from './rich-text.js'
import type { BoardAnswer, LessonAttemptResponse, StudentTask } from './types.js'

export interface StudentTaskDeps {
  submit(payload: { clientAttemptId: string; answer?: BoardAnswer; gameResult?: ActivityRunResult }): Promise<LessonAttemptResponse>
  newAttemptId(): string
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function doneMessage(task: Pick<StudentTask, 'lastResult'>): HTMLElement {
  const box = el('div', 'lj-task__done')
  box.append(el('p', 'lj-task__done-title', '✓ Готово!'))
  if (task.lastResult) box.append(el('p', undefined, `Правильно: ${task.lastResult.correct} з ${task.lastResult.total}`))
  box.append(el('p', undefined, 'Чекай на наступне завдання.'))
  return box
}

/** Keeps one client attempt id per pending submission; cleared only on success. */
function attemptSubmitter(deps: StudentTaskDeps) {
  let pendingId: string | null = null
  return async (payload: { answer?: BoardAnswer; gameResult?: ActivityRunResult }) => {
    pendingId ??= deps.newAttemptId()
    const response = await deps.submit({ clientAttemptId: pendingId, ...payload })
    pendingId = null
    return response
  }
}

export function renderStudentTask(host: HTMLElement, task: StudentTask, grade: number, deps: StudentTaskDeps): () => void {
  const card = el('section', 'lj-task')
  card.setAttribute('aria-labelledby', 'lj-task-title')
  const title = el('h2', 'lj-task__title', task.heading?.uk ?? 'Завдання')
  title.id = 'lj-task-title'
  const body = el('div', 'lj-task__body')
  card.append(title, body)
  host.replaceChildren(card)
  const send = attemptSubmitter(deps)
  const { activity } = task

  if (!task.acceptsAttempts) {
    const instructions = activity.config.instructions as { uk?: string } | undefined
    if (instructions?.uk) body.append(richElement('p', instructions.uk))
    if (activity.external) {
      const link = el('a', 'lj-button lj-task__launch', `Відкрити «${activity.external.title.uk}» ↗`)
      link.href = activity.external.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      body.append(link)
    }
    return () => {}
  }

  if (task.attemptsUsed >= task.attemptsMax) {
    body.append(doneMessage(task))
    return () => {}
  }

  if (activity.mechanic === 'game') return renderStudentGame(body, task, grade, send)

  renderAnswerForm(body, activity, {
    submitLabel: 'Надіслати',
    submit: async (answer): Promise<AnswerOutcome> => {
      const response = await send({ answer })
      return { result: response.result, feedback: response.feedback, attemptsLeft: response.attemptsLeft }
    },
    // Retry only a wrong answer while attempts remain; evidence has one attempt.
    retryable: outcome => (outcome.attemptsLeft ?? 0) > 0 && outcome.result !== null && outcome.result.correct < outcome.result.total,
  })
  return () => {}
}

function renderStudentGame(
  body: HTMLElement,
  task: StudentTask,
  grade: number,
  send: (payload: { gameResult: ActivityRunResult }) => Promise<LessonAttemptResponse>,
): () => void {
  const info = findActivity(String(task.activity.config.gameKey ?? ''))
  const level = info ? findActivityLevel(info, String(task.activity.config.level ?? '')) : null
  if (!info || !level) {
    body.append(el('p', 'lj-error', 'Гру не знайдено.'))
    return () => {}
  }
  const start = el('button', 'lj-button', `Почати: ${info.label}`)
  start.type = 'button'
  const stage = el('div', 'lj-task__game')
  const status = el('p', 'lj-task__status')
  status.setAttribute('role', 'status')
  const resend = el('button', 'lj-button', 'Надіслати результат ще раз')
  resend.type = 'button'
  resend.hidden = true
  body.append(start, stage, status, resend)

  let handle: ActivityHandle | null = null
  let finished: ActivityRunResult | null = null
  let disposed = false

  async function report() {
    if (!finished) return
    resend.hidden = true
    status.textContent = 'Надсилаємо результат…'
    try {
      const response = await send({ gameResult: finished })
      body.replaceChildren(doneMessage({ lastResult: response.result }))
    } catch (err) {
      status.textContent = (err as Error).message || 'Не вдалося надіслати результат.'
      resend.hidden = false
    }
  }

  start.addEventListener('click', async () => {
    if (window.innerWidth < info.minWidth) {
      status.textContent = 'Ця гра потребує ширшого екрана.'
      return
    }
    start.disabled = true
    try {
      const { mount } = await info.load()
      if (disposed) return
      start.hidden = true
      handle = mount(stage, {
        level: level.id,
        grade,
        onFinish: result => {
          finished = {
            correct: Math.round(result.correct),
            total: Math.round(result.total),
            mistakes: Math.round(result.mistakes),
            durationSec: Math.round(result.durationSec),
          }
          handle?.destroy()
          handle = null
          stage.replaceChildren()
          void report()
        },
      })
    } catch {
      status.textContent = 'Не вдалося завантажити гру.'
      start.disabled = false
    }
  })
  resend.addEventListener('click', () => void report())

  return () => {
    disposed = true
    handle?.destroy()
  }
}
