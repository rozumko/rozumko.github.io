import { shuffle, starsFor, type RoundSummary } from './round-utils.js'
import type { ClickTrainerRound } from './click-trainer-data.js'

// Click-trainer: the child reads the lead, finds the right card among the
// options and taps it. First-try precision earns the stars, so the game
// trains careful pointing rather than guessing. Client-side and keyless
// (formative feedback stays local, like sorting/sequence). CSP-safe: dynamic
// text only through textContent.

export interface ClickTrainerOptions {
  /** How many rounds to play (default: all authored rounds). */
  round?: number
  onComplete?: (summary: RoundSummary) => void
}

export function mountClickTrainer(root: HTMLElement, rounds: ClickTrainerRound[], opts: ClickTrainerOptions = {}) {
  const roundSize = Math.min(opts.round ?? rounds.length, rounds.length)
  const played = rounds.slice(0, roundSize)
  let roundIdx = 0
  let firstTryCorrect = 0
  let missedThisRound = false

  root.innerHTML = `
    <div class="ct">
      <div class="ct__top">
        <span class="ct__progress"></span>
        <div class="ct__bar"><div class="ct__bar-fill"></div></div>
      </div>
      <article class="ct-card">
        <p class="ct-card__lead"></p>
        <div class="ct-card__target">
          <span class="ct-card__target-emoji" aria-hidden="true"></span>
          <strong class="ct-card__target-label"></strong>
        </div>
        <div class="ct-card__options" role="group" aria-label="Картки для вибору"></div>
      </article>
      <div class="ct__feedback-wrap">
        <p class="ct__feedback" aria-live="polite"></p>
        <button type="button" class="btn-next ct__next hidden">Далі →</button>
      </div>
    </div>`

  const el = {
    progress: root.querySelector<HTMLElement>('.ct__progress')!,
    barFill:  root.querySelector<HTMLElement>('.ct__bar-fill')!,
    lead:     root.querySelector<HTMLElement>('.ct-card__lead')!,
    targetEmoji: root.querySelector<HTMLElement>('.ct-card__target-emoji')!,
    targetLabel: root.querySelector<HTMLElement>('.ct-card__target-label')!,
    options:  root.querySelector<HTMLElement>('.ct-card__options')!,
    feedback: root.querySelector<HTMLElement>('.ct__feedback')!,
    next:     root.querySelector<HTMLButtonElement>('.ct__next')!,
  }

  el.next.addEventListener('click', () => { roundIdx++; renderRound() })

  function renderRound() {
    if (roundIdx >= played.length) return renderResult()
    const round = played[roundIdx]
    missedThisRound = false
    el.progress.textContent = `${roundIdx + 1} / ${played.length}`
    el.barFill.style.width = `${(roundIdx / played.length) * 100}%`
    el.lead.textContent = round.lead
    el.targetEmoji.textContent = round.target.emoji
    el.targetLabel.textContent = round.target.label
    el.feedback.textContent = ''
    el.feedback.className = 'ct__feedback'
    el.next.classList.add('hidden')

    el.options.innerHTML = ''
    for (const option of shuffle(round.options)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ct-option'
      const emoji = document.createElement('span')
      emoji.className = 'ct-option__emoji'
      emoji.setAttribute('aria-hidden', 'true')
      emoji.textContent = option.emoji
      const label = document.createElement('span')
      label.textContent = option.label
      btn.append(emoji, label)
      btn.addEventListener('click', () => { pick(btn, option.correct, option.feedback) })
      el.options.appendChild(btn)
    }
  }

  function pick(btn: HTMLButtonElement, correct: boolean, feedback: string) {
    if (correct) {
      if (!missedThisRound) firstTryCorrect++
      btn.classList.add('ct-option--right')
      el.options.querySelectorAll('button').forEach(button => { button.disabled = true })
      el.feedback.textContent = `✓ ${feedback}`
      el.feedback.className = 'ct__feedback ct__feedback--ok'
      el.next.textContent = roundIdx + 1 < played.length ? 'Далі →' : 'Побачити результат'
      el.next.classList.remove('hidden')
      el.next.focus()
      el.barFill.style.width = `${((roundIdx + 1) / played.length) * 100}%`
    } else {
      missedThisRound = true
      btn.classList.add('ct-option--wrong')
      btn.disabled = true
      el.feedback.textContent = `✗ ${feedback}`
      el.feedback.className = 'ct__feedback ct__feedback--bad'
    }
  }

  function renderResult() {
    const stars = starsFor(firstTryCorrect, played.length)
    opts.onComplete?.({ correct: firstTryCorrect, total: played.length, stars })
    el.progress.textContent = ''
    el.feedback.textContent = ''
    el.feedback.className = 'ct__feedback'
    el.next.classList.add('hidden')
    root.querySelector<HTMLElement>('.ct-card')!.innerHTML = `
      <div class="ct-done">
        <p class="ct-done__stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <p class="ct-done__title">З першої спроби: ${firstTryCorrect} з ${played.length}!</p>
      </div>`
  }

  renderRound()
}
