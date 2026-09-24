// Teacher run console (stage F): conduct one prepared lesson with a class.
// The server is the source of truth for status and current step — every
// button calls the API and re-renders from the returned run, so a reload or a
// second tab always shows the real state.

import { showConfirm } from '../../utils/ui.js'
import { renderLessonBlock } from './document-view.js'
import { openPresentation } from './presentation-view.js'
import { BLOCK_TYPE_LABELS, presentationSlides } from './projection.js'
import {
  RUN_ACTION_LABELS,
  RUN_STATUS_LABELS,
  canNavigate,
  runLifecycleActions,
  stepAttachments,
  stepTitle,
} from './run-model.js'
import type { BoardActivityDeps } from './activity-board.js'
import type { LessonRunAction, LessonRunView } from './types.js'

export interface RunConsoleDeps {
  act(action: LessonRunAction): Promise<LessonRunView>
  setStep(stepIndex: number): Promise<LessonRunView>
  check: BoardActivityDeps['check']
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className: string): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  return b
}

const CONFIRM_ACTIONS: Partial<Record<LessonRunAction, string>> = {
  finish: 'Завершити урок? Після завершення його не можна буде продовжити.',
  cancel: 'Скасувати урок?',
}

export function mountRunConsole(root: HTMLElement, initial: LessonRunView, deps: RunConsoleDeps): void {
  let view = initial
  const status = el('p', 'le-console__status')
  status.setAttribute('role', 'status')

  // Every server call runs through one queue, in order: nothing is dropped
  // and no two calls race each other.
  let queue: Promise<void> = Promise.resolve()
  function perform(task: () => Promise<LessonRunView>): Promise<void> {
    queue = queue.then(async () => {
      root.setAttribute('aria-busy', 'true')
      status.textContent = ''
      try {
        view = await task()
        render()
      } catch (err) {
        status.textContent = (err as Error).message || 'Не вдалося виконати дію.'
      } finally {
        root.removeAttribute('aria-busy')
      }
    })
    return queue
  }

  // Rapid navigation (several arrow presses on the board) coalesces into one
  // request for the latest wanted step instead of one request per press.
  let wantedStep: number | null = null
  let stepQueued = false
  function goToStep(index: number) {
    wantedStep = index
    if (stepQueued) return
    stepQueued = true
    void perform(() => {
      stepQueued = false
      const target = wantedStep!
      wantedStep = null
      return target === view.run.currentStepIndex ? Promise.resolve(view) : deps.setStep(target)
    })
  }

  function present() {
    const { lesson, run } = view
    const slides = presentationSlides(lesson)
    const startBlockId = slides.some(slide => slide.blockId === run.currentBlockId) ? run.currentBlockId : undefined
    openPresentation(lesson, {
      startBlockId,
      activities: { check: deps.check },
      // The board follows the run: moving to a slide that is a step moves the run.
      onSlideChange: blockId => {
        const index = view.run.steps.indexOf(blockId)
        if (index >= 0 && canNavigate(view.run.status)) goToStep(index)
      },
    })
  }

  function render() {
    const { run, lesson } = view
    const blocks = new Map(lesson.blocks.map(block => [block.id, block]))
    const attachments = stepAttachments(lesson, run.steps)
    const navigable = canNavigate(run.status)

    const header = el('header', 'le-console__header')
    header.append(el('p', 'le-document__meta', `${run.className} · крок ${run.currentStepIndex + 1} з ${run.steps.length}`))
    const h1 = el('h1', 'le-document__title', lesson.title.uk)
    h1.id = 'le-console-title'
    const badge = el('span', `le-console__badge le-console__badge--${run.status}`, RUN_STATUS_LABELS[run.status])
    header.append(h1, badge)

    const controls = el('div', 'le-console__controls')
    controls.setAttribute('role', 'toolbar')
    controls.setAttribute('aria-label', 'Керування уроком')
    if (navigable) {
      const back = button('← Назад', 'le-board__action')
      back.disabled = run.currentStepIndex === 0
      back.addEventListener('click', () => goToStep(run.currentStepIndex - 1))
      const next = button('Далі →', 'le-board__action le-board__action--primary')
      next.disabled = run.currentStepIndex >= run.steps.length - 1
      next.addEventListener('click', () => goToStep(run.currentStepIndex + 1))
      const board = button('Показати на дошці', 'le-board__action')
      board.addEventListener('click', present)
      controls.append(back, next, board)
    }
    for (const action of runLifecycleActions(run.status)) {
      const primary = action === 'start' || action === 'resume'
      const control = button(RUN_ACTION_LABELS[action], `le-board__action${primary ? ' le-board__action--primary' : ''}`)
      control.dataset.action = action
      control.addEventListener('click', () => {
        const question = CONFIRM_ACTIONS[action]
        const run = () => void perform(() => deps.act(action))
        if (question) showConfirm(question, run)
        else run()
      })
      controls.append(control)
    }
    if (run.status === 'finished' || run.status === 'cancelled') {
      const done = el('p', 'le-console__done')
      done.append(`Урок ${RUN_STATUS_LABELS[run.status].toLowerCase()}. `)
      const back = el('a', undefined, 'До списку уроків')
      back.href = 'lesson-engine.html'
      done.append(back)
      controls.append(done)
    }
    if (run.status === 'paused') {
      controls.append(el('p', 'le-console__paused', 'Пауза: можна повернутися до пояснення й продовжити.'))
    }

    const layout = el('div', 'le-console__layout')
    const nav = el('nav', 'le-console__steps')
    nav.setAttribute('aria-label', 'Кроки уроку')
    const list = el('ol', 'le-console__step-list')
    run.steps.forEach((blockId, index) => {
      const block = blocks.get(blockId)
      const item = el('li')
      const label = `${BLOCK_TYPE_LABELS[block?.type ?? 'explanation']}: ${stepTitle(block, blockId)}`
      const stepButton = button(`${index + 1}. ${label}`, 'le-console__step')
      if (index === run.currentStepIndex) {
        stepButton.setAttribute('aria-current', 'step')
        stepButton.classList.add('le-console__step--current')
      }
      stepButton.disabled = !navigable
      stepButton.addEventListener('click', () => goToStep(index))
      item.append(stepButton)
      list.append(item)
    })
    nav.append(list)

    const current = el('section', 'le-console__current')
    current.setAttribute('aria-label', 'Поточний крок')
    const currentBlock = blocks.get(run.currentBlockId)
    if (currentBlock) current.append(renderLessonBlock(lesson, currentBlock, {}, 'section'))
    for (const extra of attachments.get(run.currentBlockId) ?? []) current.append(renderLessonBlock(lesson, extra, {}, 'section'))

    layout.append(nav, current)
    root.replaceChildren(header, controls, status, layout)
  }

  render()
}
