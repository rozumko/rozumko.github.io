import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import {
  MOUSE_LANES,
  ROAD_OBJECTS,
  mouseLevel,
  type MouseLevel,
  type RoadObject,
} from './mouse-buttons-data.js'
import { closeAudio, playBolt, playCrash, playSiren, playStar, playSteer } from './mouse-buttons-audio.js'

// ── Ліва і права кнопки миші ─────────────────────────────────────────────────
// An ambulance drives down a three-lane road. **Left mouse button steers left,
// right mouse button steers right** — that is the whole point of the activity,
// so the on-screen mouse diagram lights up the button that was pressed. Arrow
// keys and A/D stay as a fallback for a child whose mouse has no right button.
//
// Ported from itnauka.org with the changes a lesson needs:
//   1. no lives and no Game Over — a crash costs accuracy and a moment of
//      invulnerability, but the run always plays out its full time, so nobody
//      sits idle after crashing out early;
//   2. no score, ranks, medals or device high score;
//   3. the endless «Вільний» mode is gone, since a class activity must end;
//   4. no icon font and no confetti library.
//
// Result contract: an obstacle that reaches the ambulance is one decision.
//   total   = obstacles that reached it,
//   correct = obstacles avoided,
//   mistakes = crashes.

const OBJ_SIZE = 64
const HIT_BUFFER = 13
const BONUS_BUFFER = 8
const CRASH_INVULN_MS = 1200
const BOLT_INVULN_MS = 600

interface RoadItem {
  el: HTMLElement
  lane: number
  y: number
  data: RoadObject
  counted: boolean
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options
  const config: MouseLevel | null = mouseLevel(level)

  container.classList.add('mb-root')

  const startedAt = Date.now()
  let avoided = 0
  let crashes = 0
  let finished = false

  function result(): ActivityRunResult {
    const encountered = avoided + crashes
    return {
      correct: avoided,
      // Before the first obstacle there is nothing to be right about; report a
      // single unmet decision rather than an impossible 0/0.
      total: Math.max(1, encountered),
      mistakes: crashes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  if (!config) {
    container.innerHTML = '<p class="mb-error">Цю активність не вдалося відкрити. Скажи вчителю.</p>'
    return { snapshot: result, destroy() { container.classList.remove('mb-root'); container.innerHTML = '' } }
  }

  container.innerHTML = `
    <div class="mb-hud">
      <span class="mb-hud__item mb-hud__time"></span>
      <span class="mb-hud__item mb-hud__avoided"></span>
      <span class="mb-hud__item mb-hud__crashes"></span>
    </div>
    <div class="mb-stage">
      <div class="mb-road">
        <div class="mb-road__stripes" aria-hidden="true"></div>
        <div class="mb-objects"></div>
        <div class="mb-car" aria-hidden="true">🚑</div>
        <div class="mb-flash" aria-hidden="true"></div>
        <p class="mb-slowmo mb-slowmo--hidden" aria-hidden="true">⚡ ПОВІЛЬНІШЕ</p>
        <p class="mb-toast mb-toast--hidden" role="status"></p>
      </div>
      <div class="mb-mouse" aria-hidden="true">
        <p class="mb-mouse__hint">Керуй мишкою</p>
        <div class="mb-mouse__body">
          <div class="mb-mouse__btn mb-mouse__btn--left"></div>
          <div class="mb-mouse__btn mb-mouse__btn--right"></div>
          <div class="mb-mouse__wheel"></div>
        </div>
        <div class="mb-mouse__labels"><span>ЛІВА</span><span>ПРАВА</span></div>
      </div>
    </div>
    <p class="mb-help">Ліва кнопка миші — рух ліворуч, права — праворуч. Можна й стрілками ← →</p>`

  const road = container.querySelector<HTMLElement>('.mb-road')!
  const objectsEl = container.querySelector<HTMLElement>('.mb-objects')!
  const car = container.querySelector<HTMLElement>('.mb-car')!
  const flash = container.querySelector<HTMLElement>('.mb-flash')!
  const slowmo = container.querySelector<HTMLElement>('.mb-slowmo')!
  const toastEl = container.querySelector<HTMLElement>('.mb-toast')!
  const hudTime = container.querySelector<HTMLElement>('.mb-hud__time')!
  const hudAvoided = container.querySelector<HTMLElement>('.mb-hud__avoided')!
  const hudCrashes = container.querySelector<HTMLElement>('.mb-hud__crashes')!
  const leftBtn = container.querySelector<HTMLElement>('.mb-mouse__btn--left')!
  const rightBtn = container.querySelector<HTMLElement>('.mb-mouse__btn--right')!

  let lane = 1
  let items: RoadItem[] = []
  let speed = config.timeLimitSec > 0 ? config.baseSpeed : config.baseSpeed
  let spawnMs = config.spawnMs
  let spawnAcc = 0
  let elapsed = 0
  let leftMs = config.timeLimitSec * 1000
  let slowUntil = 0
  let invulnUntil = 0
  let lastSpawnLane = -1
  let lastT = 0
  let rafId: number | null = null
  let toastTimer: number | undefined

  function lanePercent(l: number): number {
    const width = 100 / MOUSE_LANES
    return l * width + width / 2
  }

  function placeCar() {
    car.style.left = `${lanePercent(lane)}%`
  }

  function toast(msg: string) {
    toastEl.textContent = msg
    toastEl.classList.remove('mb-toast--hidden')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toastEl.classList.add('mb-toast--hidden'), 1400)
  }

  function updateHud() {
    hudTime.textContent = `⏱ ${Math.max(0, Math.ceil(leftMs / 1000))} с`
    hudAvoided.textContent = `✅ ${avoided}`
    hudCrashes.textContent = `💥 ${crashes}`
  }

  // ── Steering ───────────────────────────────────────────────────────────────
  function highlight(el: HTMLElement) {
    el.classList.add('mb-mouse__btn--active')
    window.setTimeout(() => el.classList.remove('mb-mouse__btn--active'), 140)
  }

  function steer(dir: -1 | 1) {
    if (finished) return
    const next = lane + dir
    highlight(dir === -1 ? leftBtn : rightBtn)
    if (next < 0 || next >= MOUSE_LANES) return
    lane = next
    placeCar()
    playSteer()
  }

  // The right button is a game control here, so its menu must not open.
  function onContextMenu(e: Event) { e.preventDefault() }

  function onMouseDown(e: MouseEvent) {
    if (finished) return
    if (e.button === 0) { e.preventDefault(); steer(-1) }
    else if (e.button === 2) { e.preventDefault(); steer(1) }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (finished) return
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); steer(-1) }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); steer(1) }
  }

  // ── Spawning ───────────────────────────────────────────────────────────────
  function pickObject(): RoadObject {
    // Opening grace period: only bonuses, so steering is learned before the
    // first obstacle can punish it.
    if (config!.tutorialMs > 0 && elapsed < config!.tutorialMs) {
      const bonuses = ROAD_OBJECTS.filter(o => o.type === 'bonus')
      return bonuses[Math.floor(Math.random() * bonuses.length)]!
    }
    const weighted = ROAD_OBJECTS.map(o => ({
      o,
      w: o.type === 'obstacle' ? o.weight * config!.obstacleMult : o.weight * config!.bonusMult,
    }))
    const total = weighted.reduce((sum, x) => sum + x.w, 0)
    let r = Math.random() * total
    for (const x of weighted) { r -= x.w; if (r <= 0) return x.o }
    return weighted[0]!.o
  }

  function spawn() {
    let target = Math.floor(Math.random() * MOUSE_LANES)
    if (target === lastSpawnLane) {
      const others = [0, 1, 2].filter(l => l !== lastSpawnLane)
      target = others[Math.floor(Math.random() * others.length)]!
    }
    const data = pickObject()
    const el = document.createElement('div')
    el.className = `mb-object${data.type === 'bonus' ? ' mb-object--bonus' : ''}`
    el.style.left = `${lanePercent(target)}%`
    el.textContent = data.icon
    objectsEl.appendChild(el)
    items.push({ el, lane: target, y: -OBJ_SIZE, data, counted: false })
    lastSpawnLane = target
  }

  function popText(item: RoadItem, text: string) {
    const el = document.createElement('div')
    el.className = 'mb-pop'
    el.style.left = `${lanePercent(item.lane)}%`
    el.style.top = `${item.y}px`
    el.textContent = text
    road.appendChild(el)
    window.setTimeout(() => el.remove(), 500)
  }

  function collect(index: number) {
    const item = items[index]!
    if (item.data.kind === 'star') { playStar(); popText(item, '⭐') }
    else { playBolt(); popText(item, '⚡') }
    if (item.data.effect === 'slow') {
      slowUntil = performance.now() + config!.slowMs
      // Brief invulnerability so the lane the bolt sat in cannot crash the car
      invulnUntil = Math.max(invulnUntil, performance.now() + BOLT_INVULN_MS)
      toast('⚡ Повільніше!')
    }
    item.el.remove()
    items.splice(index, 1)
  }

  function crash(index: number) {
    const item = items[index]!
    playCrash()
    crashes++
    item.el.remove()
    items.splice(index, 1)
    invulnUntil = performance.now() + CRASH_INVULN_MS
    car.classList.add('mb-car--invulnerable')
    window.setTimeout(() => car.classList.remove('mb-car--invulnerable'), CRASH_INVULN_MS)
    flash.classList.add('mb-flash--active')
    window.setTimeout(() => flash.classList.remove('mb-flash--active'), 400)
    road.classList.add('mb-road--shake')
    window.setTimeout(() => road.classList.remove('mb-road--shake'), 420)
    toast('Аварія! Об’їжджай перешкоди')
    updateHud()
    onProgress?.(avoided, avoided + crashes)
  }

  function avoid() {
    avoided++
    // Speed up every few clean passes, as the original did on score
    if (avoided % config!.speedStep === 0) speed += config!.speedInc
    updateHud()
    onProgress?.(avoided, avoided + crashes)
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function frame(t: number) {
    rafId = null
    if (finished) return
    const dt = lastT === 0 ? 16 : t - lastT
    lastT = t
    // A backgrounded tab must not teleport the road forward
    if (dt > 150) { rafId = requestAnimationFrame(frame); return }

    const now = performance.now()
    const slow = now < slowUntil
    slowmo.classList.toggle('mb-slowmo--hidden', !slow)
    const factor = slow ? config!.slowFactor : 1

    elapsed += dt
    leftMs -= dt
    if (leftMs <= 0) { finish(); return }

    spawnAcc += dt * factor
    if (spawnAcc >= spawnMs) {
      spawn()
      spawnAcc = 0
      spawnMs = Math.max(config!.minSpawnMs, spawnMs - config!.tighten)
    }

    const step = (speed * dt * factor) / 1000
    const rect = road.getBoundingClientRect()
    const carRect = car.getBoundingClientRect()
    const carTop = carRect.top - rect.top
    const carBottom = carRect.bottom - rect.top
    const invuln = now < invulnUntil

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!
      item.y += step
      item.el.style.transform = `translate(-50%, ${item.y}px)`

      if (item.lane === lane && !item.counted) {
        const buffer = item.data.type === 'bonus' ? BONUS_BUFFER : HIT_BUFFER
        const overlaps = item.y + OBJ_SIZE - buffer > carTop + buffer && item.y + buffer < carBottom - buffer
        if (overlaps) {
          if (item.data.type === 'bonus') { collect(i); continue }
          if (!invuln) { item.counted = true; crash(i); continue }
        }
      }

      if (item.y > rect.height) {
        if (!item.counted && item.data.type === 'obstacle') { item.counted = true; avoid() }
        item.el.remove()
        items.splice(i, 1)
      }
    }

    updateHud()
    rafId = requestAnimationFrame(frame)
  }

  function finish() {
    if (finished) return
    finished = true
    // The loop returns before its own HUD update, so the clock would freeze on
    // the last whole second instead of reaching zero.
    leftMs = 0
    updateHud()
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    playSiren()
    toast('Зміна закінчилась! 🚑')
    window.setTimeout(() => onFinish(result()), 800)
  }

  road.addEventListener('contextmenu', onContextMenu)
  road.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)

  placeCar()
  updateHud()
  onProgress?.(0, 1)
  rafId = requestAnimationFrame(frame)

  return {
    snapshot: result,
    destroy() {
      finished = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.clearTimeout(toastTimer)
      road.removeEventListener('contextmenu', onContextMenu)
      road.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      items = []
      container.classList.remove('mb-root')
      container.innerHTML = ''
      closeAudio()
    },
  }
}
