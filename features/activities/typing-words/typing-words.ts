import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import { createKeyboard } from '../typing-core/keyboard-view.js'
import { MAX_REPORTED_MISTAKES, buildRound } from '../typing-core/round.js'
import { describeCharacter, displayCharacter, isTextAttempt, issue, matchesCharacter } from '../typing-core/key-input.js'
import { closeAudio, playComplete, playHit, playMiss } from '../typing-core/typing-audio.js'
import { ROUND_SIZE, resolveWordsLevel } from './typing-words-data.js'
import { wordsRecovery } from './typing-words-recovery.js'

// ── Type words ───────────────────────────────────────────────────────────────
// The child types a word (or a sentence) character by character; the keyboard
// always lights the next key. Ported from the standalone Klavio «Слова»
// trainer, with the level and the round length coming from the teacher.
//
// A wrong key does not advance the text, so a finished run is always
// 18/18 (or 5/5) and the mistake count is the accuracy signal.

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options

  const { mode, items } = resolveWordsLevel(level)
  const recovered = wordsRecovery(options.resumeState, level, items, ROUND_SIZE[mode])
  const tasks = recovered?.tasks ?? buildRound(items, ROUND_SIZE[mode])
  const total = tasks.length

  const startedAt = Date.now() - (recovered?.durationSec ?? 0) * 1000
  let taskIndex = recovered?.taskIndex ?? 0
  let charIndex = recovered?.charIndex ?? 0
  let mistakes = recovered?.mistakes ?? 0
  let locked = false
  let finished = false
  const timers = new Set<number>()

  function later(fn: () => void, delay: number) {
    const timer = window.setTimeout(() => { timers.delete(timer); fn() }, delay)
    timers.add(timer)
  }

  container.classList.add('tw-root')
  container.innerHTML = `
    <div class="tw-stage" tabindex="-1">
      <p class="tw-caption">${mode === 'sentences' ? 'Друкуй речення' : 'Друкуй слово'}</p>
      <p class="tw-target${mode === 'sentences' ? ' tw-target--sentence' : ''}">
        <span class="tw-target__done"></span><span class="tw-target__current"></span><span class="tw-target__todo"></span>
      </p>
      <p class="tw-next"></p>
      <p class="tw-feedback"></p>
      <p class="tw-layout-warning" hidden>Схоже, увімкнена англійська розкладка. Перемкни її на українську — зліва внизу біля годинника.</p>
      <div class="tw-keyboard virtual-keyboard has-hint"></div>
    </div>`

  const stage = container.querySelector<HTMLElement>('.tw-stage')!
  const doneEl = container.querySelector<HTMLElement>('.tw-target__done')!
  const currentEl = container.querySelector<HTMLElement>('.tw-target__current')!
  const todoEl = container.querySelector<HTMLElement>('.tw-target__todo')!
  const nextEl = container.querySelector<HTMLElement>('.tw-next')!
  const feedbackEl = container.querySelector<HTMLElement>('.tw-feedback')!
  const warningEl = container.querySelector<HTMLElement>('.tw-layout-warning')!
  const keyboardEl = container.querySelector<HTMLElement>('.tw-keyboard')!

  const keyboard = createKeyboard(keyboardEl)
  const touchInput = document.createElement('input')
  touchInput.type = 'text'
  touchInput.className = 'tw-touch-input'
  touchInput.setAttribute('aria-label', 'Друкуй наступну літеру')
  touchInput.placeholder = 'Торкнись, щоб друкувати'
  touchInput.autocomplete = 'off'
  touchInput.setAttribute('autocapitalize', 'off')
  touchInput.spellcheck = false
  stage.append(touchInput)

  function currentTask(): string { return tasks[taskIndex] ?? '' }
  function expected(): string { return currentTask()[charIndex] ?? '' }

  function setFeedback(message: string, kind?: 'success' | 'error') {
    feedbackEl.textContent = message
    feedbackEl.className = `tw-feedback${kind ? ` is-${kind}` : ''}`
  }

  function renderTarget(fallbackFeedback = '') {
    const task = currentTask()
    doneEl.textContent = task.slice(0, charIndex)
    currentEl.textContent = displayCharacter(expected())
    todoEl.textContent = task.slice(charIndex + 1)

    // A glimpse of what is coming keeps the rhythm going between items.
    nextEl.textContent = tasks.slice(taskIndex + 1, taskIndex + (mode === 'words' ? 4 : 3)).join('   ')

    const combo = keyboard.setHint({ value: expected() }, true)
    stage.setAttribute('aria-label', `Введіть символ: ${describeCharacter(expected())}`)
    setFeedback(combo || fallbackFeedback)
  }

  function result(): ActivityRunResult {
    return {
      correct: taskIndex,
      total,
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
    later(() => onFinish(result()), 400)
  }

  function completeTask() {
    locked = true
    taskIndex += 1
    charIndex = 0
    playHit()
    setFeedback('Готово', 'success')
    onProgress?.(taskIndex, total)
    options.onCheckpoint?.()

    if (taskIndex >= total) { later(finish, 220); return }
    later(() => {
      locked = false
      renderTarget('Продовжуй у своєму темпі')
      if (document.activeElement !== touchInput) stage.focus({ preventScroll: true })
    }, 170)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.target === touchInput) return
    processKey(event)
  }

  function processKey(event: KeyboardEvent) {
    if (finished || locked || !isTextAttempt(event)) return
    if (event.code === 'Space') event.preventDefault()

    const wanted = expected()
    if (matchesCharacter(wanted, event)) {
      charIndex += 1
      warningEl.hidden = true
      keyboard.flash(event.code, 'is-pressed-correct', 180)
      if (charIndex >= currentTask().length) { completeTask(); return }
      renderTarget()
      options.onCheckpoint?.()
      return
    }

    mistakes += 1
    options.onCheckpoint?.()
    keyboard.flash(event.code, 'is-pressed-error', 180)
    playMiss()
    const problem = issue(wanted, event)
    warningEl.hidden = problem !== 'layout'
    setFeedback(
      problem === 'case' ? 'Зверни увагу на велику літеру' : problem === 'layout' ? '' : 'Спробуй ще раз',
      'error',
    )
  }

  window.addEventListener('keydown', onKeyDown)
  touchInput.addEventListener('input', () => {
    const key = touchInput.value
    touchInput.value = ''
    if ([...key].length !== 1) return
    const isG = key.toLocaleLowerCase('uk') === 'ґ'
    processKey(new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : isG ? 'KeyU' : '', ctrlKey: isG, altKey: isG }))
  })

  onProgress?.(taskIndex, total)
  renderTarget('Починай, коли готовий')
  if (taskIndex >= total) finish()
  else if (charIndex >= currentTask().length) completeTask()
  stage.focus({ preventScroll: true })

  return {
    snapshot: result,
    checkpoint: () => ({ version: 1, level, tasks: [...tasks], taskIndex, charIndex, mistakes: Math.min(mistakes, MAX_REPORTED_MISTAKES), durationSec: result().durationSec }),
    destroy() {
      finished = true
      timers.forEach(timer => window.clearTimeout(timer))
      timers.clear()
      window.removeEventListener('keydown', onKeyDown)
      keyboard.destroy()
      container.classList.remove('tw-root')
      container.innerHTML = ''
      closeAudio()
    },
  }
}
