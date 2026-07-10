// Гра «Факт чи думка?» — критичне мислення / медіаграмотність.
// Клієнтська і безключова (навчальний фідбек локально, як sorting/puzzles).
// Дитина читає твердження і обирає категорію; після відповіді — пояснення
// і джерело (якщо є URL). CSP-safe: лише addEventListener.

export type FoCategory = 'fact' | 'opinion' | 'myth'

export interface FoStatement {
  id: string
  text: string
  explanation: string
  category: FoCategory
  sourceTitle?: string
  sourceUrl?: string
  sourceLanguage?: 'uk' | 'en'
}

export interface FoSummary {
  correct: number
  total: number
  stars: number
}

export interface FoOptions {
  /** Скільки тверджень у раунді (типово 10). */
  round?: number
  onComplete?: (summary: FoSummary) => void
}

export const FO_CATEGORY_LABELS: Record<FoCategory, string> = {
  fact:    '✅ Факт',
  opinion: '💬 Думка',
  myth:    '🔮 Міф',
}

const CATEGORY_FEEDBACK: Record<FoCategory, string> = {
  fact:    'Це факт — його можна перевірити.',
  opinion: 'Це думка — у різних людей вона різна.',
  myth:    'Це міф — так кажуть, але це не підтверджено.',
}

function starsFor(correct: number, total: number): number {
  if (correct === total) return 3
  if (correct >= Math.ceil(total * 0.75)) return 2
  return 1
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Збалансований раунд: категорії беруться по черзі, щоб жодна не домінувала. */
export function pickFoRound(statements: FoStatement[], count: number): FoStatement[] {
  const byCat = new Map<FoCategory, FoStatement[]>()
  for (const s of statements) {
    if (!byCat.has(s.category)) byCat.set(s.category, [])
    byCat.get(s.category)!.push(s)
  }
  const pools = shuffle([...byCat.values()].map(shuffle))
  const out: FoStatement[] = []
  let i = 0
  while (out.length < count && pools.some(p => p.length)) {
    const pool = pools[i % pools.length]
    const item = pool.pop()
    if (item) out.push(item)
    i++
  }
  return shuffle(out)
}

/** Категорії раунду в стабільному порядку (кнопки відповіді). */
function categoriesOf(statements: FoStatement[]): FoCategory[] {
  const order: FoCategory[] = ['fact', 'opinion', 'myth']
  const present = new Set(statements.map(s => s.category))
  return order.filter(c => present.has(c))
}

export function mountFactOpinion(root: HTMLElement, statements: FoStatement[], opts: FoOptions = {}) {
  const roundSize = opts.round ?? 10
  let round: FoStatement[] = []
  let cats: FoCategory[] = []
  let idx = 0
  let correctCount = 0
  let answered = false

  root.innerHTML = `
    <div class="fo">
      <div class="fo__top">
        <span class="fo__progress"></span>
        <div class="fo__bar"><div class="fo__bar-fill"></div></div>
      </div>
      <div class="fo__stage" aria-live="polite"></div>
      <div class="fo__feedback-wrap">
        <p class="fo__feedback" aria-live="polite"></p>
        <p class="fo__explanation hidden"></p>
        <p class="fo__source hidden"></p>
        <button class="btn-next fo__next hidden">Далі →</button>
      </div>
    </div>`

  const el = {
    progress:    root.querySelector<HTMLElement>('.fo__progress')!,
    barFill:     root.querySelector<HTMLElement>('.fo__bar-fill')!,
    stage:       root.querySelector<HTMLElement>('.fo__stage')!,
    feedback:    root.querySelector<HTMLElement>('.fo__feedback')!,
    explanation: root.querySelector<HTMLElement>('.fo__explanation')!,
    source:      root.querySelector<HTMLElement>('.fo__source')!,
    next:        root.querySelector<HTMLButtonElement>('.fo__next')!,
  }
  el.next.addEventListener('click', () => { idx++; renderCurrent() })

  function renderCurrent() {
    if (idx >= round.length) return renderResult()
    answered = false
    el.feedback.textContent = ''
    el.feedback.className = 'fo__feedback'
    el.explanation.textContent = ''
    el.explanation.classList.add('hidden')
    el.source.innerHTML = ''
    el.source.classList.add('hidden')
    el.next.classList.add('hidden')

    const s = round[idx]
    el.progress.textContent = `${idx + 1} / ${round.length}`
    el.barFill.style.width = `${(idx / round.length) * 100}%`

    el.stage.innerHTML = `
      <article class="fo-card">
        <p class="fo-card__text"></p>
        <p class="fo-card__hint">Що це за твердження?</p>
        <div class="fo-card__answers" role="group" aria-label="Вибір категорії"></div>
      </article>`
    el.stage.querySelector<HTMLElement>('.fo-card__text')!.textContent = s.text

    const answers = el.stage.querySelector<HTMLElement>('.fo-card__answers')!
    for (const cat of cats) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `fo-answer fo-answer--${cat}`
      btn.textContent = FO_CATEGORY_LABELS[cat]
      btn.addEventListener('click', () => answer(cat, btn))
      answers.appendChild(btn)
    }
  }

  function answer(cat: FoCategory, btn: HTMLButtonElement) {
    if (answered) return
    answered = true
    const s = round[idx]
    const ok = cat === s.category
    if (ok) correctCount++

    el.stage.querySelectorAll<HTMLButtonElement>('.fo-answer').forEach(b => {
      b.disabled = true
      if (b.textContent === FO_CATEGORY_LABELS[s.category]) b.classList.add('fo-answer--right')
    })
    if (!ok) btn.classList.add('fo-answer--wrong')

    el.feedback.textContent = ok
      ? `✓ Так! ${CATEGORY_FEEDBACK[s.category]}`
      : `✗ Насправді — ${FO_CATEGORY_LABELS[s.category].replace(/^\S+\s/, '').toLowerCase()}. ${CATEGORY_FEEDBACK[s.category]}`
    el.feedback.className = `fo__feedback ${ok ? 'fo__feedback--ok' : 'fo__feedback--bad'}`
    el.explanation.textContent = s.explanation
    el.explanation.classList.remove('hidden')

    if (s.category === 'fact' && s.sourceUrl) {
      const lang = s.sourceLanguage === 'en' ? ' (англійською)' : ''
      const a = document.createElement('a')
      a.href = s.sourceUrl
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = `${s.sourceTitle ?? 'джерело'}${lang}`
      el.source.textContent = 'Перевір сам: '
      el.source.appendChild(a)
      el.source.classList.remove('hidden')
    }

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
    el.feedback.className = 'fo__feedback'
    el.explanation.classList.add('hidden')
    el.source.classList.add('hidden')
    el.next.classList.add('hidden')
    el.stage.innerHTML = `
      <div class="fo-done">
        <p class="fo-done__stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <p class="fo-done__title">Вгадано ${correctCount} з ${round.length}!</p>
        <button class="kid-action fo-done__again">Грати ще раз</button>
      </div>`
    el.stage.querySelector<HTMLButtonElement>('.fo-done__again')!.addEventListener('click', start)
  }

  function start() {
    round = pickFoRound(statements, roundSize)
    // Кнопки — за категоріями РІВНЯ (не раунду): інакше раунд без міфів
    // випадково спростив би гру до двох кнопок.
    cats = categoriesOf(statements)
    idx = 0
    correctCount = 0
    renderCurrent()
  }

  start()
}
