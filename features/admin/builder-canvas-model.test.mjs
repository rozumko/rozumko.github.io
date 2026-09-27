import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_W, CARD_H, GAP, MAX_ZOOM, MIN_ZOOM, arrangeGrid, cardsInRect, clampCoordinate, fitView, freeSpot, toWorld, zoomAt,
} from './builder-canvas-model.ts'

test('zooming keeps the world point under the cursor in place and stays within bounds', () => {
  const view = { x: 100, y: 50, zoom: 1 }
  const anchor = { x: 400, y: 300 }
  const before = toWorld(view, anchor)
  const zoomed = zoomAt(view, anchor, 1.5)
  const after = toWorld(zoomed, anchor)
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9)
  assert.equal(zoomAt(view, anchor, 100).zoom, MAX_ZOOM)
  assert.equal(zoomAt(view, anchor, 0.0001).zoom, MIN_ZOOM)
})

test('fit shows every card, never enlarges past 100 % and centres an empty board', () => {
  const cards = [{ x: 0, y: 0 }, { x: 2000, y: 1000 }]
  const view = fitView(cards, 1000, 600)
  for (const card of cards) {
    const left = card.x * view.zoom + view.x
    const top = card.y * view.zoom + view.y
    assert.ok(left >= 0 && top >= 0 && left + CARD_W * view.zoom <= 1000 && top + CARD_H * view.zoom <= 600)
  }
  assert.equal(fitView([{ x: 10, y: 10 }], 1000, 600).zoom, 1)
  assert.deepEqual(fitView([], 1000, 600).zoom, 1)
})

test('arrange lays cards out in rows and a new card lands on the nearest free cell', () => {
  const grid = arrangeGrid(['a', 'b', 'c'], 2)
  assert.deepEqual(grid.map(c => [c.x, c.y]), [[0, 0], [CARD_W + GAP, 0], [0, CARD_H + GAP]])
  const centre = { x: CARD_W / 2, y: CARD_H / 2 }
  assert.deepEqual(freeSpot([], centre), { x: 0, y: 0 })
  const spot = freeSpot([{ x: 0, y: 0 }], centre)
  assert.notDeepEqual(spot, { x: 0, y: 0 })
  assert.ok(Math.abs(spot.x) <= CARD_W + GAP && Math.abs(spot.y) <= CARD_H + GAP)
})

test('a selection rectangle drawn in any direction picks the cards it touches', () => {
  const cards = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 500, y: 0 }, { id: 'c', x: 0, y: 500 }]
  assert.deepEqual(cardsInRect(cards, { x: -10, y: -10, width: 300, height: 100 }), ['a'])
  assert.deepEqual(cardsInRect(cards, { x: 800, y: 700, width: -900, height: -800 }).sort(), ['a', 'b', 'c'])
})

test('coordinates are rounded and bounded like the server expects', () => {
  assert.equal(clampCoordinate(12.6), 13)
  assert.equal(clampCoordinate(1e9), 100000)
  assert.equal(clampCoordinate(-1e9), -100000)
})
