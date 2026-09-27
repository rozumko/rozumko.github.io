// Geometry of the builder's material board: a pannable, zoomable world where
// every card keeps its own position. Pure functions, no DOM.

/** screen = world * zoom + offset */
export interface View { x: number; y: number; zoom: number }
export interface Point { x: number; y: number }
export interface Placed extends Point { id: string }
export interface Rect { x: number; y: number; width: number; height: number }

export const CARD_W = 200
export const CARD_H = 125
export const GAP = 24
export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 2
export const WORLD_LIMIT = 100_000

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function clampCoordinate(value: number): number {
  return Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, Math.round(value)))
}

export function toWorld(view: View, screen: Point): Point {
  return { x: (screen.x - view.x) / view.zoom, y: (screen.y - view.y) / view.zoom }
}

/** Zooms by `factor` keeping the world point under `anchor` (screen) in place. */
export function zoomAt(view: View, anchor: Point, factor: number): View {
  const zoom = clampZoom(view.zoom * factor)
  const world = toWorld(view, anchor)
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom }
}

export function cardsBounds(cards: readonly Point[]): Rect | null {
  if (!cards.length) return null
  const minX = Math.min(...cards.map(c => c.x))
  const minY = Math.min(...cards.map(c => c.y))
  const maxX = Math.max(...cards.map(c => c.x + CARD_W))
  const maxY = Math.max(...cards.map(c => c.y + CARD_H))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** A view that shows every card; an empty board is shown at 100 %. */
export function fitView(cards: readonly Point[], width: number, height: number, padding = 48): View {
  const box = cardsBounds(cards)
  if (!box || width <= 0 || height <= 0) return { x: padding, y: padding, zoom: 1 }
  const zoom = clampZoom(Math.min(1, (width - padding * 2) / box.width, (height - padding * 2) / box.height))
  return {
    zoom,
    x: (width - box.width * zoom) / 2 - box.x * zoom,
    y: (height - box.height * zoom) / 2 - box.y * zoom,
  }
}

/** Left-to-right rows in the given order, `columns` wide. */
export function arrangeGrid(ids: readonly string[], columns: number): Placed[] {
  const cols = Math.max(1, Math.floor(columns))
  return ids.map((id, i) => ({ id, x: (i % cols) * (CARD_W + GAP), y: Math.floor(i / cols) * (CARD_H + GAP) }))
}

function overlaps(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < CARD_W + GAP / 2 && Math.abs(a.y - b.y) < CARD_H + GAP / 2
}

/** The free grid cell nearest to `near`, searching outwards ring by ring. */
export function freeSpot(cards: readonly Point[], near: Point): Point {
  const stepX = CARD_W + GAP
  const stepY = CARD_H + GAP
  const origin = { x: Math.round(near.x - CARD_W / 2), y: Math.round(near.y - CARD_H / 2) }
  for (let ring = 0; ring < 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const spot = { x: clampCoordinate(origin.x + dx * stepX), y: clampCoordinate(origin.y + dy * stepY) }
        if (!cards.some(card => overlaps(card, spot))) return spot
      }
    }
  }
  return { x: clampCoordinate(origin.x), y: clampCoordinate(origin.y) }
}

/** Cards touched by a selection rectangle (world coordinates, any drag direction). */
export function cardsInRect(cards: readonly Placed[], rect: Rect): string[] {
  const left = Math.min(rect.x, rect.x + rect.width)
  const right = Math.max(rect.x, rect.x + rect.width)
  const top = Math.min(rect.y, rect.y + rect.height)
  const bottom = Math.max(rect.y, rect.y + rect.height)
  return cards.filter(c => c.x < right && c.x + CARD_W > left && c.y < bottom && c.y + CARD_H > top).map(c => c.id)
}
