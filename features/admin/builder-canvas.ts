// The material board: a pannable, zoomable canvas of thumbnail cards.
// Pointer events drive everything (mouse, pen and touch alike), so a drag can
// leave the canvas and land in the lesson outline. Cards are buttons: Tab moves
// between them, arrows nudge the selection, Enter opens, Delete removes.

import {
  CARD_H, CARD_W, arrangeGrid, cardsInRect, clampCoordinate, fitView, toWorld, zoomAt,
  type Placed, type Point, type View,
} from './builder-canvas-model.js'

export interface CanvasCard extends Placed {
  title: string
  /** Changes when the content changes; the thumbnail is rebuilt only then. */
  version: string
  render(): HTMLElement
}

export interface BoardCanvasOptions {
  label: string
  emptyHint: string
  onOpen(id: string): void
  onMove(positions: Placed[]): void
  onDelete(ids: string[]): void
  /** A drag released outside the canvas; return true when it was used (cards snap back). */
  onDropOutside(ids: string[], client: Point): boolean
  onDragOutside(client: Point | null): void
  onExternalDrop(data: DataTransfer, world: Point): void
  onPaste(data: DataTransfer, world: Point): void
}

export interface BoardCanvas {
  element: HTMLElement
  setCards(cards: CanvasCard[]): void
  /** `null` shows every card; otherwise non-matching cards are dimmed. */
  setMatches(ids: Set<string> | null): void
  fit(ids?: string[]): void
  focusCard(id: string): void
  arrange(order: string[]): Placed[]
  /** World point at the centre of the visible area. */
  centre(): Point
  worldAt(client: Point): Point | null
  selection(): string[]
  destroy(): void
}

const DRAG_THRESHOLD = 5
const NUDGE = 16

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

export function mountBoardCanvas(options: BoardCanvasOptions): BoardCanvas {
  const viewport = el('div', 'bc-viewport')
  viewport.setAttribute('role', 'region')
  viewport.setAttribute('aria-label', options.label)
  viewport.tabIndex = 0
  const world = el('div', 'bc-world')
  const marquee = el('div', 'bc-marquee')
  marquee.hidden = true
  const empty = el('p', 'bc-empty', options.emptyHint)
  const zoomLabel = el('span', 'bc-zoom-value', '100%')
  const controls = el('div', 'bc-controls')
  const control = (label: string, text: string, run: () => void) => {
    const node = el('button', 'bc-control', text)
    node.type = 'button'
    node.title = label
    node.setAttribute('aria-label', label)
    node.addEventListener('click', run)
    node.addEventListener('pointerdown', event => event.stopPropagation())
    return node
  }
  controls.append(
    control('Віддалити', '−', () => zoomBy(1 / 1.25)),
    zoomLabel,
    control('Наблизити', '+', () => zoomBy(1.25)),
    control('Показати все', '⤢', () => fit()),
  )
  viewport.append(world, marquee, empty, controls)

  let view: View = { x: 48, y: 48, zoom: 1 }
  let cards: CanvasCard[] = []
  const nodes = new Map<string, { node: HTMLButtonElement; version: string }>()
  const selected = new Set<string>()
  let matches: Set<string> | null = null
  let ghost: HTMLElement | null = null

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`
    zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`
    viewport.style.setProperty('--bc-grid', `${24 * view.zoom}px`)
    viewport.style.backgroundPosition = `${view.x}px ${view.y}px`
  }
  function screenOf(event: { clientX: number; clientY: number }): Point {
    const box = viewport.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  function zoomBy(factor: number, anchor?: Point) {
    const box = viewport.getBoundingClientRect()
    view = zoomAt(view, anchor ?? { x: box.width / 2, y: box.height / 2 }, factor)
    applyView()
  }
  function fit(ids?: string[]) {
    const box = viewport.getBoundingClientRect()
    const subset = ids?.length ? cards.filter(card => ids.includes(card.id)) : cards
    view = fitView(subset, box.width, box.height)
    applyView()
  }
  function paintSelection() {
    for (const [id, { node }] of nodes) {
      node.classList.toggle('bc-card--selected', selected.has(id))
      node.setAttribute('aria-pressed', String(selected.has(id)))
    }
  }
  function select(ids: Iterable<string>, add = false) {
    if (!add) selected.clear()
    for (const id of ids) selected.add(id)
    paintSelection()
  }
  function place(card: Placed) {
    const entry = nodes.get(card.id)
    if (entry) { entry.node.style.left = `${card.x}px`; entry.node.style.top = `${card.y}px` }
  }

  function cardNode(card: CanvasCard): HTMLButtonElement {
    const node = el('button', 'bc-card')
    node.type = 'button'
    node.dataset.material = card.id
    node.style.width = `${CARD_W}px`
    node.style.height = `${CARD_H}px`
    node.addEventListener('pointerdown', event => startCardDrag(event, card.id))
    // Keyboard activation only: pointer clicks are resolved in the drag handler.
    node.addEventListener('click', event => { if (event.detail === 0) options.onOpen(card.id) })
    node.addEventListener('focus', () => { if (!selected.has(card.id)) select([card.id]) })
    return node
  }

  function setCards(next: CanvasCard[]) {
    cards = next
    const alive = new Set(next.map(card => card.id))
    for (const [id, { node }] of nodes) if (!alive.has(id)) { node.remove(); nodes.delete(id); selected.delete(id) }
    for (const card of next) {
      let entry = nodes.get(card.id)
      if (!entry) {
        entry = { node: cardNode(card), version: '' }
        nodes.set(card.id, entry)
        world.append(entry.node)
      }
      if (entry.version !== card.version) {
        entry.node.replaceChildren(card.render())
        entry.version = card.version
      }
      entry.node.title = card.title
      entry.node.setAttribute('aria-label', card.title)
      place(card)
    }
    empty.hidden = next.length > 0
    paintMatches()
    paintSelection()
  }

  function paintMatches() {
    for (const [id, { node }] of nodes) node.classList.toggle('bc-card--dim', matches !== null && !matches.has(id))
  }

  // ── Dragging cards ──
  function startCardDrag(event: PointerEvent, id: string) {
    if (event.button !== 0) return
    event.stopPropagation()
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const wasSelected = selected.has(id)
    if (!wasSelected) select([id], additive)
    const moving = cards.filter(card => selected.has(card.id))
    const origin = new Map(moving.map(card => [card.id, { x: card.x, y: card.y }]))
    const start = { x: event.clientX, y: event.clientY }
    let dragging = false
    let outside = false
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - start.x
      const dy = move.clientY - start.y
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (!dragging) { dragging = true; viewport.classList.add('bc-viewport--dragging') }
      const box = viewport.getBoundingClientRect()
      outside = move.clientX < box.left || move.clientX > box.right || move.clientY < box.top || move.clientY > box.bottom
      for (const card of moving) {
        const from = origin.get(card.id)!
        card.x = from.x + dx / view.zoom
        card.y = from.y + dy / view.zoom
        place(card)
      }
      showGhost(outside ? move : null, moving.length, target)
      options.onDragOutside(outside ? { x: move.clientX, y: move.clientY } : null)
    }
    const onUp = (up: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      viewport.classList.remove('bc-viewport--dragging')
      showGhost(null, 0, target)
      options.onDragOutside(null)
      if (!dragging) {
        if (up.type === 'pointerup' && additive && wasSelected) { selected.delete(id); paintSelection() }
        else if (up.type === 'pointerup' && !additive) options.onOpen(id)
        return
      }
      const ids = moving.map(card => card.id)
      const used = outside && up.type === 'pointerup' && options.onDropOutside(ids, { x: up.clientX, y: up.clientY })
      if (outside || up.type !== 'pointerup' || used) {
        for (const card of moving) { Object.assign(card, origin.get(card.id)); place(card) }
        return
      }
      const positions = moving.map(card => ({ id: card.id, x: clampCoordinate(card.x), y: clampCoordinate(card.y) }))
      for (const position of positions) { Object.assign(cards.find(card => card.id === position.id)!, position); place(position) }
      options.onMove(positions)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  function showGhost(at: { clientX: number; clientY: number } | null, count: number, source: HTMLElement) {
    if (!at) { ghost?.remove(); ghost = null; return }
    if (!ghost) {
      ghost = el('div', 'bc-ghost')
      ghost.append(source.firstElementChild?.cloneNode(true) ?? el('span'))
      if (count > 1) ghost.append(el('span', 'bc-ghost-count', String(count)))
      document.body.append(ghost)
    }
    ghost.style.left = `${at.clientX + 8}px`
    ghost.style.top = `${at.clientY + 8}px`
  }

  // ── Panning, marquee selection and pinch ──
  const touches = new Map<number, Point>()
  let pinchDistance = 0
  viewport.addEventListener('pointerdown', event => {
    if ((event.target as Element).closest('.bc-card, .bc-controls')) return
    viewport.focus({ preventScroll: true })
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touches.size === 2) {
      const [a, b] = [...touches.values()]
      pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      return
    }
    const marqueeMode = event.button === 0 && event.shiftKey
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    viewport.setPointerCapture(event.pointerId)
    const start = screenOf(event)
    const startView = { ...view }
    if (!marqueeMode) { select([]); viewport.classList.add('bc-viewport--panning') }
    const onMove = (move: PointerEvent) => {
      touches.set(move.pointerId, { x: move.clientX, y: move.clientY })
      if (touches.size === 2) {
        const [a, b] = [...touches.values()]
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y)
        if (pinchDistance > 0) zoomBy(distance / pinchDistance, screenOf({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 }))
        pinchDistance = distance
        return
      }
      const now = screenOf(move)
      if (marqueeMode) {
        marquee.hidden = false
        Object.assign(marquee.style, {
          left: `${Math.min(start.x, now.x)}px`, top: `${Math.min(start.y, now.y)}px`,
          width: `${Math.abs(now.x - start.x)}px`, height: `${Math.abs(now.y - start.y)}px`,
        })
        const a = toWorld(view, start)
        const b = toWorld(view, now)
        select(cardsInRect(cards, { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }), true)
      } else {
        view = { ...startView, x: startView.x + now.x - start.x, y: startView.y + now.y - start.y }
        applyView()
      }
    }
    const onUp = (up: PointerEvent) => {
      touches.delete(up.pointerId)
      if (touches.size) return
      pinchDistance = 0
      marquee.hidden = true
      viewport.classList.remove('bc-viewport--panning')
      viewport.removeEventListener('pointermove', onMove)
      viewport.removeEventListener('pointerup', onUp)
      viewport.removeEventListener('pointercancel', onUp)
    }
    viewport.addEventListener('pointermove', onMove)
    viewport.addEventListener('pointerup', onUp)
    viewport.addEventListener('pointercancel', onUp)
  })

  // Ctrl/⌘ + wheel (and trackpad pinch, which browsers report the same way) zooms; plain wheel pans.
  viewport.addEventListener('wheel', event => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) zoomBy(Math.exp(-event.deltaY * 0.01), screenOf(event))
    else { view = { ...view, x: view.x - event.deltaX, y: view.y - event.deltaY }; applyView() }
  }, { passive: false })

  viewport.addEventListener('keydown', event => {
    if ((event.target as Element).closest('input, textarea, select')) return
    const ids = [...selected]
    if ((event.key === 'Delete' || event.key === 'Backspace') && ids.length) { event.preventDefault(); options.onDelete(ids); return }
    if (event.key === 'Escape') { select([]); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); select(cards.map(card => card.id)); return }
    if (event.key === '+' || event.key === '=') { zoomBy(1.25); return }
    if (event.key === '-') { zoomBy(1 / 1.25); return }
    if (event.key === '0') { fit(); return }
    const step = event.shiftKey ? NUDGE * 4 : NUDGE
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
    if (delta && ids.length) {
      event.preventDefault()
      const moved = cards.filter(card => selected.has(card.id)).map(card => {
        card.x = clampCoordinate(card.x + delta[0]!)
        card.y = clampCoordinate(card.y + delta[1]!)
        place(card)
        return { id: card.id, x: card.x, y: card.y }
      })
      options.onMove(moved)
    }
  })

  // Files, links and images from other tabs land where they are dropped.
  viewport.addEventListener('dragover', event => {
    if (!event.dataTransfer) return
    event.preventDefault()
    viewport.classList.add('bc-viewport--drop')
  })
  viewport.addEventListener('dragleave', event => {
    if (!viewport.contains(event.relatedTarget as Node)) viewport.classList.remove('bc-viewport--drop')
  })
  viewport.addEventListener('drop', event => {
    event.preventDefault()
    viewport.classList.remove('bc-viewport--drop')
    if (event.dataTransfer) options.onExternalDrop(event.dataTransfer, toWorld(view, screenOf(event)))
  })
  viewport.addEventListener('paste', event => {
    if ((event.target as Element).closest('input, textarea, [contenteditable]') || !event.clipboardData) return
    event.preventDefault()
    options.onPaste(event.clipboardData, centre())
  })

  function centre(): Point {
    const box = viewport.getBoundingClientRect()
    return toWorld(view, { x: box.width / 2, y: box.height / 2 })
  }

  applyView()
  return {
    element: viewport,
    setCards,
    setMatches(next) { matches = next; paintMatches() },
    fit,
    focusCard(id) {
      const card = cards.find(c => c.id === id)
      if (!card) return
      const box = viewport.getBoundingClientRect()
      view = { ...view, x: box.width / 2 - (card.x + CARD_W / 2) * view.zoom, y: box.height / 2 - (card.y + CARD_H / 2) * view.zoom }
      applyView()
      select([id])
      nodes.get(id)?.node.focus({ preventScroll: true })
    },
    arrange(order) {
      const box = viewport.getBoundingClientRect()
      const columns = Math.max(2, Math.floor((box.width / Math.max(view.zoom, 0.5) - 48) / (CARD_W + 24)))
      const positions = arrangeGrid(order, columns)
      for (const position of positions) {
        const card = cards.find(c => c.id === position.id)
        if (card) { card.x = position.x; card.y = position.y; place(card) }
      }
      fit()
      return positions
    },
    centre,
    worldAt(client) {
      const box = viewport.getBoundingClientRect()
      if (client.x < box.left || client.x > box.right || client.y < box.top || client.y > box.bottom) return null
      return toWorld(view, { x: client.x - box.left, y: client.y - box.top })
    },
    selection: () => [...selected],
    destroy() { ghost?.remove(); viewport.remove() },
  }
}
