import type { ActivityHandle, ActivityMount, ActivityMountOptions, ActivityRunResult } from '../activity-contract.js'
import { KEYBOARD_ROWS, LETTER_KEYS, PREPLACED_MAX, PREPLACED_MIN, type KeyDef } from './key-puzzle-data.js'
import { closeAudio, playHover, playMiss, playPickup, playPlaced, playSnapBack } from './key-puzzle-audio.js'

// ── Клавіатурний пазл ────────────────────────────────────────────────────────
// The child drags loose letter keys onto an empty keyboard. Ported from the
// standalone game at itnauka.org with three changes for School Mode:
//   1. everything lives inside the given container (no fixed viewport layers),
//   2. the level comes from the teacher instead of an in-game menu,
//   3. the run reports correct/total/mistakes/durationSec via ActivityHandle.
//
// The level only changes hint visibility (see style-activities.css), so the key
// set — and therefore `total` — is the same at every level.

const PIECE_SIZE = 56
const SCATTER_GAP = 10

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Key legend as HTML. Built through textContent so a legend can never inject. */
function keyCapLabels(key: KeyDef): string {
  const top = document.createElement('span')
  top.className = 'kp-key__top'
  top.textContent = key.top ?? ''
  const bottom = document.createElement('span')
  bottom.className = 'kp-key__bottom'
  bottom.textContent = key.bottom ?? ''
  const holder = document.createElement('div')
  holder.append(top, bottom)
  return holder.innerHTML
}

interface Scatter { x1: number; x2: number; y1: number; y2: number }

/** Free space around the board where loose keys can lie. */
function scatterZones(container: DOMRect, board: DOMRect): Scatter[] {
  // Board rect in container coordinates
  const bx1 = board.left - container.left
  const bx2 = board.right - container.left
  const by1 = board.top - container.top
  const by2 = board.bottom - container.top
  const w = container.width
  const h = container.height
  const limit = PIECE_SIZE + SCATTER_GAP

  const zones: Scatter[] = [
    { x1: SCATTER_GAP, x2: w - limit, y1: SCATTER_GAP, y2: by1 - limit },
    { x1: SCATTER_GAP, x2: w - limit, y1: by2 + SCATTER_GAP, y2: h - limit },
    { x1: SCATTER_GAP, x2: bx1 - limit, y1: by1, y2: by2 - PIECE_SIZE },
    { x1: bx2 + SCATTER_GAP, x2: w - limit, y1: by1, y2: by2 - PIECE_SIZE },
  ]
  return zones.filter(z => z.x2 > z.x1 + SCATTER_GAP && z.y2 > z.y1 + SCATTER_GAP)
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options

  const startedAt = Date.now()
  let placedCount = 0
  let mistakes = 0
  let finished = false
  let total = 0

  container.classList.add('kp-root', `kp-level-${level}`)
  container.innerHTML = `
    <div class="kp-board" role="application" aria-label="Клавіатура для збирання">
      <div class="kp-board__inner"></div>
    </div>
    <div class="kp-pieces" aria-live="polite"></div>`

  const boardInner = container.querySelector<HTMLElement>('.kp-board__inner')!
  const board = container.querySelector<HTMLElement>('.kp-board')!
  const piecesLayer = container.querySelector<HTMLElement>('.kp-pieces')!

  // ── Build the keyboard ─────────────────────────────────────────────────────
  const preplacedCount = PREPLACED_MIN + Math.floor(Math.random() * (PREPLACED_MAX - PREPLACED_MIN + 1))
  const shuffled = shuffle(LETTER_KEYS)
  const preplaced = new Set(shuffled.slice(0, preplacedCount).map(k => k.code))
  const pieces = shuffled.slice(preplacedCount)
  total = pieces.length

  for (const row of KEYBOARD_ROWS) {
    const rowEl = document.createElement('div')
    rowEl.className = 'kp-row'
    for (const key of row) {
      const el = document.createElement('div')
      el.className = 'kp-key'
      el.style.width = `${key.w}px`
      if (key.func) {
        el.classList.add('kp-key--func')
        if (!key.space) el.textContent = key.label ?? ''
      } else if (key.letter && !preplaced.has(key.code)) {
        el.classList.add('kp-slot')
        el.dataset.code = key.code
        el.dataset.hintTop = key.top ?? ''
        el.dataset.hintBottom = key.bottom ?? ''
      } else {
        el.innerHTML = keyCapLabels(key)
      }
      rowEl.appendChild(el)
    }
    boardInner.appendChild(rowEl)
  }

  // ── Fit the board ──────────────────────────────────────────────────────────
  // The keyboard is ~840px wide at full size; the stage also has to hold a
  // column of loose keys on each side. Scale down rather than clip.
  function fitBoard() {
    const stage = container.getBoundingClientRect()
    board.style.setProperty('--kp-scale', '1')
    const natural = board.getBoundingClientRect()
    if (natural.width === 0 || natural.height === 0) return
    const room = PIECE_SIZE + SCATTER_GAP * 2
    const scale = Math.min(
      1,
      (stage.width - room * 2) / natural.width,
      (stage.height - room * 2) / natural.height,
    )
    board.style.setProperty('--kp-scale', String(Math.max(0.55, scale)))
  }
  fitBoard()

  // ── Scatter the loose keys ─────────────────────────────────────────────────
  const homePositions = new Map<string, { x: number; y: number }>()

  function layoutPieces() {
    const containerRect = container.getBoundingClientRect()
    const zones = scatterZones(containerRect, board.getBoundingClientRect())
    piecesLayer.querySelectorAll<HTMLElement>('.kp-piece').forEach((el, i) => {
      const code = el.dataset.code!
      if (homePositions.has(code)) return
      const zone = zones[i % Math.max(1, zones.length)]
      const x = zone
        ? zone.x1 + Math.random() * (zone.x2 - zone.x1)
        : SCATTER_GAP + Math.random() * Math.max(1, containerRect.width - PIECE_SIZE - SCATTER_GAP * 2)
      const y = zone
        ? zone.y1 + Math.random() * (zone.y2 - zone.y1)
        : SCATTER_GAP + Math.random() * Math.max(1, containerRect.height * 0.2)
      homePositions.set(code, { x, y })
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    })
  }

  for (const key of pieces) {
    const el = document.createElement('div')
    el.className = 'kp-piece'
    el.dataset.code = key.code
    const tilt = (Math.random() - 0.5) * 14
    el.dataset.tilt = String(tilt)
    el.style.transform = `rotate(${tilt}deg)`
    el.innerHTML = keyCapLabels(key)
    piecesLayer.appendChild(el)
  }
  layoutPieces()
  onProgress?.(0, total)

  // ── Drag & drop ────────────────────────────────────────────────────────────
  // Pointer events cover mouse, pen and touch with one path. The dragged piece
  // gets pointer-events:none so elementFromPoint sees the slot underneath.

  interface Drag { el: HTMLElement; code: string; offsetX: number; offsetY: number; pointerId: number }
  let drag: Drag | null = null
  let hoverSlot: HTMLElement | null = null

  function containerPoint(e: PointerEvent): { x: number; y: number } {
    const rect = container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function slotUnder(e: PointerEvent): HTMLElement | null {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const slot = el?.closest<HTMLElement>('.kp-slot') ?? null
    // Only slots of this board, and only ones still waiting for a key
    return slot && boardInner.contains(slot) ? slot : null
  }

  function clearHover() {
    hoverSlot?.classList.remove('kp-slot--over')
    hoverSlot = null
  }

  function onPointerDown(e: PointerEvent) {
    if (finished || drag) return
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.kp-piece')
    if (!el || !piecesLayer.contains(el)) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    drag = {
      el,
      code: el.dataset.code!,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerId: e.pointerId,
    }
    el.classList.add('kp-piece--dragging')
    playPickup()
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return
    e.preventDefault()
    const { x, y } = containerPoint(e)
    drag.el.style.left = `${x - drag.offsetX}px`
    drag.el.style.top = `${y - drag.offsetY}px`

    const slot = slotUnder(e)
    if (slot === hoverSlot) return
    clearHover()
    if (slot) {
      slot.classList.add('kp-slot--over')
      hoverSlot = slot
      playHover()
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return
    const { el, code } = drag
    const slot = slotUnder(e)
    el.classList.remove('kp-piece--dragging')
    clearHover()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    drag = null

    if (!slot) { snapBack(el, code); playSnapBack(); return }
    if (slot.dataset.code === code) placeCorrect(el, slot, code)
    else missSlot(el, code, slot)
  }

  function snapBack(el: HTMLElement, code: string) {
    const home = homePositions.get(code)
    if (!home) return
    el.classList.add('kp-piece--returning')
    el.style.left = `${home.x}px`
    el.style.top = `${home.y}px`
    window.setTimeout(() => el.classList.remove('kp-piece--returning'), 360)
  }

  function placeCorrect(el: HTMLElement, slot: HTMLElement, code: string) {
    const key = LETTER_KEYS.find(k => k.code === code)
    if (!key) return
    playPlaced()
    placedCount++

    slot.classList.remove('kp-slot', 'kp-slot--over')
    slot.classList.add('kp-key', 'kp-key--just-placed')
    slot.removeAttribute('data-code')
    slot.removeAttribute('data-hint-top')
    slot.removeAttribute('data-hint-bottom')
    slot.innerHTML = keyCapLabels(key)

    // Fly the piece into its slot, then drop it
    const slotRect = slot.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    el.classList.add('kp-piece--landing')
    el.style.left = `${slotRect.left - containerRect.left}px`
    el.style.top = `${slotRect.top - containerRect.top}px`
    window.setTimeout(() => el.remove(), 240)

    onProgress?.(placedCount, total)
    if (placedCount >= total) finish()
  }

  function missSlot(el: HTMLElement, code: string, slot: HTMLElement) {
    playMiss()
    mistakes++
    slot.classList.add('kp-slot--wrong')
    window.setTimeout(() => slot.classList.remove('kp-slot--wrong'), 420)
    snapBack(el, code)
  }

  function result(): ActivityRunResult {
    return {
      correct: placedCount,
      total,
      mistakes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function finish() {
    if (finished) return
    finished = true
    // Let the landing animation read before the result screen replaces it
    window.setTimeout(() => onFinish(result()), 600)
  }

  const onResize = () => {
    fitBoard()
    // Keep loose keys inside the container when the window changes size
    const rect = container.getBoundingClientRect()
    piecesLayer.querySelectorAll<HTMLElement>('.kp-piece').forEach(el => {
      const code = el.dataset.code!
      const home = homePositions.get(code)
      if (!home) return
      home.x = Math.min(home.x, Math.max(SCATTER_GAP, rect.width - PIECE_SIZE - SCATTER_GAP))
      home.y = Math.min(home.y, Math.max(SCATTER_GAP, rect.height - PIECE_SIZE - SCATTER_GAP))
      if (el !== drag?.el) {
        el.style.left = `${home.x}px`
        el.style.top = `${home.y}px`
      }
    })
  }

  container.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('resize', onResize)

  return {
    snapshot: result,
    destroy() {
      finished = true
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      container.classList.remove('kp-root', `kp-level-${level}`)
      container.innerHTML = ''
      closeAudio()
    },
  }
}
