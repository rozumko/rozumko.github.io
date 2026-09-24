// Board view: one authored slide at a time, large type, minimal chrome. Only
// presentationSlides() decides what can appear here, so teacher notes, speaker
// hints and answer keys have no path onto the class screen.

import { createFocusTrap } from '../../utils/focus-trap.js'
import { richElement } from './rich-text.js'
import { presentationSlides, type PresentationSlide } from './projection.js'
import { renderActivityBody, renderFigure } from './document-view.js'
import { attachBoardActivity, type BoardActivityDeps } from './activity-board.js'
import type { LessonDefinition, LocalizedText } from './types.js'

const SWIPE_THRESHOLD_PX = 50

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function isLocalized(value: unknown): value is LocalizedText {
  return typeof value === 'object' && value !== null && typeof (value as LocalizedText).uk === 'string'
}

/** Headline falls back to the block's own title/question so no slide is blank. */
export function slideHeadline(slide: PresentationSlide): LocalizedText | null {
  if (slide.presentation.headline) return slide.presentation.headline
  const content = slide.block.content
  for (const key of ['title', 'question', 'heading', 'prompt'] as const) {
    if (isLocalized(content[key])) return content[key] as LocalizedText
  }
  return null
}

export function renderSlide(slide: PresentationSlide): HTMLElement {
  const { layout, shortText } = slide.presentation
  const root = el('section', `le-slide le-slide--${layout}`)
  root.dataset.blockId = slide.blockId

  const headline = slideHeadline(slide)
  if (headline) {
    const h = richElement('h2', headline.uk, 'le-slide__headline')
    if (layout === 'title' && headline.en && headline.en !== headline.uk) h.append(el('span', 'le-slide__en', headline.en))
    root.append(h)
  }

  if (shortText?.length) {
    const list = el('ul', 'le-slide__points')
    for (const point of shortText) list.append(richElement('li', point.uk))
    root.append(list)
  }

  for (const asset of slide.assets) root.append(renderFigure(asset.src, asset.alt.uk, asset.caption?.uk))

  if (layout === 'activity-launcher' && slide.block.activity) {
    root.append(renderActivityBody(slide.block.activity, 'board'))
  }
  return root
}

export interface PresentationHandle {
  close(): void
  goTo(index: number): void
  /** Shows a slide without reporting it through onSlideChange (the caller already knows). */
  showBlock(blockId: string): void
  readonly index: number
}

export interface PresentationOptions {
  startBlockId?: string
  onClose?: () => void
  /** Enables board activities ("do it together", games). Omitted → read-only slides. */
  activities?: Pick<BoardActivityDeps, 'check'>
  /** Called after the teacher moves to another slide (not on opening). */
  onSlideChange?: (blockId: string) => void
  /** Adds a "full screen" button (a separate projector window cannot enter full screen on its own). */
  fullscreenButton?: boolean
  /** Label of the button that ends the show. */
  closeLabel?: string
}

/**
 * Opens the board as a full-screen dialog over the page. Keyboard: ←/→,
 * PageUp/PageDown, Space, Home/End, Escape. Touch: horizontal swipe.
 */
export function openPresentation(lesson: LessonDefinition, options: PresentationOptions = {}): PresentationHandle | null {
  const slides = presentationSlides(lesson)
  if (slides.length === 0) return null

  const overlay = el('div', 'le-board')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', `Показ на дошці: ${lesson.title.uk}`)

  const stage = el('div', 'le-board__stage')
  const bar = el('div', 'le-board__bar')
  const prev = el('button', 'le-board__nav', '← Назад')
  const next = el('button', 'le-board__nav', 'Далі →')
  const counter = el('p', 'le-board__counter')
  counter.setAttribute('aria-live', 'polite')
  const close = el('button', 'le-board__close', options.closeLabel ?? 'Завершити показ')
  for (const button of [prev, next, close]) button.type = 'button'
  bar.append(prev, counter, next, close)
  let fullscreen: HTMLButtonElement | null = null
  if (options.fullscreenButton) {
    fullscreen = el('button', 'le-board__nav le-board__fullscreen', '⛶ На весь екран')
    fullscreen.type = 'button'
    close.before(fullscreen)
  }
  overlay.append(stage, bar)

  let index = Math.max(0, slides.findIndex(slide => slide.blockId === options.startBlockId))

  // Cleanup of the current slide's activity (e.g. a running game).
  let leaveSlide: () => void = () => {}
  // A running game owns the keyboard; slide shortcuts pause until it stops.
  let keyboardLocked = false
  const activityDeps: BoardActivityDeps | null = options.activities
    ? { check: options.activities.check, setKeyboardLocked: locked => { keyboardLocked = locked } }
    : null

  function show(target: number, notify = true) {
    const previous = stage.childElementCount > 0 ? index : null
    index = Math.min(Math.max(target, 0), slides.length - 1)
    leaveSlide()
    leaveSlide = () => {}
    keyboardLocked = false
    const slide = slides[index]!
    const slideEl = renderSlide(slide)
    stage.replaceChildren(slideEl)
    if (activityDeps && slide.block.activity) leaveSlide = attachBoardActivity(slideEl, lesson, slide.block.activity, activityDeps)
    counter.textContent = `${index + 1} / ${slides.length}`
    // Disabling a focused button drops focus to <body>; read it first and keep
    // focus inside the dialog.
    const focused = document.activeElement
    prev.disabled = index === 0
    next.disabled = index === slides.length - 1
    if (focused === prev && prev.disabled) next.focus()
    if (focused === next && next.disabled) close.focus()
    if (notify && previous !== null && previous !== index) options.onSlideChange?.(slide.blockId)
  }

  function onKey(event: KeyboardEvent) {
    if (keyboardLocked) return
    if (event.target instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) return
    // Radio groups and other form controls own their arrow keys.
    if (event.target instanceof Element && event.target.closest('input, select, textarea, .le-interactive')) return
    const moves: Record<string, () => number> = {
      ArrowRight: () => index + 1,
      PageDown: () => index + 1,
      ' ': () => index + 1,
      ArrowLeft: () => index - 1,
      PageUp: () => index - 1,
      Home: () => 0,
      End: () => slides.length - 1,
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    show(move())
  }

  let touchStartX: number | null = null
  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse') touchStartX = event.clientX
  }
  function onPointerUp(event: PointerEvent) {
    if (touchStartX === null) return
    const delta = event.clientX - touchStartX
    touchStartX = null
    if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) show(index + (delta < 0 ? 1 : -1))
  }

  let removeTrap: () => void = () => {}
  let closed = false
  function closeBoard() {
    if (closed) return
    closed = true
    leaveSlide()
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('fullscreenchange', syncFullscreenButton)
    removeTrap()
    overlay.remove()
    document.body.classList.remove('le-board-open')
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    options.onClose?.()
  }

  prev.addEventListener('click', () => show(index - 1))
  next.addEventListener('click', () => show(index + 1))
  close.addEventListener('click', closeBoard)
  function syncFullscreenButton() {
    if (fullscreen) fullscreen.hidden = Boolean(document.fullscreenElement)
  }
  fullscreen?.addEventListener('click', () => {
    void overlay.requestFullscreen?.().catch(() => {})
  })
  document.addEventListener('fullscreenchange', syncFullscreenButton)
  stage.addEventListener('pointerdown', onPointerDown)
  stage.addEventListener('pointerup', onPointerUp)
  document.addEventListener('keydown', onKey)

  document.body.append(overlay)
  document.body.classList.add('le-board-open')
  show(index)
  removeTrap = createFocusTrap(overlay, closeBoard)
  if (next.disabled) close.focus()
  else next.focus()
  // Full screen is a convenience; a refused request leaves the overlay usable.
  void overlay.requestFullscreen?.().catch(() => {})

  return {
    close: closeBoard,
    goTo: target => show(target),
    showBlock: blockId => {
      const target = slides.findIndex(slide => slide.blockId === blockId)
      if (target >= 0 && target !== index) show(target, false)
    },
    get index() { return index },
  }
}
