import type { LessonSummary, MicroLesson } from './lesson-data.js'
import { openLightbox } from '../../utils/lightbox.js'

// Рушій мікро-уроку: (відео →) картки теорії → мікро-квіз закріплення.
// Клієнтський і безключовий, як sorting/puzzles: фідбек формувальний,
// теорія не «завалюється» — зірки нараховує адаптер за завершення.
// CSP-safe: динамічний контент лише через textContent, обробники —
// тільки addEventListener.

export interface LessonOptions {
  /** Показати «Пропустити теорію» (точка вже проходилась раніше). */
  allowSkip?: boolean
  onComplete?: (summary: LessonSummary) => void
}

export function mountLesson(root: HTMLElement, lesson: MicroLesson, opts: LessonOptions = {}) {
  // Фази: video (якщо є) → картки по одній → перевірочні питання по одному.
  const steps: Array<{ phase: 'video' } | { phase: 'card'; index: number } | { phase: 'check'; index: number }> = []
  if (lesson.videoUrl) steps.push({ phase: 'video' })
  lesson.cards.forEach((_, index) => steps.push({ phase: 'card', index }))
  lesson.check.forEach((_, index) => steps.push({ phase: 'check', index }))

  let stepIdx = 0
  let firstTryCorrect = 0
  let answered = false

  root.innerHTML = `
    <div class="lsn">
      <div class="lsn__top">
        <span class="lsn__badge">📖 Теорія</span>
        <span class="lsn__progress"></span>
        ${opts.allowSkip ? '<button type="button" class="btn-ghost lsn__skip">Пропустити →</button>' : ''}
      </div>
      <h2 class="lsn__title"></h2>
      <div class="lsn__stage" aria-live="polite"></div>
      <div class="lsn__feedback-wrap">
        <p class="lsn__feedback" aria-live="polite"></p>
        <p class="lsn__explanation hidden"></p>
        <button type="button" class="btn-next lsn__next hidden">Далі →</button>
      </div>
    </div>`

  const el = {
    progress:    root.querySelector<HTMLElement>('.lsn__progress')!,
    title:       root.querySelector<HTMLElement>('.lsn__title')!,
    stage:       root.querySelector<HTMLElement>('.lsn__stage')!,
    feedback:    root.querySelector<HTMLElement>('.lsn__feedback')!,
    explanation: root.querySelector<HTMLElement>('.lsn__explanation')!,
    next:        root.querySelector<HTMLButtonElement>('.lsn__next')!,
    skip:        root.querySelector<HTMLButtonElement>('.lsn__skip'),
  }
  el.title.textContent = lesson.title

  el.next.addEventListener('click', () => { stepIdx++; renderStep() })
  el.skip?.addEventListener('click', () => {
    opts.onComplete?.({ correct: 0, total: lesson.check.length, skipped: true })
  })

  function resetFeedback() {
    answered = false
    el.feedback.textContent = ''
    el.feedback.className = 'lsn__feedback'
    el.explanation.textContent = ''
    el.explanation.classList.add('hidden')
    el.next.classList.add('hidden')
  }

  function showNext(label: string) {
    el.next.textContent = label
    el.next.classList.remove('hidden')
  }

  function nextLabelAfter(index: number): string {
    return index + 1 < steps.length ? 'Далі →' : 'До практики →'
  }

  function renderStep() {
    if (stepIdx >= steps.length) {
      opts.onComplete?.({ correct: firstTryCorrect, total: lesson.check.length, skipped: false })
      return
    }
    resetFeedback()
    const step = steps[stepIdx]
    el.progress.textContent = `${stepIdx + 1} / ${steps.length}`

    if (step.phase === 'video') {
      el.stage.innerHTML = `
        <div class="lsn-video">
          <video class="lsn-video__player" controls playsinline preload="metadata"></video>
        </div>`
      el.stage.querySelector<HTMLVideoElement>('.lsn-video__player')!.src = lesson.videoUrl!
      showNext(nextLabelAfter(stepIdx))
    } else if (step.phase === 'card') {
      const card = lesson.cards[step.index]
      el.stage.innerHTML = `
        <article class="lsn-card">
          <h3 class="lsn-card__title hidden"></h3>
          <button type="button" class="lsn-card__image-btn quiz-image-btn hidden"
                  aria-label="Збільшити зображення">
            <img class="lsn-card__image hidden" alt="" />
          </button>
          <p class="lsn-card__text"></p>
        </article>`
      const titleEl = el.stage.querySelector<HTMLElement>('.lsn-card__title')!
      if (card.title) {
        titleEl.textContent = card.title
        titleEl.classList.remove('hidden')
      }
      const img = el.stage.querySelector<HTMLImageElement>('.lsn-card__image')!
      const imgBtn = el.stage.querySelector<HTMLButtonElement>('.lsn-card__image-btn')!
      if (card.image) {
        img.src = card.image
        img.alt = card.imageAlt ?? ''
        img.classList.remove('hidden')
        // A lesson picture can be a diagram worth a closer look
        imgBtn.classList.remove('hidden')
        imgBtn.onclick = () => openLightbox(img.src, img.alt)
      }
      el.stage.querySelector<HTMLElement>('.lsn-card__text')!.textContent = card.text
      showNext(nextLabelAfter(stepIdx))
    } else {
      const q = lesson.check[step.index]
      el.stage.innerHTML = `
        <article class="lsn-card lsn-card--check">
          <p class="lsn-card__hint">Перевір себе</p>
          <p class="lsn-card__text"></p>
          <div class="lsn-check__answers" role="group" aria-label="Варіанти відповіді"></div>
        </article>`
      el.stage.querySelector<HTMLElement>('.lsn-card__text')!.textContent = q.question

      const answers = el.stage.querySelector<HTMLElement>('.lsn-check__answers')!
      q.options.forEach((option, optIdx) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'lsn-answer'
        btn.textContent = option
        btn.addEventListener('click', () => answer(step.index, optIdx, btn))
        answers.appendChild(btn)
      })
    }
  }

  function answer(qIdx: number, optIdx: number, btn: HTMLButtonElement) {
    if (answered) return
    answered = true
    const q = lesson.check[qIdx]
    const ok = optIdx === q.correct
    if (ok) firstTryCorrect++

    el.stage.querySelectorAll<HTMLButtonElement>('.lsn-answer').forEach((b, i) => {
      b.disabled = true
      if (i === q.correct) b.classList.add('lsn-answer--right')
    })
    if (!ok) btn.classList.add('lsn-answer--wrong')

    el.feedback.textContent = ok ? '✓ Саме так!' : '✗ Правильна відповідь підсвічена.'
    el.feedback.className = `lsn__feedback ${ok ? 'lsn__feedback--ok' : 'lsn__feedback--bad'}`
    if (q.explanation) {
      el.explanation.textContent = q.explanation
      el.explanation.classList.remove('hidden')
    }
    showNext(nextLabelAfter(stepIdx))
    el.next.focus()
  }

  renderStep()
}
