import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { codesForTarget } from '../typing-core/keyboard-layout.js'
import { createKeyboard } from '../typing-core/keyboard-view.js'
import { buildRound } from '../typing-core/round.js'
import { isTargetAttempt, issue, matchesTarget } from '../typing-core/key-input.js'
import { closeAudio, playComplete, playHit, playMiss } from '../typing-core/typing-audio.js'
import { ENCOURAGEMENT, KEY_SETS, RETRY, ROUND_LENGTH, type KeyPracticeTarget } from './typing-keys-data.js'

// ── Знайди клавішу ───────────────────────────────────────────────────────────
// The child is shown one key at a time and has to find it on the real keyboard.
// Ported from the standalone Klavio «Старт» trainer with the same three changes
// every School activity gets:
//   1. everything lives inside the given container,
//   2. the target set comes from the teacher's level instead of an in-game menu,
//   3. the run reports correct/total/mistakes/durationSec via ActivityHandle.
//
// The child retries a target until it is right, so a finished run is always
// 12/12 and the mistake count is what separates one run from another.

/** Keys the browser acts on itself: Alt opens the menu, Backspace navigates. */
const BROWSER_KEYS = ['Space', 'Backspace', 'Enter', 'AltLeft', 'AltRight']

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options

  const targets = KEY_SETS[level] ?? KEY_SETS['starter']!
  const sequence = buildRound(targets, ROUND_LENGTH)
  const total = sequence.length

  const startedAt = Date.now()
  let position = 0
  let correct = 0
  let mistakes = 0
  let currentTarget: KeyPracticeTarget | null = null
  /** Physical keys of the current target; resolved once per target. */
  let currentCodes: readonly string[] = []
  let inputLocked = false
  let finished = false
  const timers = new Set<number>()

  function later(fn: () => void, delay: number) {
    const timer = window.setTimeout(() => { timers.delete(timer); fn() }, delay)
    timers.add(timer)
  }

  container.classList.add('tk-root')
  container.innerHTML = `
    <div class="tk-stage" tabindex="-1">
      <div class="tk-task">
        <p class="tk-task__caption">Знайди клавішу</p>
        <div class="tk-target"></div>
        <p class="tk-combo"></p>
      </div>
      <p class="tk-feedback"></p>
      <p class="tk-layout-warning" hidden>Схоже, увімкнена англійська розкладка. Перемкни її на українську — зліва внизу біля годинника.</p>
      <div class="tk-keyboard virtual-keyboard"></div>
      <label class="tk-toggle">
        <input type="checkbox" checked> Показувати підказку на клавіатурі
      </label>
    </div>`

  const stage = container.querySelector<HTMLElement>('.tk-stage')!
  const targetEl = container.querySelector<HTMLElement>('.tk-target')!
  const comboEl = container.querySelector<HTMLElement>('.tk-combo')!
  const feedbackEl = container.querySelector<HTMLElement>('.tk-feedback')!
  const warningEl = container.querySelector<HTMLElement>('.tk-layout-warning')!
  const keyboardEl = container.querySelector<HTMLElement>('.tk-keyboard')!
  const hintToggle = container.querySelector<HTMLInputElement>('.tk-toggle input')!

  const keyboard = createKeyboard(keyboardEl)
  keyboard.setAllowedTargets(targets)

  function setFeedback(message: string, kind?: 'success' | 'error') {
    feedbackEl.textContent = message
    feedbackEl.className = `tk-feedback${kind ? ` is-${kind}` : ''}`
  }

  function updateHighlight() {
    keyboardEl.classList.toggle('has-hint', hintToggle.checked)
    comboEl.textContent = keyboard.setHint(currentTarget, hintToggle.checked)
  }

  function renderTarget() {
    const target = sequence[position]
    if (!target) return
    currentTarget = target
    currentCodes = codesForTarget(target)
    inputLocked = false

    targetEl.textContent = target.label
    targetEl.className = `tk-target${target.label.length > 2 ? ' tk-target--word' : ''}`
    warningEl.hidden = true
    setFeedback(hintToggle.checked ? 'Підказка світиться на клавіатурі' : 'Спробуй знайти клавішу без підказки')
    updateHighlight()
    stage.focus({ preventScroll: true })
  }

  function result(): ActivityRunResult {
    return {
      correct,
      total,
      mistakes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function finish() {
    if (finished) return
    finished = true
    inputLocked = true
    keyboard.clearHint()
    playComplete()
    later(() => onFinish(result()), 500)
  }

  function handleCorrect(event: KeyboardEvent) {
    inputLocked = true
    correct += 1
    warningEl.hidden = true
    targetEl.classList.add('is-correct')
    setFeedback(randomItem(ENCOURAGEMENT), 'success')
    keyboard.flash(event.code, 'is-pressed-correct', 360)
    playHit()
    onProgress?.(correct, total)

    if (position + 1 >= total) { later(finish, 420); return }
    later(() => { position += 1; renderTarget() }, 330)
  }

  function handleError(event: KeyboardEvent) {
    mistakes += 1
    targetEl.classList.remove('is-error')
    void targetEl.offsetWidth
    targetEl.classList.add('is-error')
    keyboard.flash(event.code, 'is-pressed-error', 360)
    playMiss()

    // A Latin letter instead of a Ukrainian one is a layout problem, not a
    // mistake the child can fix by looking harder.
    if (currentTarget && issue(currentTarget.value, event) === 'layout') {
      warningEl.hidden = false
      setFeedback('')
    } else {
      warningEl.hidden = true
      setFeedback(randomItem(RETRY), 'error')
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (finished || inputLocked || !currentTarget) return
    // The hint checkbox is the only focusable control on the stage; while it has
    // focus, Space belongs to it.
    if (document.activeElement === hintToggle) return

    if (BROWSER_KEYS.includes(event.code)) event.preventDefault()
    if (!isTargetAttempt(currentTarget, event, currentCodes)) return

    if (matchesTarget(currentTarget, event, currentCodes)) handleCorrect(event)
    else handleError(event)
  }

  function onToggleChange() {
    updateHighlight()
    setFeedback(hintToggle.checked ? 'Підказка світиться на клавіатурі' : 'Спробуй знайти клавішу без підказки')
    // Hand the keyboard back to the game, or the next Space would flip the
    // checkbox instead of answering.
    hintToggle.blur()
    stage.focus({ preventScroll: true })
  }

  hintToggle.addEventListener('change', onToggleChange)
  window.addEventListener('keydown', onKeyDown)

  onProgress?.(0, total)
  renderTarget()

  return {
    snapshot: result,
    destroy() {
      finished = true
      timers.forEach(timer => window.clearTimeout(timer))
      timers.clear()
      window.removeEventListener('keydown', onKeyDown)
      hintToggle.removeEventListener('change', onToggleChange)
      keyboard.destroy()
      container.classList.remove('tk-root')
      container.innerHTML = ''
      closeAudio()
    },
  }
}
