// The activity a teacher sent, on a child's device (stage G2). The server
// decides everything: correctness, attempts left, and whether the score is
// shown at all (evidence withholds it). Every submission goes through the
// offline outbox (stage J): without a connection the answer is saved on the
// device and the task shows that it is waiting, then the result once it lands.

import { findActivity, findActivityLevel } from '../activities/registry.js'
import type { ActivityHandle, ActivityRunResult } from '../activities/activity-contract.js'
import { renderAnswerForm, type AnswerOutcome } from './activity-board.js'
import { QueuedAttemptError } from './attempt-outbox.js'
import { richElement } from './rich-text.js'
import type { BoardAnswer, LessonAttemptResponse, LessonProgress, StudentTask } from './types.js'

export interface StudentTaskDeps {
  saveProgress?(progress: LessonProgress): void
  /** Resolves with the server's answer; rejects with QueuedAttemptError when saved for later. */
  submit(payload: { clientAttemptId: string; answer?: BoardAnswer; gameResult?: ActivityRunResult }): Promise<LessonAttemptResponse>
  newAttemptId(): string
  /** An answer to this task is already waiting on the device (e.g. after a reload). */
  queued: boolean
}

export interface StudentTaskView {
  leave(): void
  /** The waiting answer reached the server in the background. */
  delivered(response: LessonAttemptResponse): void
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

function queuedMessage(): HTMLElement {
  const box = el('div', 'lj-task__queued')
  box.tabIndex = -1
  box.setAttribute('role', 'status')
  box.append(el('p', 'lj-task__queued-title', '📡 Відповідь чекає на зв\'язок'))
  box.append(el('p', undefined, 'Її збережено на цьому пристрої. Надішлемо сама, щойно з\'явиться інтернет. Не відповідай ще раз.'))
  return box
}

const NO_VIEW: StudentTaskView = { leave() {}, delivered() {} }

export function renderStudentTask(host: HTMLElement, task: StudentTask, grade: number, deps: StudentTaskDeps): StudentTaskView {
  const card = el('section', 'lj-task')
  card.setAttribute('aria-labelledby', 'lj-task-title')
  const title = el('h2', 'lj-task__title', task.heading?.uk ?? 'Завдання')
  title.id = 'lj-task-title'
  const body = el('div', 'lj-task__body')
  card.append(title, body)
  host.replaceChildren(card)
  const { activity } = task
  let waiting = false

  function showQueued() {
    waiting = true
    const box = queuedMessage()
    body.replaceChildren(box)
    box.focus()
  }

  /** One fresh client attempt id per submission; the outbox owns retries. */
  async function send(payload: { answer?: BoardAnswer; gameResult?: ActivityRunResult }) {
    try {
      return await deps.submit({ clientAttemptId: deps.newAttemptId(), ...payload })
    } catch (err) {
      if (err instanceof QueuedAttemptError) showQueued()
      throw err
    }
  }

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
    return NO_VIEW
  }

  // Retry only a wrong answer while attempts remain; evidence has one attempt.
  const retryable = (outcome: AnswerOutcome) =>
    (outcome.attemptsLeft ?? 0) > 0 && outcome.result !== null && outcome.result.correct < outcome.result.total

  function renderForm() {
    body.replaceChildren()
    renderAnswerForm(body, activity, {
      submitLabel: 'Надіслати',
      initialSelection: task.progress?.selection,
      onSelection: selection => deps.saveProgress?.({ selection }),
      submit: async (answer): Promise<AnswerOutcome> => {
        const response = await send({ answer })
        return { result: response.result, feedback: response.feedback, attemptsLeft: response.attemptsLeft }
      },
      retryable,
    })
  }

  /** The result of an answer that waited, shown in place of the waiting note. */
  function delivered(response: LessonAttemptResponse) {
    if (!waiting) return
    waiting = false
    if (activity.mechanic === 'game') {
      body.replaceChildren(doneMessage({ lastResult: response.result }))
      return
    }
    const box = el('div', 'lj-task__delivered')
    box.tabIndex = -1
    box.setAttribute('role', 'status')
    box.append(el('p', 'le-interactive__score', response.result ? `Правильно: ${response.result.correct} з ${response.result.total}` : '✓ Відповідь надіслано'))
    if (response.feedback?.explanation) box.append(richElement('p', response.feedback.explanation.uk, 'le-interactive__explanation'))
    if (retryable({ result: response.result, feedback: response.feedback, attemptsLeft: response.attemptsLeft })) {
      const again = el('button', 'lj-button', 'Спробувати ще раз')
      again.type = 'button'
      again.addEventListener('click', renderForm)
      box.append(again)
    } else {
      box.append(el('p', undefined, 'Чекай на наступне завдання.'))
    }
    body.replaceChildren(box)
    box.focus()
  }

  if (deps.queued) {
    waiting = true
    body.append(queuedMessage())
    return { leave() {}, delivered }
  }

  if (task.attemptsUsed >= task.attemptsMax || (task.attemptsUsed > 0 &&
    (activity.mechanic === 'game' || (task.lastResult !== null && task.lastResult.correct === task.lastResult.total)))) {
    body.append(doneMessage(task))
    return NO_VIEW
  }

  if (activity.mechanic === 'game') return { leave: renderStudentGame(body, task, grade, send, deps.saveProgress), delivered }

  renderForm()
  return { leave() {}, delivered }
}

function renderStudentGame(
  body: HTMLElement,
  task: StudentTask,
  grade: number,
  send: (payload: { gameResult: ActivityRunResult }) => Promise<LessonAttemptResponse>,
  saveProgress?: (progress: LessonProgress) => void,
): () => void {
  const info = findActivity(String(task.activity.config.gameKey ?? ''))
  const level = info ? findActivityLevel(info, String(task.activity.config.level ?? '')) : null
  if (!info || !level) {
    body.append(el('p', 'lj-error', 'Гру не знайдено.'))
    return () => {}
  }
  const start = el('button', 'lj-button', `${task.progress?.gameState ? 'Продовжити' : 'Почати'}: ${info.label}`)
  start.type = 'button'
  const stage = el('div', 'lj-task__game')
  const status = el('p', 'lj-task__status')
  status.setAttribute('role', 'status')
  const resend = el('button', 'lj-button', 'Надіслати результат ще раз')
  resend.type = 'button'
  resend.hidden = true
  body.append(start, stage, status, resend)

  let handle: ActivityHandle | null = null
  let finished: ActivityRunResult | null = task.progress?.finished ? task.progress.gameResult ?? null : null
  let disposed = false
  let checkpointTimer: number | null = null
  const checkpoint = () => {
    if (handle) saveProgress?.({ gameResult: handle.snapshot(), gameState: handle.checkpoint?.(), finished: false })
  }

  if (finished) {
    start.hidden = true
    resend.hidden = false
    status.textContent = 'Результат збережено. Надішли його вчителю.'
  } else if (task.progress?.gameResult && !task.progress.gameState) {
    status.textContent = 'Проміжний результат збережено. Ця гра почнеться заново.'
  }

  async function report() {
    if (!finished) return
    resend.hidden = true
    status.textContent = 'Надсилаємо результат…'
    try {
      const response = await send({ gameResult: finished })
      body.replaceChildren(doneMessage({ lastResult: response.result }))
    } catch (err) {
      // A queued result has already replaced this view with the waiting note.
      if (err instanceof QueuedAttemptError) return
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
        resumeState: task.progress?.gameState,
        onCheckpoint: () => checkpoint(),
        onFinish: result => {
          finished = {
            correct: Math.round(result.correct),
            total: Math.round(result.total),
            mistakes: Math.round(result.mistakes),
            durationSec: Math.round(result.durationSec),
          }
          saveProgress?.({ gameResult: finished, finished: true })
          if (checkpointTimer !== null) window.clearInterval(checkpointTimer)
          handle?.destroy()
          handle = null
          stage.replaceChildren()
          void report()
        },
      })
      checkpoint()
      checkpointTimer = window.setInterval(checkpoint, 1000)
    } catch {
      status.textContent = 'Не вдалося завантажити гру.'
      start.disabled = false
    }
  })
  resend.addEventListener('click', () => void report())

  return () => {
    disposed = true
    checkpoint()
    if (checkpointTimer !== null) window.clearInterval(checkpointTimer)
    handle?.destroy()
  }
}
