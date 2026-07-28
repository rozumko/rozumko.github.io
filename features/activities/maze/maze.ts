import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { MAZE_CELL, MAZE_COLS, MAZE_ROWS, mazeMode, type MazeMode } from './maze-data.js'

// ── Чарівний лабіринт ────────────────────────────────────────────────────────
// The child drags a glowing dot from the start to the cup without touching a
// wall, picking up stars on the way. Ported from the standalone game at
// itnauka.org with the changes a class activity needs:
//   1. no menus — the teacher picked the mode, so the run starts immediately;
//   2. no lives and no Game Over — touching a wall sends the dot back to the
//      start and counts a mistake, so nobody gets stuck mid-lesson;
//   3. no localStorage high score — the result belongs to the session;
//   4. levels advance automatically, and finishing the last one ends the run.
//
// Result contract: correct = levels finished, total = levels in the mode,
// mistakes = wall hits.

const LOGICAL_W = MAZE_COLS * MAZE_CELL
const LOGICAL_H = MAZE_ROWS * MAZE_CELL
const PLAYER_R = 12
const STAR_R = 11
const STAR_FLASH_MS = 320
const TOAST_MS = 1600

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

interface Cell { r: number; c: number }
interface Star { x: number; y: number; collected: boolean }

/** Deterministic PRNG so a level's stars sit in the same place for everyone. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a += 0x6D2B79F5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(levelIndex: number, modeKey: string): number {
  const str = `${modeKey}:${levelIndex}:stars:v3`
  let s = 0
  for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0
  return s
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options
  const mode: MazeMode | null = mazeMode(level)

  container.classList.add('mz-root')
  container.innerHTML = `
    <div class="mz-hud">
      <span class="mz-hud__item">Рівень <strong class="mz-hud__level"></strong></span>
      <span class="mz-hud__item mz-hud__stars"></span>
    </div>
    <div class="mz-board">
      <canvas class="mz-canvas" role="img" aria-label="Лабіринт: веди чарівну кульку до кубка"></canvas>
    </div>
    <p class="mz-toast mz-toast--hidden" role="status"></p>`

  const boardEl = container.querySelector<HTMLElement>('.mz-board')!
  const canvas = container.querySelector<HTMLCanvasElement>('.mz-canvas')!
  const hudLevel = container.querySelector<HTMLElement>('.mz-hud__level')!
  const hudStars = container.querySelector<HTMLElement>('.mz-hud__stars')!
  const toastEl = container.querySelector<HTMLElement>('.mz-toast')!
  const ctx = canvas.getContext('2d')

  const startedAt = Date.now()
  let levelIndex = 0
  let levelsDone = 0
  let mistakes = 0
  let finished = false
  let dragging = false
  let starFlashUntil = 0
  let rafId: number | null = null
  let toastTimer: number | undefined

  const total = mode ? mode.levels.length : 0
  let grid: readonly string[] = []
  let startPos = { x: 0, y: 0 }
  let endPos = { x: 0, y: 0 }
  let startCell: Cell = { r: 0, c: 0 }
  let endCell: Cell = { r: 0, c: 0 }
  let stars: Star[] = []
  let starsCollected = 0
  const player = { x: 0, y: 0 }

  function result(): ActivityRunResult {
    return {
      correct: levelsDone,
      total: Math.max(1, total),
      mistakes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  // A level the teacher's registry does not know about must not hang the
  // lesson on a blank canvas.
  if (!mode || !ctx || total === 0) {
    container.innerHTML = '<p class="mz-error">Цей лабіринт не вдалося відкрити. Скажи вчителю.</p>'
    return { snapshot: result, destroy() { container.classList.remove('mz-root'); container.innerHTML = '' } }
  }

  // ── Board geometry ─────────────────────────────────────────────────────────
  function fitCanvas() {
    const rect = boardEl.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    // Keep the 3:2 logical board and letterbox it inside the available space.
    const scale = Math.min(rect.width / LOGICAL_W, rect.height / LOGICAL_H)
    const cssW = Math.max(1, Math.floor(LOGICAL_W * scale))
    const cssH = Math.max(1, Math.floor(LOGICAL_H * scale))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx!.setTransform((cssW / LOGICAL_W) * dpr, 0, 0, (cssH / LOGICAL_H) * dpr, 0, 0)
  }

  /** Pointer position in logical board coordinates. */
  function pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width * LOGICAL_W,
      y: (e.clientY - rect.top) / rect.height * LOGICAL_H,
    }
  }

  const isWall = (r: number, c: number) => grid[r]![c] === '1'
  const cellCenter = (r: number, c: number) => ({ x: c * MAZE_CELL + MAZE_CELL / 2, y: r * MAZE_CELL + MAZE_CELL / 2 })

  function findStartEnd() {
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        const cell = grid[r]![c]
        if (cell === 'S') { startCell = { r, c }; startPos = cellCenter(r, c) }
        if (cell === 'E') { endCell = { r, c }; endPos = cellCenter(r, c) }
      }
    }
  }

  /** Cells reachable from the start — stars may only sit on those. */
  function reachableCells(): Cell[] {
    const seen = Array.from({ length: MAZE_ROWS }, () => Array<boolean>(MAZE_COLS).fill(false))
    const queue: Cell[] = [startCell]
    const out: Cell[] = [startCell]
    seen[startCell.r]![startCell.c] = true
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!
      for (const [dr, dc] of dirs) {
        const nr = cur.r + dr, nc = cur.c + dc
        if (nr < 0 || nr >= MAZE_ROWS || nc < 0 || nc >= MAZE_COLS) continue
        if (seen[nr]![nc] || isWall(nr, nc)) continue
        seen[nr]![nc] = true
        queue.push({ r: nr, c: nc })
        out.push({ r: nr, c: nc })
      }
    }
    return out
  }

  function generateStars() {
    const rng = mulberry32(seedFor(levelIndex, mode!.key))
    const candidates = reachableCells()
      .filter(cell => !(cell.r === startCell.r && cell.c === startCell.c))
      .filter(cell => !(cell.r === endCell.r && cell.c === endCell.c))
      .map(cell => cellCenter(cell.r, cell.c))
      .filter(p => Math.hypot(p.x - startPos.x, p.y - startPos.y) >= MAZE_CELL * 2)
      .filter(p => Math.hypot(p.x - endPos.x, p.y - endPos.y) >= MAZE_CELL * 1.6)

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
    }

    const picked: Star[] = []
    const minDist = MAZE_CELL * 1.5
    for (const p of candidates) {
      if (picked.length >= mode!.starsPerLevel) break
      if (picked.every(s => Math.hypot(s.x - p.x, s.y - p.y) >= minDist)) {
        picked.push({ x: p.x, y: p.y, collected: false })
      }
    }
    // Relax the spacing rule rather than ship a level with fewer stars
    for (const p of candidates) {
      if (picked.length >= mode!.starsPerLevel) break
      if (!picked.some(s => s.x === p.x && s.y === p.y)) picked.push({ x: p.x, y: p.y, collected: false })
    }
    stars = picked
    starsCollected = 0
  }

  /** Beginner forgives one missed star; master wants them all. */
  function starsNeeded(): number {
    if (stars.length === 0) return 0
    return mode!.key === 'beginner' ? Math.max(1, stars.length - 1) : stars.length
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  // The denominator is every star on the level, not the unlock threshold:
  // "2 / 1" reads like a bug to a seven-year-old. Whether the cup is open is
  // shown by the cup itself lighting up, and announced by a toast.
  function updateHud() {
    hudLevel.textContent = `${levelIndex + 1} / ${total}`
    hudStars.textContent = `⭐ ${starsCollected} / ${stars.length}`
  }

  function toast(msg: string) {
    toastEl.textContent = msg
    toastEl.classList.remove('mz-toast--hidden')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toastEl.classList.add('mz-toast--hidden'), TOAST_MS)
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  function drawStar(cx: number, cy: number, outerR: number) {
    const innerR = outerR * 0.42
    const step = Math.PI / 5
    ctx!.save()
    ctx!.shadowBlur = 12
    ctx!.shadowColor = 'rgba(251,191,36,0.9)'
    ctx!.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = i * step - Math.PI / 2
      const radius = i % 2 === 0 ? outerR : innerR
      const x = cx + Math.cos(angle) * radius
      const y = cy + Math.sin(angle) * radius
      if (i === 0) ctx!.moveTo(x, y)
      else ctx!.lineTo(x, y)
    }
    ctx!.closePath()
    ctx!.fillStyle = '#fbbf24'
    ctx!.fill()
    ctx!.restore()
  }

  function render() {
    rafId = null
    const flash = Math.max(0, starFlashUntil - performance.now()) / STAR_FLASH_MS
    ctx!.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        const x = c * MAZE_CELL, y = r * MAZE_CELL
        if (isWall(r, c)) {
          const inset = mode!.wallInset
          ctx!.fillStyle = '#84cc16'
          ctx!.beginPath()
          ctx!.roundRect(x + inset, y + inset, MAZE_CELL - inset * 2, MAZE_CELL - inset * 2, 7)
          ctx!.fill()
        } else {
          ctx!.fillStyle = '#f1f5f9'
          ctx!.fillRect(x, y, MAZE_CELL, MAZE_CELL)
          if (flash > 0) {
            ctx!.fillStyle = `rgba(251,191,36,${flash * 0.12})`
            ctx!.fillRect(x, y, MAZE_CELL, MAZE_CELL)
          }
        }
      }
    }

    for (const s of stars) {
      if (!s.collected) drawStar(s.x, s.y, STAR_R + 1)
    }

    // The cup stays dim until enough stars are collected
    const locked = starsCollected < starsNeeded()
    ctx!.save()
    ctx!.globalAlpha = locked ? 0.3 : 1
    ctx!.font = '26px system-ui, "Segoe UI Emoji", sans-serif'
    ctx!.textAlign = 'center'
    ctx!.textBaseline = 'middle'
    ctx!.fillText('🏆', endPos.x, endPos.y)
    ctx!.restore()

    ctx!.globalCompositeOperation = 'lighter'
    const glow = ctx!.createRadialGradient(player.x, player.y, 5, player.x, player.y, 38)
    glow.addColorStop(0, 'rgba(99,102,241,0.38)')
    glow.addColorStop(1, 'rgba(99,102,241,0)')
    ctx!.fillStyle = glow
    ctx!.beginPath()
    ctx!.arc(player.x, player.y, 38, 0, Math.PI * 2)
    ctx!.fill()
    ctx!.globalCompositeOperation = 'source-over'

    ctx!.fillStyle = dragging ? '#4f46e5' : '#6366f1'
    ctx!.save()
    ctx!.shadowBlur = 8
    ctx!.shadowColor = 'rgba(99,102,241,0.5)'
    ctx!.beginPath()
    ctx!.arc(player.x, player.y, PLAYER_R, 0, Math.PI * 2)
    ctx!.fill()
    ctx!.restore()

    if (flash > 0) scheduleRender()
  }

  function scheduleRender() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(render)
  }

  // ── Collision ──────────────────────────────────────────────────────────────
  function circleHitsRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
    const dx = cx - clamp(cx, rx, rx + rw)
    const dy = cy - clamp(cy, ry, ry + rh)
    return dx * dx + dy * dy <= r * r
  }

  function hitsWall(x: number, y: number): boolean {
    const hitR = (PLAYER_R - 2) * mode!.hitboxScale
    const minC = Math.floor((x - hitR) / MAZE_CELL)
    const maxC = Math.floor((x + hitR) / MAZE_CELL)
    const minR = Math.floor((y - hitR) / MAZE_CELL)
    const maxR = Math.floor((y + hitR) / MAZE_CELL)
    if (minC < 0 || minR < 0 || maxC >= MAZE_COLS || maxR >= MAZE_ROWS) return true
    const inset = mode!.wallInset
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (!isWall(r, c)) continue
        if (circleHitsRect(x, y, hitR, c * MAZE_CELL + inset, r * MAZE_CELL + inset,
          MAZE_CELL - inset * 2, MAZE_CELL - inset * 2)) return true
      }
    }
    return false
  }

  function collectStars() {
    for (const s of stars) {
      if (s.collected) continue
      if (Math.hypot(player.x - s.x, player.y - s.y) <= PLAYER_R + STAR_R) {
        s.collected = true
        starsCollected++
        starFlashUntil = performance.now() + STAR_FLASH_MS
        updateHud()
        toast(starsCollected === starsNeeded()
          ? 'Кубок відкрито! Веди кульку до нього 🏆'
          : `Зірка! ${starsCollected} / ${stars.length}`)
        scheduleRender()
        break
      }
    }
  }

  // ── Level flow ─────────────────────────────────────────────────────────────
  function loadLevel() {
    grid = mode!.levels[levelIndex]!
    findStartEnd()
    generateStars()
    player.x = startPos.x
    player.y = startPos.y
    dragging = false
    starFlashUntil = 0
    updateHud()
    fitCanvas()
    scheduleRender()
  }

  /** A wall hit costs progress on this level, never the run. */
  function failLevel() {
    dragging = false
    mistakes++
    player.x = startPos.x
    player.y = startPos.y
    boardEl.classList.add('mz-board--shake')
    window.setTimeout(() => boardEl.classList.remove('mz-board--shake'), 450)
    toast('Ой, стінка! Спробуй ще раз')
    scheduleRender()
  }

  function completeLevel() {
    dragging = false
    levelsDone++
    onProgress?.(levelsDone, total)
    if (levelsDone >= total) { finish(); return }
    levelIndex++
    toast('Рівень пройдено! 🎉')
    window.setTimeout(() => { if (!finished) loadLevel() }, 550)
  }

  function finish() {
    if (finished) return
    finished = true
    toast('Лабіринт пройдено! 🏆')
    window.setTimeout(() => onFinish(result()), 700)
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function onPointerDown(e: PointerEvent) {
    if (finished) return
    const pos = pointerPos(e)
    if (Math.hypot(pos.x - player.x, pos.y - player.y) > PLAYER_R + 22) return
    e.preventDefault()
    dragging = true
    try { canvas.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    scheduleRender()
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || finished) return
    e.preventDefault()
    const pos = pointerPos(e)
    const fromX = player.x, fromY = player.y
    const dx = pos.x - fromX, dy = pos.y - fromY
    // Step along the path so a fast drag cannot tunnel through a wall
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const nx = fromX + dx * t
      const ny = fromY + dy * t
      if (hitsWall(nx, ny)) { failLevel(); return }
      player.x = nx
      player.y = ny
      collectStars()
      if (starsCollected >= starsNeeded() && Math.hypot(player.x - endPos.x, player.y - endPos.y) < MAZE_CELL / 2) {
        scheduleRender()
        completeLevel()
        return
      }
    }
    scheduleRender()
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    try { canvas.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    scheduleRender()
  }

  const onResize = () => { fitCanvas(); scheduleRender() }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', onResize)

  loadLevel()
  onProgress?.(0, total)

  return {
    snapshot: result,
    destroy() {
      finished = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.clearTimeout(toastTimer)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', onResize)
      container.classList.remove('mz-root')
      container.innerHTML = ''
    },
  }
}
