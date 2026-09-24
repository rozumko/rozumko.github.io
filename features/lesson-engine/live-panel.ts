// Live class state in the run console (stage G2): send the current activity
// to devices, close it, and watch the class grid. The grid is evidence for the
// teacher's decision — states are words and icons, never colour alone — and a
// shared wrong choice is surfaced as a fact, not a verdict.

import { BLOCK_TYPE_LABELS } from './projection.js'
import { appendRichText } from './rich-text.js'
import { LIVE_STATE_LABELS, isOpenRun, isSendable, liveCellText, liveSummary, stepTitle } from './run-model.js'
import type { LessonRunView, LiveSnapshot } from './types.js'

export interface LivePanelDeps {
  getLive(): Promise<LiveSnapshot>
  dispatch(blockId: string): Promise<LiveSnapshot>
  closeDispatch(): Promise<LiveSnapshot>
}

export interface LivePanel {
  element: HTMLElement
  update(view: LessonRunView): void
  destroy(): void
}

const POLL_MS = 2000

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function mountLivePanel(initial: LessonRunView, deps: LivePanelDeps): LivePanel {
  let view = initial
  let live: LiveSnapshot | null = null
  let timer: number | null = null
  let destroyed = false

  const root = el('section', 'le-live')
  root.setAttribute('aria-labelledby', 'le-live-title')
  const title = el('h2', 'le-join__title', 'Учні на пристроях')
  title.id = 'le-live-title'
  const actions = el('div', 'le-join__actions')
  const summary = el('p', 'le-live__summary')
  summary.setAttribute('aria-live', 'polite')
  const pattern = el('p', 'le-live__pattern')
  const message = el('p', 'le-join__message')
  message.setAttribute('role', 'status')
  const grid = el('div', 'le-live__grid')
  root.append(title, actions, summary, pattern, message, grid)

  const blocks = () => new Map(view.lesson.blocks.map(block => [block.id, block]))

  async function act(task: () => Promise<LiveSnapshot>) {
    message.textContent = ''
    try {
      live = await task()
      render()
    } catch (err) {
      message.textContent = (err as Error).message || 'Не вдалося виконати дію.'
    }
  }

  function renderActions() {
    actions.replaceChildren()
    const open = live?.dispatches.find(d => d.open) ?? null
    const current = blocks().get(view.run.currentBlockId)
    if (view.run.status === 'active' && isSendable(current) && open?.blockId !== current!.id) {
      const send = el('button', 'le-board__action le-board__action--primary', 'Надіслати учням')
      send.type = 'button'
      send.addEventListener('click', () => void act(() => deps.dispatch(current!.id)))
      actions.append(send)
    }
    if (open) {
      const close = el('button', 'le-board__action', 'Закрити завдання')
      close.type = 'button'
      close.addEventListener('click', () => void act(deps.closeDispatch))
      actions.append(close)
    }
  }

  function renderGrid() {
    if (!live || live.dispatches.length === 0) {
      summary.textContent = view.run.status === 'active' ? 'Ще нічого не надіслано.' : ''
      pattern.replaceChildren()
      grid.replaceChildren()
      return
    }
    const open = live.dispatches.find(d => d.open) ?? null
    const focus = open ?? live.dispatches[live.dispatches.length - 1]!
    summary.textContent = `${open ? 'Зараз на пристроях' : 'Останнє завдання'}: ${liveSummary(live, focus.id)}`
    pattern.replaceChildren()
    if (focus.pattern) {
      pattern.append(`${focus.pattern.count} з ${focus.pattern.of} учнів обрали однакову неправильну відповідь: «`)
      appendRichText(pattern, focus.pattern.optionText.uk)
      pattern.append('».')
    }

    const byId = blocks()
    const table = el('table', 'le-live__table')
    table.append(el('caption', 'le-live__caption', 'Стан класу за завданнями'))
    const head = el('tr')
    head.append(el('th', undefined, 'Учень'))
    for (const dispatch of live.dispatches) {
      const block = byId.get(dispatch.blockId)
      const th = el('th', undefined, `${stepTitle(block, BLOCK_TYPE_LABELS.activity)}${dispatch.open ? ' (зараз)' : ''}`)
      th.scope = 'col'
      head.append(th)
    }
    const thead = el('thead')
    thead.append(head)
    const tbody = el('tbody')
    for (const student of live.students) {
      const row = el('tr')
      const th = el('th', 'le-live__student')
      th.scope = 'row'
      th.append(el('span', undefined, student.label))
      th.append(el('span', `le-live__presence le-live__presence--${student.online ? 'on' : 'off'}`,
        student.hasDevice ? (student.online ? 'на зв’язку' : 'немає зв’язку') : 'без пристрою'))
      row.append(th)
      for (const dispatch of live.dispatches) {
        const cell = student.cells[dispatch.id]
        const td = el('td', `le-live__cell le-live__cell--${cell?.state ?? 'not-started'}`, cell ? liveCellText(cell) : '')
        if (cell) td.title = `${LIVE_STATE_LABELS[cell.state].text}; спроб: ${cell.attempts}`
        row.append(td)
      }
      tbody.append(row)
    }
    table.append(thead, tbody)
    grid.replaceChildren(table)
  }

  function render() {
    root.hidden = view.run.status === 'prepared'
    renderActions()
    renderGrid()
  }

  async function poll() {
    if (destroyed) return
    try {
      live = await deps.getLive()
      render()
    } catch {
      /* transient: next poll retries */
    }
  }

  function schedule() {
    if (timer !== null) window.clearInterval(timer)
    timer = isOpenRun(view.run.status)
      ? window.setInterval(() => { if (document.visibilityState === 'visible') void poll() }, POLL_MS)
      : null
  }

  function update(next: LessonRunView) {
    const statusChanged = next.run.status !== view.run.status
    view = next
    render()
    if (statusChanged || timer === null) schedule()
  }

  render()
  schedule()
  void poll()

  return {
    element: root,
    update,
    destroy() {
      destroyed = true
      if (timer !== null) window.clearInterval(timer)
    },
  }
}
