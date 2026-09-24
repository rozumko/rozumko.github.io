// Board activities (stage E). Three modes, decided per activity:
//  - together: the class answers aloud, the teacher enters the answer, and the
//    server scores it (practice/checkpoint only);
//  - students-only: evidence is never checked on the board, since the whole
//    class would see the answers before doing it themselves;
//  - game: a platform game mounted on the board; its result is client-unverified.
// Nothing here knows an answer key: correctness always comes from the server.

import { findActivity, findActivityLevel } from '../activities/registry.js'
import type { ActivityHandle, ActivityRunResult } from '../activities/activity-contract.js'
import { appendRichText, richElement } from './rich-text.js'
import { answerFromSelection, boardActivityMode, boardQuestions, gameResultEnvelope, isLocalized } from './board-answers.js'
import type { ActivityFeedback, ActivityResult, ActivityView, BoardAnswer, LessonDefinition } from './types.js'

export interface BoardActivityDeps {
  check(instanceId: string, answer: BoardAnswer): Promise<{ result: ActivityResult; feedback: ActivityFeedback }>
  /** Blocks slide keyboard navigation while a game owns the keyboard. */
  setKeyboardLocked?(locked: boolean): void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className = 'le-board__action'): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  return b
}

let widgetCounter = 0

export interface AnswerOutcome {
  /** Null when the score is withheld (evidence on a student's device). */
  result: { correct: number; total: number } | null
  feedback: ActivityFeedback | null
  attemptsLeft?: number
}

export interface AnswerFormOptions {
  submit(answer: BoardAnswer): Promise<AnswerOutcome>
  submitLabel: string
  /** Whether "try again" is offered after this outcome. */
  retryable(outcome: AnswerOutcome): boolean
}

/**
 * Radio-group answer form for choice/truefalse/classify, shared by the board
 * ("do it together") and student devices. Correctness always comes from the
 * server's outcome; the form never knows a key. It holds no outside
 * resources, so re-rendering is the whole reset.
 */
export function renderAnswerForm(host: HTMLElement, activity: ActivityView, options: AnswerFormOptions): void {
  const widget = el('form', 'le-interactive')
  widget.noValidate = true
  const selection = new Map<string, string>()
  const questions = boardQuestions(activity)
  const prefix = `le-q${++widgetCounter}`
  const fieldsets = new Map<string, HTMLFieldSetElement>()

  if (activity.mechanic !== 'choice' && isLocalized(activity.config.prompt)) {
    widget.append(richElement('p', activity.config.prompt.uk, 'le-activity__prompt'))
  }

  for (const question of questions) {
    const fieldset = el('fieldset', 'le-interactive__question')
    const legend = el('legend', 'le-interactive__legend')
    appendRichText(legend, question.label)
    fieldset.append(legend)
    const choices = el('div', 'le-interactive__choices')
    for (const option of question.options) {
      const label = el('label', 'le-interactive__option')
      const input = el('input')
      input.type = 'radio'
      input.name = `${prefix}-${question.id}`
      input.value = option.value
      input.addEventListener('change', () => {
        selection.set(question.id, option.value)
        submit.disabled = answerFromSelection(activity, selection) === null
      })
      const text = el('span')
      appendRichText(text, option.label)
      label.append(input, text)
      choices.append(label)
    }
    const verdict = el('p', 'le-interactive__verdict')
    verdict.hidden = true
    fieldset.append(choices, verdict)
    fieldsets.set(question.id, fieldset)
    widget.append(fieldset)
  }

  const actions = el('div', 'le-interactive__actions')
  const submit = button(options.submitLabel, 'le-board__action le-board__action--primary')
  submit.type = 'submit'
  submit.disabled = true
  const retry = button('Спробувати ще раз')
  retry.hidden = true
  actions.append(submit, retry)
  const summary = el('div', 'le-interactive__summary')
  summary.setAttribute('role', 'status')
  widget.append(actions, summary)

  function markVerdict(questionId: string, correct: boolean) {
    const fieldset = fieldsets.get(questionId)
    if (!fieldset) return
    fieldset.classList.add(correct ? 'le-interactive__question--correct' : 'le-interactive__question--wrong')
    const verdict = fieldset.querySelector<HTMLElement>('.le-interactive__verdict')!
    verdict.textContent = correct ? '✓ Правильно' : '✗ Неправильно'
    verdict.hidden = false
  }

  widget.addEventListener('submit', async event => {
    event.preventDefault()
    const answer = answerFromSelection(activity, selection)
    if (!answer) return
    submit.disabled = true
    summary.replaceChildren(el('p', undefined, 'Перевіряємо…'))
    try {
      const outcome = await options.submit(answer)
      const { result, feedback } = outcome
      for (const input of widget.querySelectorAll('input')) input.disabled = true
      for (const item of feedback?.items ?? []) {
        // A choice is one question; its verdict belongs to that question.
        markVerdict(activity.mechanic === 'choice' ? 'choice' : item.id, item.correct)
      }
      const lines = [el('p', 'le-interactive__score', result ? `Правильно: ${result.correct} з ${result.total}` : '✓ Відповідь збережено')]
      if (feedback?.explanation) lines.push(richElement('p', feedback.explanation.uk, 'le-interactive__explanation'))
      summary.replaceChildren(...lines)
      submit.hidden = true
      if (options.retryable(outcome)) {
        retry.hidden = false
        retry.focus()
      }
    } catch (err) {
      const alert = el('p', 'le-interactive__error', (err as Error).message || 'Не вдалося перевірити відповідь.')
      alert.setAttribute('role', 'alert')
      summary.replaceChildren(alert)
      submit.disabled = false
    }
  })

  retry.addEventListener('click', () => renderAnswerForm(host, activity, options))

  host.replaceChildren(widget)
  widget.querySelector('input')?.focus()
}

function renderTogether(host: HTMLElement, activity: ActivityView, deps: BoardActivityDeps): void {
  renderAnswerForm(host, activity, {
    submitLabel: 'Перевірити',
    submit: async answer => deps.check(activity.instanceId, answer),
    retryable: () => true,
  })
}

function renderGame(host: HTMLElement, lesson: LessonDefinition, activity: ActivityView, deps: BoardActivityDeps): () => void {
  const gameKey = String(activity.config.gameKey ?? '')
  const levelId = String(activity.config.level ?? '')
  const info = findActivity(gameKey)
  const level = info ? findActivityLevel(info, levelId) : null
  const panel = el('div', 'le-game')
  if (!info || !level) {
    panel.append(el('p', 'le-interactive__error', 'Гру не знайдено.'))
    host.replaceChildren(panel)
    return () => {}
  }

  panel.append(el('p', 'le-game__title', `${info.label} · ${level.label}`))
  if (isLocalized(activity.config.instructions)) panel.append(richElement('p', activity.config.instructions.uk, 'le-game__hint'))
  const start = button('Запустити гру', 'le-board__action le-board__action--primary')
  const stop = button('Зупинити гру')
  stop.hidden = true
  const stage = el('div', 'le-game__stage')
  const status = el('p', 'le-game__status')
  status.setAttribute('role', 'status')
  panel.append(start, stop, stage, status)
  host.replaceChildren(panel)

  let handle: ActivityHandle | null = null
  let disposed = false

  function unmount() {
    handle?.destroy()
    handle = null
    stage.replaceChildren()
    deps.setKeyboardLocked?.(false)
    stop.hidden = true
    start.hidden = false
  }

  function finish(run: ActivityRunResult) {
    const result = gameResultEnvelope(activity.instanceId, run)
    unmount()
    status.textContent = `Готово: ${result.correct} з ${result.total}`
    start.textContent = 'Зіграти ще раз'
    start.focus()
  }

  start.addEventListener('click', async () => {
    if (window.innerWidth < info.minWidth) {
      status.textContent = 'Ця гра потребує ширшого екрана.'
      return
    }
    start.disabled = true
    status.textContent = ''
    try {
      const { mount } = await info.load()
      if (disposed) return
      deps.setKeyboardLocked?.(true)
      handle = mount(stage, { level: level.id, grade: lesson.grade, onFinish: finish })
      start.hidden = true
      stop.hidden = false
    } catch {
      status.textContent = 'Не вдалося завантажити гру.'
    } finally {
      start.disabled = false
    }
  })
  stop.addEventListener('click', () => {
    const partial = handle?.snapshot()
    unmount()
    if (partial) status.textContent = `Зупинено: ${partial.correct} з ${partial.total}`
    start.focus()
  })

  return () => {
    disposed = true
    unmount()
  }
}

/**
 * Adds the board controls for an activity slide. Returns a cleanup that the
 * board calls when leaving the slide or closing.
 */
export function attachBoardActivity(
  slide: HTMLElement,
  lesson: LessonDefinition,
  activity: ActivityView,
  deps: BoardActivityDeps,
): () => void {
  const mode = boardActivityMode(activity)
  const readOnly = slide.querySelector<HTMLElement>('.le-activity--board')
  const host = el('div', 'le-board__activity')
  let cleanup: () => void = () => {}

  if (mode === 'students-only') {
    host.append(el('p', 'le-board__note', 'Цю перевірку учні виконують самостійно на своїх пристроях.'))
  } else if (mode === 'together') {
    const startTogether = button('Виконати разом', 'le-board__action le-board__action--primary')
    startTogether.addEventListener('click', () => {
      readOnly?.remove()
      renderTogether(host, activity, deps)
    })
    host.append(startTogether)
  } else if (mode === 'game') {
    cleanup = renderGame(host, lesson, activity, deps)
  }

  if (host.childElementCount > 0) slide.append(host)
  return () => cleanup()
}
