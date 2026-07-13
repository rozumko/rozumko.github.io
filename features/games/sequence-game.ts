import { shuffle, starsFor, shuffledOrder, type RoundSummary } from './round-utils.js'
import type { SequenceSet } from './sequence-data.js'

// Гра «Впорядкуй кроки»: дитина тапає кроки в правильному порядку.
// Клієнтська і безключова (навчальний фідбек локально, як sorting/puzzles).
// Механіка тап-у-слот замість drag&drop — надійніша для 1–2 класу і сенсорних
// екранів. CSP-safe: динамічний текст лише через textContent.

export interface SequenceOptions {
  /** Скільки наборів у раунді (типово 3). */
  round?: number
  onComplete?: (summary: RoundSummary) => void
}

export function mountSequenceGame(root: HTMLElement, sets: SequenceSet[], opts: SequenceOptions = {}) {
  const roundSize = Math.min(opts.round ?? 3, sets.length)
  let round: SequenceSet[] = []
  let setIdx = 0
  /** Набори, складені правильно з першої перевірки. */
  let firstTryCorrect = 0
  let checkedOnce = false
  /** Порядок показу кроків у пулі (індекси правильного порядку). */
  let poolOrder: number[] = []
  /** Вибрані кроки (індекси правильного порядку) у порядку тапів. */
  let picked: number[] = []

  root.innerHTML = `
    <div class="sq">
      <div class="sq__top">
        <span class="sq__progress"></span>
        <div class="sq__bar"><div class="sq__bar-fill"></div></div>
      </div>
      <article class="sq-card">
        <h3 class="sq-card__title"></h3>
        <p class="sq-card__hint">Тапай кроки у правильному порядку</p>
        <ol class="sq-card__slots" aria-label="Складений порядок"></ol>
        <div class="sq-card__pool" role="group" aria-label="Кроки для впорядкування"></div>
      </article>
      <div class="sq__feedback-wrap">
        <p class="sq__feedback" aria-live="polite"></p>
        <button type="button" class="btn-next sq__retry hidden">Спробувати ще раз</button>
        <button type="button" class="btn-next sq__next hidden">Далі →</button>
      </div>
    </div>`

  const el = {
    progress: root.querySelector<HTMLElement>('.sq__progress')!,
    barFill:  root.querySelector<HTMLElement>('.sq__bar-fill')!,
    title:    root.querySelector<HTMLElement>('.sq-card__title')!,
    slots:    root.querySelector<HTMLElement>('.sq-card__slots')!,
    pool:     root.querySelector<HTMLElement>('.sq-card__pool')!,
    feedback: root.querySelector<HTMLElement>('.sq__feedback')!,
    retry:    root.querySelector<HTMLButtonElement>('.sq__retry')!,
    next:     root.querySelector<HTMLButtonElement>('.sq__next')!,
  }

  el.next.addEventListener('click', () => { setIdx++; renderSet() })
  el.retry.addEventListener('click', () => {
    picked = []
    el.retry.classList.add('hidden')
    el.feedback.textContent = ''
    el.feedback.className = 'sq__feedback'
    renderBoard()
  })

  function currentSet(): SequenceSet {
    return round[setIdx]
  }

  function renderSet() {
    if (setIdx >= round.length) return renderResult()
    const set = currentSet()
    checkedOnce = false
    picked = []
    poolOrder = shuffledOrder(set.steps.length)
    el.progress.textContent = `${setIdx + 1} / ${round.length}`
    el.barFill.style.width = `${(setIdx / round.length) * 100}%`
    el.title.textContent = set.title
    el.feedback.textContent = ''
    el.feedback.className = 'sq__feedback'
    el.retry.classList.add('hidden')
    el.next.classList.add('hidden')
    renderBoard()
  }

  function renderBoard() {
    const set = currentSet()

    el.slots.innerHTML = ''
    set.steps.forEach((_, slotIdx) => {
      const li = document.createElement('li')
      li.className = 'sq-slot'
      if (slotIdx < picked.length) {
        li.classList.add('sq-slot--filled')
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'sq-slot__step'
        btn.textContent = set.steps[picked[slotIdx]]
        btn.setAttribute('aria-label', `Прибрати крок: ${set.steps[picked[slotIdx]]}`)
        btn.addEventListener('click', () => {
          picked.splice(slotIdx, 1)
          renderBoard()
        })
        li.appendChild(btn)
      } else {
        li.textContent = '…'
      }
      el.slots.appendChild(li)
    })

    el.pool.innerHTML = ''
    const pickedSet = new Set(picked)
    for (const stepIdx of poolOrder) {
      if (pickedSet.has(stepIdx)) continue
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sq-step'
      btn.textContent = set.steps[stepIdx]
      btn.addEventListener('click', () => {
        picked.push(stepIdx)
        renderBoard()
        if (picked.length === set.steps.length) check()
      })
      el.pool.appendChild(btn)
    }
  }

  function check() {
    const set = currentSet()
    const ok = picked.every((stepIdx, slotIdx) => stepIdx === slotIdx)
    ;[...el.slots.children].forEach((li, slotIdx) => {
      li.classList.add(picked[slotIdx] === slotIdx ? 'sq-slot--right' : 'sq-slot--wrong')
      const btn = li.querySelector('button')
      if (btn) btn.disabled = true
    })

    if (ok) {
      if (!checkedOnce) firstTryCorrect++
      el.feedback.textContent = '✓ Чудово! Порядок складено правильно.'
      el.feedback.className = 'sq__feedback sq__feedback--ok'
      el.next.textContent = setIdx + 1 < round.length ? 'Далі →' : 'Побачити результат'
      el.next.classList.remove('hidden')
      el.next.focus()
      el.barFill.style.width = `${((setIdx + 1) / round.length) * 100}%`
    } else {
      checkedOnce = true
      el.feedback.textContent = `✗ Є неточність. Згадай: ${set.steps[0]} — перший крок.`
      el.feedback.className = 'sq__feedback sq__feedback--bad'
      el.retry.classList.remove('hidden')
      el.retry.focus()
    }
  }

  function renderResult() {
    const stars = starsFor(firstTryCorrect, round.length)
    opts.onComplete?.({ correct: firstTryCorrect, total: round.length, stars })
    el.progress.textContent = ''
    el.feedback.textContent = ''
    el.feedback.className = 'sq__feedback'
    el.retry.classList.add('hidden')
    el.next.classList.add('hidden')
    el.pool.innerHTML = ''
    el.slots.innerHTML = ''
    el.title.textContent = ''
    root.querySelector<HTMLElement>('.sq-card')!.innerHTML = `
      <div class="sq-done">
        <p class="sq-done__stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <p class="sq-done__title">З першої спроби: ${firstTryCorrect} з ${round.length}!</p>
      </div>`
  }

  round = shuffle(sets).slice(0, roundSize)
  renderSet()
}
