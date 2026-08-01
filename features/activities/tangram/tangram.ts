import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { TANGRAM_PIECES, TANGRAM_PUZZLES, type TangramPieceDefinition, type TangramTarget } from './tangram-data.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const TOTAL = TANGRAM_PIECES.length * TANGRAM_PUZZLES.length
const SNAP_DISTANCE = 68

interface PieceState extends TangramPieceDefinition {
  x: number
  y: number
  homeX: number
  homeY: number
  angle: number
  flipped: boolean
  targetId: string | null
}

function angleDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b + 180) % 360 + 360) % 360 - 180)
  return diff
}

function transform(target: { x: number; y: number; angle: number; flipped?: boolean }): string {
  return `translate(${target.x} ${target.y}) rotate(${target.angle}) scale(${target.flipped ? -1 : 1} 1)`
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  let puzzleIndex = 0
  let pieces: PieceState[] = []
  let selectedId: string | null = null
  let dragOffset = { x: 0, y: 0 }
  let draggingId: string | null = null
  let placed = 0
  let mistakes = 0
  let hintsLeft = Math.max(1, 5 - options.grade)
  let hintTargetId: string | null = null
  let finished = false
  let nextTimer: number | undefined

  container.classList.add('tg-root')
  container.innerHTML = `
    <section class="tg-shell">
      <div class="tg-hud">
        <strong class="tg-title"></strong>
        <span class="tg-progress"></span>
        <span class="tg-help-count"></span>
      </div>
      <div class="tg-board">
        <svg class="tg-svg" viewBox="0 0 900 520" role="img" aria-label="Силует і деталі танграма">
          <g class="tg-silhouette"></g>
          <g class="tg-pieces"></g>
        </svg>
      </div>
      <div class="tg-controls" aria-label="Керування вибраною деталлю">
        <button type="button" class="tg-control tg-ccw">↶ 45°</button>
        <button type="button" class="tg-control tg-cw">↷ 45°</button>
        <button type="button" class="tg-control tg-flip">⇆ Дзеркало</button>
        <button type="button" class="tg-control tg-hint">Підказка</button>
      </div>
      <p class="tg-message" role="status">Обери деталь і перенеси її на силует.</p>
    </section>`

  const svg = container.querySelector<SVGSVGElement>('.tg-svg')!
  const silhouetteGroup = container.querySelector<SVGGElement>('.tg-silhouette')!
  const piecesGroup = container.querySelector<SVGGElement>('.tg-pieces')!
  const titleEl = container.querySelector<HTMLElement>('.tg-title')!
  const progressEl = container.querySelector<HTMLElement>('.tg-progress')!
  const helpCountEl = container.querySelector<HTMLElement>('.tg-help-count')!
  const messageEl = container.querySelector<HTMLElement>('.tg-message')!
  const ccw = container.querySelector<HTMLButtonElement>('.tg-ccw')!
  const cw = container.querySelector<HTMLButtonElement>('.tg-cw')!
  const flip = container.querySelector<HTMLButtonElement>('.tg-flip')!
  const hint = container.querySelector<HTMLButtonElement>('.tg-hint')!

  function result(): ActivityRunResult {
    return {
      correct: placed,
      total: TOTAL,
      mistakes,
      durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function svgPoint(event: PointerEvent): { x: number; y: number } {
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svg.getScreenCTM()
    if (!matrix) return { x: event.clientX, y: event.clientY }
    const local = point.matrixTransform(matrix.inverse())
    return { x: local.x, y: local.y }
  }

  function pieceById(id: string | null): PieceState | undefined {
    return pieces.find(piece => piece.id === id)
  }

  function updateHud() {
    const puzzle = TANGRAM_PUZZLES[puzzleIndex]
    titleEl.textContent = puzzle ? `${puzzleIndex + 1} з ${TANGRAM_PUZZLES.length}: ${puzzle.name}` : 'Готово!'
    progressEl.textContent = `${placed} / ${TOTAL}`
    helpCountEl.textContent = `Підказок: ${hintsLeft}`
    hint.disabled = hintsLeft <= 0 || finished
    const selected = pieceById(selectedId)
    ccw.disabled = !selected || selected.targetId !== null
    cw.disabled = !selected || selected.targetId !== null
    flip.disabled = !selected || selected.family !== 'parallelogram' || selected.targetId !== null
    options.onProgress?.(placed, TOTAL)
  }

  function drawSilhouette() {
    silhouetteGroup.textContent = ''
    const puzzle = TANGRAM_PUZZLES[puzzleIndex]
    if (!puzzle) return
    for (const target of puzzle.targets) {
      const piece = TANGRAM_PIECES.find(item => item.family === target.family)!
      const polygon = document.createElementNS(SVG_NS, 'polygon')
      polygon.setAttribute('points', piece.points)
      polygon.setAttribute('transform', transform(target))
      polygon.setAttribute('class', `tg-target${hintTargetId === target.id ? ' tg-target--hint' : ''}`)
      silhouetteGroup.appendChild(polygon)
    }
  }

  function drawPieces() {
    piecesGroup.textContent = ''
    for (const piece of pieces) {
      const polygon = document.createElementNS(SVG_NS, 'polygon')
      polygon.setAttribute('points', piece.points)
      polygon.setAttribute('transform', transform(piece))
      polygon.setAttribute('fill', piece.color)
      polygon.setAttribute('data-piece-id', piece.id)
      polygon.setAttribute('tabindex', '0')
      polygon.setAttribute('role', 'button')
      polygon.setAttribute('aria-label', piece.name)
      polygon.setAttribute('class', `tg-piece${piece.id === selectedId ? ' tg-piece--selected' : ''}${piece.targetId ? ' tg-piece--placed' : ''}`)
      piecesGroup.appendChild(polygon)
    }
  }

  function initialAngle(index: number, target: TangramTarget): number {
    if (options.grade <= 1) return target.angle
    return ((index * 90) + puzzleIndex * 45) % 360
  }

  function startPuzzle() {
    const puzzle = TANGRAM_PUZZLES[puzzleIndex]!
    selectedId = null
    draggingId = null
    hintTargetId = null
    pieces = TANGRAM_PIECES.map((piece, index) => {
      const ownTarget = puzzle.targets.find(target => target.family === piece.family)
        ?? puzzle.targets[index]!
      const homeX = index % 2 === 0 ? 105 : 265
      const homeY = 75 + Math.floor(index / 2) * 125
      return {
        ...piece,
        x: homeX,
        y: homeY,
        homeX,
        homeY,
        angle: initialAngle(index, ownTarget),
        flipped: options.grade <= 2 ? Boolean(ownTarget.flipped) : false,
        targetId: null,
      }
    })
    drawSilhouette()
    drawPieces()
    updateHud()
    messageEl.textContent = options.grade <= 1
      ? 'Піднеси деталь до відповідної частини силуету — вона сама повернеться правильно.'
      : 'Перетягуй деталі, а кнопками повертай вибрану деталь.'
    messageEl.className = 'tg-message'
  }

  function compatibleTargets(piece: PieceState): TangramTarget[] {
    const puzzle = TANGRAM_PUZZLES[puzzleIndex]!
    const occupied = new Set(pieces.map(item => item.targetId).filter(Boolean))
    return puzzle.targets.filter(target => target.family === piece.family && !occupied.has(target.id))
  }

  function tryPlace(piece: PieceState): 'placed' | 'orientation' | 'miss' {
    const candidates = compatibleTargets(piece)
      .map(target => ({ target, distance: Math.hypot(target.x - piece.x, target.y - piece.y) }))
      .sort((a, b) => a.distance - b.distance)
    const best = candidates[0]
    if (!best || best.distance > SNAP_DISTANCE) return 'miss'

    const orientationFits = angleDistance(piece.angle, best.target.angle) < 1
      && (piece.family !== 'parallelogram' || piece.flipped === Boolean(best.target.flipped))
    if (options.grade > 1 && !orientationFits) {
      return 'orientation'
    }

    piece.x = best.target.x
    piece.y = best.target.y
    piece.angle = best.target.angle
    piece.flipped = Boolean(best.target.flipped)
    piece.targetId = best.target.id
    placed += 1
    messageEl.textContent = 'Деталь на місці!'
    messageEl.className = 'tg-message tg-message--ok'
    updateHud()
    if (pieces.every(item => item.targetId)) {
      nextTimer = window.setTimeout(() => {
        puzzleIndex += 1
        if (puzzleIndex >= TANGRAM_PUZZLES.length) finish()
        else startPuzzle()
      }, 750)
    }
    return 'placed'
  }

  function returnHome(piece: PieceState, message = 'Це місце не підходить. Спробуй ще раз.') {
    piece.x = piece.homeX
    piece.y = piece.homeY
    mistakes += 1
    messageEl.textContent = message
    messageEl.className = 'tg-message tg-message--miss'
  }

  function rotateSelected(delta: number) {
    const piece = pieceById(selectedId)
    if (!piece || piece.targetId) return
    piece.angle = (piece.angle + delta + 360) % 360
    drawPieces()
  }

  function finish() {
    if (finished) return
    finished = true
    window.clearTimeout(nextTimer)
    silhouetteGroup.textContent = ''
    piecesGroup.textContent = ''
    titleEl.textContent = 'Усі силуети складено!'
    messageEl.textContent = 'Ти використав усі сім деталей у кожному танграмі.'
    messageEl.className = 'tg-message tg-message--ok'
    updateHud()
    options.onFinish(result())
  }

  svg.addEventListener('pointerdown', event => {
    const target = (event.target as Element).closest<SVGPolygonElement>('[data-piece-id]')
    const piece = pieceById(target?.dataset['pieceId'] ?? null)
    if (!piece || piece.targetId || finished) return
    event.preventDefault()
    selectedId = piece.id
    draggingId = piece.id
    const point = svgPoint(event)
    dragOffset = { x: point.x - piece.x, y: point.y - piece.y }
    svg.setPointerCapture(event.pointerId)
    drawPieces()
    updateHud()
  })

  svg.addEventListener('pointermove', event => {
    const piece = pieceById(draggingId)
    if (!piece || finished) return
    event.preventDefault()
    const point = svgPoint(event)
    piece.x = point.x - dragOffset.x
    piece.y = point.y - dragOffset.y
    drawPieces()
  })

  const release = (event: PointerEvent) => {
    const piece = pieceById(draggingId)
    if (!piece) return
    draggingId = null
    try { svg.releasePointerCapture(event.pointerId) } catch { /* capture already ended */ }
    const placement = tryPlace(piece)
    if (placement === 'miss') returnHome(piece)
    if (placement === 'orientation') {
      returnHome(piece, 'Місце правильне, але деталь треба повернути або віддзеркалити.')
    }
    drawPieces()
    updateHud()
  }
  svg.addEventListener('pointerup', release)
  svg.addEventListener('pointercancel', release)

  ccw.addEventListener('click', () => rotateSelected(-45))
  cw.addEventListener('click', () => rotateSelected(45))
  flip.addEventListener('click', () => {
    const piece = pieceById(selectedId)
    if (!piece || piece.family !== 'parallelogram' || piece.targetId) return
    piece.flipped = !piece.flipped
    drawPieces()
  })
  hint.addEventListener('click', () => {
    if (hintsLeft <= 0 || finished) return
    const selected = pieceById(selectedId) ?? pieces.find(piece => !piece.targetId)
    const target = selected ? compatibleTargets(selected)[0] : undefined
    if (!target) return
    hintsLeft -= 1
    hintTargetId = target.id
    drawSilhouette()
    updateHud()
    messageEl.textContent = 'Підказка підсвітила місце для вибраної деталі.'
    window.setTimeout(() => { hintTargetId = null; drawSilhouette() }, 1400)
  })

  startPuzzle()

  return {
    snapshot: result,
    destroy() {
      finished = true
      window.clearTimeout(nextTimer)
      container.textContent = ''
      container.classList.remove('tg-root')
    },
  }
}
