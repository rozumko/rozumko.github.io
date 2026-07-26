import { createFocusTrap } from './focus-trap.js'

/**
 * Full-screen view of a question image. Some questions carry a real picture —
 * a Scratch program, a diagram — and the thumbnail beside the question is too
 * small to read: the child must be able to open it, look, and close it again.
 *
 * The overlay is built once on first use, so a surface only needs to call
 * `openLightbox`; there is no per-page markup to keep in sync. Escape, the
 * close button and a click on the backdrop all close it, and focus is trapped
 * while it is open.
 */
let root: HTMLElement | null = null
let image: HTMLImageElement | null = null
let releaseTrap: (() => void) | null = null

function build(): void {
  root = document.createElement('div')
  root.id = 'img-lightbox'
  root.className = 'lightbox hidden'
  root.tabIndex = -1
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Збільшене зображення')

  image = document.createElement('img')
  image.className = 'lightbox__img'
  image.alt = ''

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'lightbox__close'
  close.setAttribute('aria-label', 'Закрити зображення')
  close.textContent = '×'

  root.append(image, close)
  // The surfaces underneath bind Escape too (a mission exits, a dialog closes).
  // The topmost layer owns the key: the focus trap still closes the lightbox,
  // but the event stops here instead of also ending the child's mission.
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.stopPropagation()
  })
  root.addEventListener('click', event => {
    const target = event.target as HTMLElement
    if (target === root || target.closest('.lightbox__close')) closeLightbox()
  })
  document.body.appendChild(root)
}

export function openLightbox(src: string, alt: string): void {
  if (!src) return
  if (!root || !image) build()
  if (!root || !image) return
  image.src = src
  image.alt = alt || ''
  root.classList.remove('hidden')
  releaseTrap?.()
  releaseTrap = createFocusTrap(root, closeLightbox)
}

export function closeLightbox(): void {
  if (!root || !image) return
  releaseTrap?.()
  releaseTrap = null
  root.classList.add('hidden')
  image.src = ''
}
