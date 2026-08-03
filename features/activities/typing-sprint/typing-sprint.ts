import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { createKeyboard } from '../typing-core/keyboard-view.js'
import { MAX_REPORTED_MISTAKES, createBag } from '../typing-core/round.js'
import { describeCharacter, displayCharacter, isTextAttempt, issue, matchesCharacter } from '../typing-core/key-input.js'
import { closeAudio, playComplete, playHit, playMiss } from '../typing-core/typing-audio.js'
import { SPRINT_SECONDS, resolveSprintLevel } from './typing-sprint-data.js'

// ── Спринт ───────────────────────────────────────────────────────────────────
// One minute of targets crossing the field: type a target before it reaches the
// far edge. Ported from the standalone Klavio «Спринт» with the classroom
// changes — the teacher's level picks the set and the speed, the run reports
// hits against targets that appeared, and there are no in-game controls.
//
// `total` therefore varies per run (how many targets a child got through),
// which is why the backend keeps a generous ceiling for this activity.

/** Adaptive pace: a confident child gets less time, a struggling one more. */
const PACE_MIN = 0.75
const PACE_MAX = 1.25

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options

  const { mode, items, travelMs } = resolveSprintLevel(level)
  const bag = createBag(items)

  const startedAt = Date.now()
  const endAt = performance.now() + SPRINT_SECONDS * 1000
  let spawned = 0
  let hits = 0
  let mistakes = 0
  let streak = 0
  let pace = 1
  const recent: boolean[] = []

  let targetText = ''
  let charIndex = 0
  let targetLive = false
  let targetStartedAt = 0
  let targetDuration = travelMs
  let secondsLeft = SPRINT_SECONDS
  let frameId = 0
  let finished = false
  const timers = new Set<number>()

  function later(fn: () => void, delay: number) {
    const timer = window.setTimeout(() => { timers.delete(timer); fn() }, delay)
    timers.add(timer)
  }

  container.classList.add('ts-root')
  container.innerHTML = `
    <div class="ts-stage" tabindex="-1">
      <div class="ts-hud">
        <span class="ts-hud__item"><small>Час</small><strong class="ts-time">${SPRINT_SECONDS}</strong></span>
        <span class="ts-hud__item"><small>Влучань</small><strong class="ts-hits">0</strong></span>
        <span class="ts-hud__item"><small>Серія</small><strong class="ts-streak">0</strong></span>
      </div>
      <div class="ts-field">
        <div class="ts-target" hidden>
          <span class="ts-target__done"></span><span class="ts-target__current"></span><span class="ts-target__todo"></span>
        </div>
      </div>
      <p class="ts-feedback"></p>
      <p class="ts-layout-warning" hidden>Схоже, увімкнена англійська розкладка. Перемкни її на українську — зліва внизу біля годинника.</p>
      <div class="ts-keyboard virtual-keyboard has-hint"></div>
    </div>`

  const stage = container.querySelector<HTMLElement>('.ts-stage')!
  const field = container.querySelector<HTMLElement>('.ts-field')!
  const targetEl = container.querySelector<HTMLElement>('.ts-target')!
  const doneEl = container.querySelector<HTMLElement>('.ts-target__done')!
  const currentEl = container.querySelector<HTMLElement>('.ts-target__current')!
  const todoEl = container.querySelector<HTMLElement>('.ts-target__todo')!
  const timeEl = container.querySelector<HTMLElement>('.ts-time')!
  const hitsEl = container.querySelector<HTMLElement>('.ts-hits')!
  const streakEl = container.querySelector<HTMLElement>('.ts-streak')!
  const feedbackEl = container.querySelector<HTMLElement>('.ts-feedback')!
  const warningEl = container.querySelector<HTMLElement>('.ts-layout-warning')!
  const keyboardEl = container.querySelector<HTMLElement>('.ts-keyboard')!

  const keyboard = createKeyboard(keyboardEl)
  targetEl.classList.add(`ts-target--${mode}`)

  function expected(): string { return targetText[charIndex] ?? '' }

  function setFeedback(message: string, kind?: 'good' | 'error') {
    feedbackEl.textContent = message
    feedbackEl.className = `ts-feedback${kind ? ` is-${kind}` : ''}`
  }

  function updateHud() {
    timeEl.textContent = String(Math.max(0, secondsLeft))
    hitsEl.textContent = String(hits)
    streakEl.textContent = String(streak)
  }

  function renderTarget() {
    doneEl.textContent = targetText.slice(0, charIndex)
    currentEl.textContent = displayCharacter(expected())
    todoEl.textContent = targetText.slice(charIndex + 1)
    const combo = keyboard.setHint({ value: expected() }, true)
    if (combo) setFeedback(combo)
    stage.setAttribute('aria-label', `Введіть: ${describeCharacter(expected())}`)
  }

  /** A target always starts at the safe edge and travels to the far one. */
  function offsetFor(progress: number): number {
    const maxLeft = Math.max(0, field.clientWidth - targetEl.offsetWidth - 34)
    return 18 + Math.min(1, Math.max(0, progress)) * maxLeft
  }

  function adapt(success: boolean) {
    recent.push(success)
    if (recent.length > 8) recent.shift()
    if (recent.length < 6) return
    const rate = recent.filter(Boolean).length / recent.length
    if (rate >= 0.88) pace = Math.max(PACE_MIN, pace - 0.05)
    else if (rate <= 0.58) pace = Math.min(PACE_MAX, pace + 0.06)
  }

  function spawnTarget() {
    if (finished) return
    targetText = bag.next() ?? ''
    if (!targetText) return
    charIndex = 0
    spawned += 1
    targetStartedAt = performance.now()
    targetDuration = Math.round(travelMs * pace)
    targetLive = true
    targetEl.hidden = false
    targetEl.classList.remove('is-hit', 'is-missed')
    targetEl.style.top = `${12 + Math.random() * 55}%`
    targetEl.style.left = `${offsetFor(0)}px`
    warningEl.hidden = true
    renderTarget()
    onProgress?.(hits, spawned)
  }

  function markMiss() {
    if (!targetLive) return
    targetLive = false
    streak = 0
    adapt(false)
    targetEl.classList.add('is-missed')
    setFeedback('Не встиг — наступна ціль', 'error')
    playMiss()
    updateHud()
    later(spawnTarget, 230)
  }

  function markHit() {
    targetLive = false
    hits += 1
    streak += 1
    adapt(true)
    targetEl.classList.add('is-hit')
    setFeedback(streak >= 5 ? `Серія ${streak}!` : 'Влучно', 'good')
    playHit()
    updateHud()
    onProgress?.(hits, spawned)
    later(spawnTarget, 150)
  }

  function result(): ActivityRunResult {
    // The target still in the air when the minute ends (or when the teacher
    // stops the session) was never missed, so it must not count against the
    // child: `total` is what they actually resolved.
    const resolved = spawned - (targetLive ? 1 : 0)
    return {
      correct: hits,
      total: Math.max(1, resolved),
      mistakes: Math.min(mistakes, MAX_REPORTED_MISTAKES),
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function finish() {
    if (finished) return
    finished = true
    targetLive = false
    cancelAnimationFrame(frameId)
    targetEl.hidden = true
    keyboard.clearHint()
    playComplete()
    later(() => onFinish(result()), 400)
  }

  function frame(now: number) {
    if (finished) return
    const remaining = Math.max(0, Math.ceil((endAt - now) / 1000))
    if (remaining !== secondsLeft) { secondsLeft = remaining; updateHud() }
    if (now >= endAt) { finish(); return }

    if (targetLive) {
      const progress = (now - targetStartedAt) / targetDuration
      targetEl.style.left = `${offsetFor(progress)}px`
      if (progress >= 1) markMiss()
    }
    frameId = requestAnimationFrame(frame)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (finished || !targetLive || !isTextAttempt(event)) return
    if (event.code === 'Space') event.preventDefault()

    const wanted = expected()
    if (matchesCharacter(wanted, event)) {
      charIndex += 1
      warningEl.hidden = true
      keyboard.flash(event.code, 'is-pressed-correct', 170)
      if (charIndex >= targetText.length) markHit()
      else renderTarget()
      return
    }

    mistakes += 1
    streak = 0
    adapt(false)
    keyboard.flash(event.code, 'is-pressed-error', 170)
    playMiss()
    const problem = issue(wanted, event)
    warningEl.hidden = problem !== 'layout'
    setFeedback(problem === 'layout' ? '' : 'Інша клавіша', 'error')
    updateHud()
  }

  window.addEventListener('keydown', onKeyDown)

  updateHud()
  onProgress?.(0, 0)
  spawnTarget()
  stage.focus({ preventScroll: true })
  frameId = requestAnimationFrame(frame)

  return {
    snapshot: result,
    destroy() {
      finished = true
      cancelAnimationFrame(frameId)
      timers.forEach(timer => window.clearTimeout(timer))
      timers.clear()
      window.removeEventListener('keydown', onKeyDown)
      keyboard.destroy()
      container.classList.remove('ts-root')
      container.innerHTML = ''
      closeAudio()
    },
  }
}
