import { shuffle, starsFor, type RoundSummary } from './round-utils.js'
import type { ScenarioItem } from './scenarios-data.js'

// Гра «Як вчинити?»: ситуація + вибір найкращої дії з поясненням.
// Клієнтська і безключова (навчальний фідбек локально, як fact-opinion).
// CSP-safe: динамічний текст лише через textContent.

export interface ScenariosOptions {
  /** Скільки ситуацій у раунді (типово 4). */
  round?: number
  onComplete?: (summary: RoundSummary) => void
}

export function mountScenarios(root: HTMLElement, items: ScenarioItem[], opts: ScenariosOptions = {}) {
  const roundSize = Math.min(opts.round ?? 4, items.length)
  let round: ScenarioItem[] = []
  let idx = 0
  let correctCount = 0
  let answered = false

  root.innerHTML = `
    <div class="sc">
      <div class="sc__top">
        <span class="sc__progress"></span>
        <div class="sc__bar"><div class="sc__bar-fill"></div></div>
      </div>
      <div class="sc__stage" aria-live="polite"></div>
      <div class="sc__feedback-wrap">
        <p class="sc__feedback" aria-live="polite"></p>
        <button type="button" class="btn-next sc__next hidden">Далі →</button>
      </div>
    </div>`

  const el = {
    progress: root.querySelector<HTMLElement>('.sc__progress')!,
    barFill:  root.querySelector<HTMLElement>('.sc__bar-fill')!,
    stage:    root.querySelector<HTMLElement>('.sc__stage')!,
    feedback: root.querySelector<HTMLElement>('.sc__feedback')!,
    next:     root.querySelector<HTMLButtonElement>('.sc__next')!,
  }
  el.next.addEventListener('click', () => { idx++; renderCurrent() })

  function renderCurrent() {
    if (idx >= round.length) return renderResult()
    answered = false
    el.feedback.textContent = ''
    el.feedback.className = 'sc__feedback'
    el.next.classList.add('hidden')

    const item = round[idx]
    el.progress.textContent = `${idx + 1} / ${round.length}`
    el.barFill.style.width = `${(idx / round.length) * 100}%`

    el.stage.innerHTML = `
      <article class="sc-card">
        <p class="sc-card__emoji" aria-hidden="true"></p>
        <p class="sc-card__text"></p>
        <p class="sc-card__hint">Як вчинити найкраще?</p>
        <div class="sc-card__answers" role="group" aria-label="Варіанти дій"></div>
      </article>`
    el.stage.querySelector<HTMLElement>('.sc-card__emoji')!.textContent = item.emoji
    el.stage.querySelector<HTMLElement>('.sc-card__text')!.textContent = item.text

    const answers = el.stage.querySelector<HTMLElement>('.sc-card__answers')!
    // Перемішуємо варіанти, щоб правильний не стояв завжди першим.
    for (const option of shuffle(item.options)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sc-answer'
      btn.textContent = option.label
      btn.addEventListener('click', () => answer(option.correct, option.feedback, btn))
      answers.appendChild(btn)
    }
  }

  function answer(ok: boolean, feedback: string, btn: HTMLButtonElement) {
    if (answered) return
    answered = true
    if (ok) correctCount++

    const item = round[idx]
    el.stage.querySelectorAll<HTMLButtonElement>('.sc-answer').forEach(b => {
      b.disabled = true
      const original = item.options.find(option => option.label === b.textContent)
      if (original?.correct) b.classList.add('sc-answer--right')
    })
    if (!ok) btn.classList.add('sc-answer--wrong')

    el.feedback.textContent = `${ok ? '✓' : '✗'} ${feedback}`
    el.feedback.className = `sc__feedback ${ok ? 'sc__feedback--ok' : 'sc__feedback--bad'}`
    el.next.textContent = idx + 1 < round.length ? 'Далі →' : 'Побачити результат'
    el.next.classList.remove('hidden')
    el.next.focus()
    el.barFill.style.width = `${((idx + 1) / round.length) * 100}%`
  }

  function renderResult() {
    const stars = starsFor(correctCount, round.length)
    opts.onComplete?.({ correct: correctCount, total: round.length, stars })
    el.progress.textContent = ''
    el.feedback.textContent = ''
    el.feedback.className = 'sc__feedback'
    el.next.classList.add('hidden')
    el.stage.innerHTML = `
      <div class="sc-done">
        <p class="sc-done__stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <p class="sc-done__title">Правильно ${correctCount} з ${round.length}!</p>
      </div>`
  }

  round = shuffle(items).slice(0, roundSize)
  renderCurrent()
}
