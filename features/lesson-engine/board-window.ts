// Presenter side of the projector window. The teacher keeps the lesson plan
// (or the run console) in this window and drives the slides shown in a second
// window (lesson-board.html) that sits on the projector. This page owns the
// current slide; the board only renders what it is told.
//
// If the browser blocks the new window, the full-screen overlay on this page
// (presentation-view.ts) is the fallback.

import { openPresentation, slideHeadline } from './presentation-view.js'
import { presentationSlides, type PresentationSlide } from './projection.js'
import {
  BOARD_CHANNEL,
  BOARD_PAGE,
  BOARD_WINDOW_NAME,
  boardLesson,
  parseBoardMessage,
  type BoardMessage,
} from './board-protocol.js'
import type { BoardActivityDeps } from './activity-board.js'
import type { BoardAnswer, LessonDefinition } from './types.js'

const CLOSED_POLL_MS = 1000

export interface BoardWindowOptions {
  /** Server check for "do it together" on the board. Omitted → read-only slides. */
  check?: BoardActivityDeps['check']
  /** The class screen moved to another slide (by the teacher here or on the board). */
  onSlideChange?: (blockId: string) => void
}

export interface BoardWindowController {
  readonly element: HTMLElement
  /** Opens (or re-takes) the projector window at a slide. Must run inside a click. */
  open(startBlockId?: string): void
  /**
   * Follows the lesson from outside (the run moved); silent, no onSlideChange.
   * While closed it only sets where the next open starts. True when the
   * projector is open and now shows that slide.
   */
  follow(blockId: string): boolean
  /** Hides the controls, e.g. once the lesson is finished. */
  setEnabled(enabled: boolean): void
  close(): void
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

function newSession(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function slideLabel(slide: PresentationSlide | undefined): string {
  if (!slide) return ''
  return slideHeadline(slide)?.uk.replace(/\*\*|`/g, '') ?? ''
}

/** Keys a presentation clicker or keyboard sends; form controls keep theirs. */
function slideKeyDelta(event: KeyboardEvent): number {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0
  const target = event.target
  if (target instanceof Element && target.closest('input, select, textarea, [contenteditable="true"], .le-board, .le-interactive')) return 0
  if (event.key === 'PageDown') return 1
  if (event.key === 'PageUp') return -1
  if (target instanceof HTMLButtonElement) return 0
  if (event.key === 'ArrowRight') return 1
  if (event.key === 'ArrowLeft') return -1
  return 0
}

export function mountBoardWindow(lesson: LessonDefinition, options: BoardWindowOptions = {}): BoardWindowController {
  const slides = presentationSlides(lesson)
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(BOARD_CHANNEL) : null

  let session: string | null = null
  let boardWindow: Window | null = null
  let closedTimer: number | undefined
  let index = 0
  let enabled = true

  const element = el('section', 'le-presenter')
  element.setAttribute('aria-label', 'Показ на проєкторі')
  const status = el('p', 'le-presenter__status')
  status.setAttribute('role', 'status')

  const openButton = button('🖥 Відкрити на проєкторі', 'le-board__action le-board__action--primary')
  const hereButton = button('На весь екран тут', 'le-board__action')
  const prev = button('← Слайд', 'le-board__action')
  const next = button('Слайд →', 'le-board__action le-board__action--primary')
  const closeButton = button('Закрити проєктор', 'le-board__action')
  const now = el('p', 'le-presenter__now')
  now.setAttribute('aria-live', 'polite')
  const upcoming = el('p', 'le-presenter__next')
  const help = el('p', 'le-presenter__help',
    'Перетягніть нове вікно на екран проєктора й натисніть там «На весь екран». Гортати: кнопки тут, ←/→ або пульт (PageUp/PageDown).')

  const idle = el('div', 'le-presenter__row')
  idle.append(openButton, hereButton)
  const live = el('div', 'le-presenter__row')
  live.append(prev, now, next, closeButton)
  element.append(idle, live, upcoming, help, status)

  function isOpen(): boolean {
    return session !== null
  }

  function post(message: BoardMessage) {
    channel?.postMessage(message)
  }

  function render() {
    element.hidden = !enabled || slides.length === 0
    idle.hidden = isOpen()
    live.hidden = !isOpen()
    help.hidden = !isOpen()
    upcoming.hidden = !isOpen()
    openButton.disabled = !channel
    if (!isOpen()) return
    const slide = slides[index]
    now.textContent = `Слайд ${index + 1} з ${slides.length}: ${slideLabel(slide)}`
    const following = slides[index + 1]
    upcoming.textContent = following ? `Далі: ${slideLabel(following)}` : 'Це останній слайд.'
    prev.disabled = index === 0
    next.disabled = index >= slides.length - 1
  }

  function indexOf(blockId: string | undefined): number {
    return blockId ? slides.findIndex(slide => slide.blockId === blockId) : -1
  }

  function detach(message?: string) {
    session = null
    boardWindow = null
    window.clearInterval(closedTimer)
    closedTimer = undefined
    status.textContent = message ?? ''
    render()
  }

  function moveTo(target: number, notify: boolean) {
    const bounded = Math.min(Math.max(target, 0), slides.length - 1)
    if (bounded === index) return
    index = bounded
    const blockId = slides[index]!.blockId
    if (session) post({ type: 'show', session, blockId })
    render()
    if (notify) options.onSlideChange?.(blockId)
  }

  function claim() {
    if (!session) return
    post({ type: 'claim', session, lesson: boardLesson(lesson, slides), blockId: slides[index]!.blockId })
  }

  async function answerCheck(message: Extract<BoardMessage, { type: 'check' }>) {
    const reply = (body: { result?: unknown; error?: string }) =>
      post({ type: 'check-result', session: message.session, requestId: message.requestId, ...body })
    if (!options.check) {
      reply({ error: 'Перевірка на дошці недоступна.' })
      return
    }
    try {
      reply({ result: await options.check(message.instanceId, message.answer as BoardAnswer) })
    } catch (err) {
      reply({ error: (err as Error).message || 'Не вдалося перевірити відповідь.' })
    }
  }

  channel?.addEventListener('message', event => {
    const message = parseBoardMessage(event.data)
    if (!message) return
    // A board that loads (or reloads) while we hold it gets the lesson again.
    if (message.type === 'hello') {
      if (session) claim()
      return
    }
    if (!session || !('session' in message) || message.session !== session) return
    if (message.type === 'slide') {
      const target = indexOf(message.blockId)
      if (target >= 0) moveTo(target, true)
    } else if (message.type === 'closed') {
      detach('Вікно проєктора закрито.')
    } else if (message.type === 'check') {
      void answerCheck(message)
    }
  })

  function open(startBlockId?: string) {
    if (slides.length === 0) return
    const start = indexOf(startBlockId)
    if (start >= 0) index = start
    if (!channel) {
      openHere()
      return
    }
    // Re-use the projector window if it is already open, so it keeps its
    // place on the projector screen (and full screen, when it has it).
    const win = window.open('', BOARD_WINDOW_NAME, 'popup,width=1280,height=720')
    if (!win) {
      status.textContent = 'Браузер заблокував нове вікно. Дозвольте спливні вікна для цього сайту або покажіть урок на весь екран тут.'
      openHere()
      return
    }
    let onBoardPage: boolean
    try {
      onBoardPage = win.location.pathname.endsWith(`/${BOARD_PAGE}`)
    } catch {
      onBoardPage = false
    }
    session = newSession()
    boardWindow = win
    status.textContent = ''
    if (onBoardPage) claim()
    else win.location.href = new URL(BOARD_PAGE, location.href).href
    window.clearInterval(closedTimer)
    closedTimer = window.setInterval(() => {
      if (boardWindow?.closed) detach('Вікно проєктора закрито.')
    }, CLOSED_POLL_MS)
    render()
  }

  function openHere() {
    const start = slides[index]?.blockId
    openPresentation(lesson, {
      startBlockId: start,
      activities: options.check ? { check: options.check } : undefined,
      onSlideChange: blockId => {
        index = Math.max(0, indexOf(blockId))
        options.onSlideChange?.(blockId)
      },
    })
  }

  function close() {
    if (session) post({ type: 'end', session })
    try { boardWindow?.close() } catch { /* the board closes itself on "end" */ }
    detach()
  }

  document.addEventListener('keydown', event => {
    if (!isOpen() || !enabled) return
    const delta = slideKeyDelta(event)
    if (delta === 0) return
    event.preventDefault()
    moveTo(index + delta, true)
  })
  // Leaving or reloading this page leaves the board on its last slide: the next
  // "open" re-takes the same window without losing its place or full screen.

  openButton.addEventListener('click', () => open())
  hereButton.addEventListener('click', openHere)
  prev.addEventListener('click', () => moveTo(index - 1, true))
  next.addEventListener('click', () => moveTo(index + 1, true))
  closeButton.addEventListener('click', close)
  render()

  return {
    element,
    open,
    follow(blockId) {
      const target = indexOf(blockId)
      if (target >= 0) moveTo(target, false)
      return target >= 0 && isOpen()
    },
    setEnabled(value) {
      enabled = value
      if (!value) close()
      render()
    },
    close,
  }
}
