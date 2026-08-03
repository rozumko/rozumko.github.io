import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { comboHintForCharacter, hintsForCharacter } from '../typing-core/keyboard-layout.js'
import { createKeyboard } from '../typing-core/keyboard-view.js'
import { MAX_REPORTED_MISTAKES } from '../typing-core/round.js'
import { textWindow } from '../typing-core/text-window.js'
import { describeCharacter, displayCharacter, isTextAttempt, issue, matchesCharacter } from '../typing-core/key-input.js'
import { closeAudio, playComplete, playHit, playMiss } from '../typing-core/typing-audio.js'
import { resolveLessonsLevel } from './typing-lessons-data.js'

// ── Уроки друку ──────────────────────────────────────────────────────────────
// The child works through a series of lessons in order, typing each text with
// the correct finger. Ported from the standalone Klavio «Уроки» with the
// classroom changes: the teacher picks the series and how much help the screen
// gives, and there is no lesson dropdown inside the activity.
//
// Unlike the other typing activities, a class period rarely covers a whole
// series — so the run is measured in characters, not lessons. A child who got
// through two lessons accurately still has an honest result.
//
// The finger hint is a line of text plus the colour of the keycap; the
// standalone trainer's calibrated hand drawings are not ported yet.

function handLabel(hand: string): string {
  if (hand === 'left') return 'Ліва рука'
  if (hand === 'right') return 'Права рука'
  return 'Обидві руки'
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options

  const { series, hints, lessons, totalCharacters } = resolveLessonsLevel(level)

  const startedAt = Date.now()
  let lessonIndex = 0
  let position = 0
  /** Characters typed correctly across the whole series. */
  let typed = 0
  let mistakes = 0
  let locked = false
  let finished = false
  const timers = new Set<number>()

  function later(fn: () => void, delay: number) {
    const timer = window.setTimeout(() => { timers.delete(timer); fn() }, delay)
    timers.add(timer)
  }

  container.classList.add('tl-root')
  container.innerHTML = `
    <div class="tl-stage" tabindex="-1">
      <p class="tl-caption">
        <span class="tl-series">${series.title}</span>
        <span class="tl-lesson"></span>
      </p>
      <p class="tl-text">
        <span class="tl-text__done"></span><span class="tl-text__current"></span><span class="tl-text__todo"></span>
      </p>
      <p class="tl-finger"${hints.finger ? '' : ' hidden'}></p>
      <p class="tl-combo"></p>
      <p class="tl-feedback"></p>
      <p class="tl-layout-warning" hidden>Схоже, увімкнена англійська розкладка. Перемкни її на українську — зліва внизу біля годинника.</p>
      <div class="tl-keyboard virtual-keyboard${hints.keyboard ? ' has-hint' : ''}"></div>
    </div>`

  const stage = container.querySelector<HTMLElement>('.tl-stage')!
  const lessonEl = container.querySelector<HTMLElement>('.tl-lesson')!
  const doneEl = container.querySelector<HTMLElement>('.tl-text__done')!
  const currentEl = container.querySelector<HTMLElement>('.tl-text__current')!
  const todoEl = container.querySelector<HTMLElement>('.tl-text__todo')!
  const fingerEl = container.querySelector<HTMLElement>('.tl-finger')!
  const comboEl = container.querySelector<HTMLElement>('.tl-combo')!
  const feedbackEl = container.querySelector<HTMLElement>('.tl-feedback')!
  const warningEl = container.querySelector<HTMLElement>('.tl-layout-warning')!
  const keyboardEl = container.querySelector<HTMLElement>('.tl-keyboard')!

  const keyboard = createKeyboard(keyboardEl)

  function currentText(): string { return lessons[lessonIndex]?.text ?? '' }
  function expected(): string { return currentText()[position] ?? '' }

  function setFeedback(message: string, kind?: 'success' | 'error') {
    feedbackEl.textContent = message
    feedbackEl.className = `tl-feedback${kind ? ` is-${kind}` : ''}`
  }

  function renderFingerHint() {
    if (!hints.finger) return
    const found = hintsForCharacter(expected())
    if (found.length === 0) { fingerEl.textContent = '—'; return }
    const main = found[0]!
    fingerEl.textContent = found.length > 1
      ? `${handLabel(main.hand)} · ${main.name} + Shift`
      : `${handLabel(main.hand)} · ${main.name}`
  }

  function renderText() {
    const view = textWindow(currentText(), position)
    doneEl.textContent = view.done
    currentEl.textContent = displayCharacter(view.current)
    currentEl.classList.toggle('is-space', view.current === ' ')
    todoEl.textContent = view.todo

    const lesson = lessons[lessonIndex]
    lessonEl.textContent = lesson
      ? `Урок ${lessonIndex + 1} з ${lessons.length} · ${lesson.focus}`
      : ''

    const lit = keyboard.setHint({ value: expected() }, hints.keyboard)
    // The combination (Shift, or Ctrl+Alt for «ґ») is shown even when the
    // keyboard hint is off — otherwise «ґ» cannot be typed at all.
    const combo = lit || comboHintForCharacter(expected())
    comboEl.textContent = combo
    comboEl.hidden = !combo

    renderFingerHint()
    stage.setAttribute('aria-label', `Введіть символ: ${describeCharacter(expected())}`)
  }

  function result(): ActivityRunResult {
    return {
      correct: typed,
      total: totalCharacters,
      mistakes: Math.min(mistakes, MAX_REPORTED_MISTAKES),
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function finish() {
    if (finished) return
    finished = true
    locked = true
    keyboard.clearHint()
    playComplete()
    later(() => onFinish(result()), 500)
  }

  function completeLesson() {
    locked = true
    playComplete()
    setFeedback(`Урок ${lessonIndex + 1} завершено`, 'success')

    if (lessonIndex + 1 >= lessons.length) { later(finish, 500); return }
    later(() => {
      lessonIndex += 1
      position = 0
      locked = false
      renderText()
      setFeedback('Наступний урок — починай, коли готовий')
      stage.focus({ preventScroll: true })
    }, 900)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (finished || locked || !isTextAttempt(event)) return
    if (event.code === 'Space') event.preventDefault()

    const wanted = expected()
    if (matchesCharacter(wanted, event)) {
      position += 1
      typed += 1
      warningEl.hidden = true
      keyboard.flash(event.code, 'is-pressed-correct', 160)
      onProgress?.(typed, totalCharacters)
      if (position >= currentText().length) { playHit(); completeLesson(); return }
      renderText()
      return
    }

    mistakes += 1
    keyboard.flash(event.code, 'is-pressed-error', 160)
    playMiss()
    const problem = issue(wanted, event)
    warningEl.hidden = problem !== 'layout'
    setFeedback(
      problem === 'case' ? 'Зверни увагу на велику літеру' : problem === 'layout' ? '' : 'Спробуй ще раз',
      'error',
    )
  }

  window.addEventListener('keydown', onKeyDown)

  onProgress?.(0, totalCharacters)
  renderText()
  setFeedback('Починай, коли готовий')
  stage.focus({ preventScroll: true })

  return {
    snapshot: result,
    destroy() {
      finished = true
      timers.forEach(timer => window.clearTimeout(timer))
      timers.clear()
      window.removeEventListener('keydown', onKeyDown)
      keyboard.destroy()
      container.classList.remove('tl-root')
      container.innerHTML = ''
      closeAudio()
    },
  }
}
