// Rozumko mascot with a speech bubble. A single asset is mirrored via `side`
// so the character always faces its message (see .mascot--right flip in CSS).
// Decorative: the image is aria-hidden and the bubble text carries the meaning.

const MASCOT_SRC = '/assets/basics/rozumko-mascot.webp'

export type MascotSide = 'left' | 'right'

export interface MascotOptions {
  message: string
  /** Which edge the mascot stands on; the bubble sits toward the centre. */
  side?: MascotSide
  /** Celebratory bounce for completion screens. */
  celebrate?: boolean
}

export function renderMascot(host: HTMLElement, opts: MascotOptions): void {
  const side = opts.side ?? 'left'
  host.textContent = ''

  const wrap = document.createElement('div')
  wrap.className = `rz-mascot rz-mascot--${side}${opts.celebrate ? ' rz-mascot--celebrate' : ''}`

  const bubble = document.createElement('p')
  bubble.className = 'rz-mascot__bubble'
  bubble.textContent = opts.message

  const img = document.createElement('img')
  img.className = 'rz-mascot__img'
  img.src = MASCOT_SRC
  img.alt = ''
  img.width = 128
  img.height = 128
  img.setAttribute('aria-hidden', 'true')
  img.setAttribute('loading', 'lazy')

  // Mascot faces the bubble: on the left it looks right (natural), on the
  // right it is mirrored so it still looks inward toward the text.
  if (side === 'left') wrap.append(img, bubble)
  else wrap.append(bubble, img)

  host.append(wrap)
}
