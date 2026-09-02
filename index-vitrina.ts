// Вітрина (index.html): живе прев'ю тренувального питання + слот сезонної події.
// Питання беруться з публічного тренувального пулу public/questions — той самий
// контент, що у вільних місіях; відповіді цих питань публічні за дизайном
// (олімпіадні питання сюди не потрапляють, див. docs/security-model.md).

import { isSurfaceAvailable, type ProductSurface } from './features/surfaces/availability.js'

interface PreviewQuestion {
  q: string
  options: string[]
  correct: number
}

interface SeasonEvent {
  title: string
  cta: string
  href: string
}

// Сезонна подія: null = банер невидимий. Коли з'явиться реальна подія —
// заповнити об'єкт, більше нічого міняти не треба.
const SEASON_EVENT: SeasonEvent | null = null

// Fallback, якщо fetch пулу не вдався (офлайн без кешу тощо)
const FALLBACK: PreviewQuestion = {
  q: 'Робот виконує команди: вперед, вперед, праворуч. Скільки разів він пішов уперед?',
  options: ['Один', 'Два', 'Три'],
  correct: 1,
}

const MAX_Q_LEN = 110
const MAX_OPT_LEN = 48

let pool: PreviewQuestion[] = [FALLBACK]
let lastQ: string | null = null

function isPreviewable(v: unknown): v is PreviewQuestion {
  if (typeof v !== 'object' || v === null) return false
  const q = v as Record<string, unknown>
  return (
    typeof q.q === 'string' && q.q.length > 0 && q.q.length <= MAX_Q_LEN &&
    !q.code &&
    Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 &&
    q.options.every(o => typeof o === 'string' && o.length > 0 && o.length <= MAX_OPT_LEN) &&
    typeof q.correct === 'number' && Number.isInteger(q.correct) &&
    q.correct >= 0 && q.correct < q.options.length
  )
}

async function loadPool(): Promise<void> {
  try {
    // grade-1: єдиний пул із короткими питаннями без блоків псевдокоду —
    // 2–4 класи майже повністю code-based і у прев'ю-картку не влазять
    const res = await fetch('/questions/grade-1.json')
    if (!res.ok) return
    const data: unknown = await res.json()
    const list: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { questions?: unknown[] })?.questions)
        ? (data as { questions: unknown[] }).questions
        : []
    const previewable = list.filter(isPreviewable)
    if (previewable.length > 0) pool = previewable
  } catch {
    // залишаємо FALLBACK
  }
}

function pickQuestion(): PreviewQuestion {
  if (pool.length === 1) return pool[0]
  let candidate: PreviewQuestion
  do {
    candidate = pool[Math.floor(Math.random() * pool.length)]
  } while (candidate.q === lastQ)
  lastQ = candidate.q
  return candidate
}

function renderEventBanner(): void {
  if (!SEASON_EVENT || !isSurfaceAvailable('olympiad')) return
  const banner = document.getElementById('event-banner')
  if (!banner) return
  const title = document.createElement('span')
  title.className = 'event-banner__title'
  title.textContent = SEASON_EVENT.title
  const link = document.createElement('a')
  link.className = 'event-banner__cta'
  link.href = SEASON_EVENT.href
  link.textContent = SEASON_EVENT.cta
  banner.append(title, link)
  banner.classList.remove('hidden')
}

function applySurfaceAvailability(): void {
  document.querySelectorAll<HTMLElement>('[data-product-surface]').forEach(card => {
    const surface = card.dataset.productSurface as ProductSurface | undefined
    if (!surface || isSurfaceAvailable(surface)) return
    card.classList.add('is-coming-soon')

    const badge = document.createElement('span')
    badge.className = 'surface-status-badge'
    badge.textContent = 'Незабаром'

    if (card.classList.contains('mode-door')) {
      card.setAttribute('aria-label', `${card.querySelector('.mode-door__title')?.textContent ?? 'Режим'}, незабаром`)
      card.querySelector('.mode-door__icon')?.after(badge)
      const description = card.querySelector('.mode-door__desc')
      const action = card.querySelector('.mode-door__cta')
      if (description) description.textContent = 'Ми ще готуємо цей режим'
      if (action) action.textContent = 'Дізнатися більше'
      return
    }

    card.querySelector('.mode-card__head')?.append(badge)
  })
}

function renderQuestion(): void {
  const qEl = document.getElementById('preview-question')
  const optionsEl = document.getElementById('preview-options')
  const feedbackEl = document.getElementById('preview-feedback')
  const actionsEl = document.getElementById('preview-actions')
  if (!qEl || !optionsEl || !feedbackEl || !actionsEl) return

  const question = pickQuestion()
  qEl.textContent = question.q
  feedbackEl.textContent = ''
  feedbackEl.className = 'preview-card__feedback'
  actionsEl.classList.add('hidden')
  optionsEl.replaceChildren()

  question.options.forEach((text, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'preview-option'
    btn.textContent = text
    btn.addEventListener('click', () => answer(i, question, optionsEl, feedbackEl, actionsEl))
    optionsEl.append(btn)
  })
}

function answer(
  chosen: number,
  question: PreviewQuestion,
  optionsEl: HTMLElement,
  feedbackEl: HTMLElement,
  actionsEl: HTMLElement,
): void {
  const buttons = Array.from(optionsEl.querySelectorAll<HTMLButtonElement>('.preview-option'))
  buttons.forEach((btn, i) => {
    btn.disabled = true
    if (i === question.correct) btn.classList.add('preview-option--correct')
    else if (i === chosen) btn.classList.add('preview-option--incorrect')
  })

  const correct = chosen === question.correct
  feedbackEl.textContent = correct
    ? 'Так! 🎉 Саме так працюють місії Розумко.'
    : 'Майже! Правильна відповідь підсвічена зеленим.'
  feedbackEl.classList.add(correct ? 'preview-card__feedback--correct' : 'preview-card__feedback--incorrect')
  actionsEl.classList.remove('hidden')
}

applySurfaceAvailability()
renderEventBanner()
// Прев'ю опційне: якщо картки немає на сторінці — нічого не робимо (і не тягнемо пул).
if (document.getElementById('preview-question')) {
  renderQuestion()
  document.getElementById('preview-again')?.addEventListener('click', renderQuestion)
  void loadPool()
}
