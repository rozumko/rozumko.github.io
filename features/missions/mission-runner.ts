import { renderQuestion, type RenderableQuestion } from '../../utils/question-renderer.js'
import { resolveQuestionImage } from '../../utils/question-image.js'
import { applyQuestionLength } from '../../utils/question-fit.js'
import { openLightbox } from '../../utils/lightbox.js'
import { missionSummary, type MissionSummary } from './mission-result.js'

// Клієнтський, surface-agnostic runner місії для School Mode.
// Працює ЛИШЕ з тренувальним пулом (practice): ключі відповідей присутні,
// тож renderQuestion повертає onAnswer(boolean) і оцінювання локальне.
// Жодного attempt/token/таймера/сервер-скорингу тут немає — це не олімпіада.

export interface MissionElements {
  progressText: HTMLElement
  progressBar:  HTMLElement
  questionText: HTMLElement
  image?:       HTMLImageElement | null
  /** Optional wrapper button: makes the image openable full screen. */
  imageBtn?:    HTMLButtonElement | null
  codeBlock:    HTMLElement | null
  options:      HTMLElement
  feedback:     HTMLElement
  explanation:  HTMLElement
  nextBtn:      HTMLButtonElement
}

export interface MissionOptions {
  showExplanation?: boolean
  incorrectFeedback?: string
  completeLabel?: string
  initialCompleted?: number
  totalQuestions?: number
  onComplete: (summary: MissionSummary) => void
  /**
   * Live-режим (просунутий School): ключі відповідей вирізані сервером, тож
   * renderer повертає сиру відповідь (number | string | number[]), а правильність
   * каже сервер. Home demo може повернути null: відповідь прийнята, але
   * correctness не показується дитині до батьківського серверного звіту.
   */
  submitAnswer?: (questionId: string, answer: number | string | number[]) => Promise<boolean | null>
}

export function runMission(
  els: MissionElements,
  questions: RenderableQuestion[],
  opts: MissionOptions,
): void {
  const showExplanation = opts.showExplanation ?? true
  const completeLabel = opts.completeLabel ?? 'Завершити місію'
  const initialCompletedOption = opts.initialCompleted
  const initialCompleted = typeof initialCompletedOption === 'number' && Number.isFinite(initialCompletedOption)
    ? Math.max(0, Math.floor(initialCompletedOption))
    : 0
  const totalQuestionsOption = opts.totalQuestions
  const requestedTotal = typeof totalQuestionsOption === 'number' && Number.isFinite(totalQuestionsOption)
    ? Math.floor(totalQuestionsOption)
    : initialCompleted + questions.length
  const totalQuestions = Math.max(initialCompleted + questions.length, requestedTotal)
  let currentIdx = 0
  let correct = 0

  // Combo streak: a practice-only delight. Disabled in live/olympiad flows
  // (submitAnswer present) so a timed, server-scored run stays distraction-free.
  const comboEnabled = !opts.submitAnswer
  let streak = 0
  let comboEl: HTMLElement | null = null
  if (comboEnabled) {
    const header = els.progressText.parentElement
    if (header) {
      // Reuse across mission replays (path reuses the same DOM) — never stack duplicates.
      comboEl = header.querySelector<HTMLElement>('.quiz-combo')
      if (!comboEl) {
        comboEl = document.createElement('span')
        comboEl.className = 'quiz-combo'
        comboEl.setAttribute('aria-live', 'polite')
        header.appendChild(comboEl)
      }
      comboEl.hidden = true
      comboEl.textContent = ''
    }
  }

  function updateCombo() {
    if (!comboEl) return
    if (streak >= 2) {
      comboEl.textContent = `🔥 ${streak} поспіль!`
      comboEl.hidden = false
      comboEl.classList.remove('quiz-combo--pop')
      void comboEl.offsetWidth // reflow to restart the pop animation
      comboEl.classList.add('quiz-combo--pop')
    } else {
      comboEl.hidden = true
      comboEl.textContent = ''
    }
  }

  function showQuestion() {
    const q = questions[currentIdx]
    const questionCard = els.questionText.closest<HTMLElement>('.quiz-question-card')

    const progress = initialCompleted + currentIdx + 1
    els.progressText.textContent = `${progress} / ${totalQuestions}`
    els.progressBar.style.width = `${(progress / totalQuestions) * 100}%`
    els.questionText.textContent = String(q.q ?? '')
    applyQuestionLength(els.questionText, String(q.q ?? ''))

    // Question image: explicit q.img or a default from public/assets/basics/
    // (resolved by type/topic/concept). Keep behavior consistent across surfaces.
    if (els.image) {
      const image = resolveQuestionImage(q)
      if (image) {
        els.image.src = image.src
        els.image.alt = image.alt
        els.image.classList.remove('hidden')
        // A picture can BE the question (a Scratch program, a diagram), so the
        // thumbnail opens full screen where the surface provides the trigger.
        if (els.imageBtn) {
          els.imageBtn.classList.remove('hidden')
          els.imageBtn.onclick = () => openLightbox(image.src, image.alt)
        }
      } else {
        els.image.src = ''
        els.image.alt = ''
        els.image.classList.add('hidden')
        if (els.imageBtn) {
          els.imageBtn.classList.add('hidden')
          els.imageBtn.onclick = null
        }
      }
    }

    if (els.codeBlock) {
      if (q.code) {
        els.codeBlock.textContent = String(q.code)
        els.codeBlock.classList.remove('hidden')
      } else {
        els.codeBlock.classList.add('hidden')
      }
    }

    els.feedback.textContent = ''
    els.feedback.className = 'quiz-feedback'
    els.explanation.textContent = ''
    els.explanation.classList.add('hidden')
    els.nextBtn.classList.add('hidden')
    els.options.innerHTML = ''
    // Стан «до відповіді»: варіанти тримають екран, фідбек мінімальний.
    document.body.classList.remove('mission-answered')

    const type = (q.type as string) ?? 'choice'
    els.options.className = type === 'choice'
      ? 'quiz-options quiz-options--grid'
      : type === 'truefalse'
      ? 'quiz-options quiz-options--two'
      : 'quiz-options quiz-options--stack'

    renderQuestion(q, els.options, {
      onAnswer: (result) => {
        // practice: ключі на клієнті → renderer дає boolean, оцінюємо локально.
        if (typeof result === 'boolean') {
          if (result) correct++
          showFeedback(result, q)
          return
        }
        // live: ключі вирізані → сира відповідь іде на сервер, він каже правильність.
        if (opts.submitAnswer) {
          els.feedback.textContent = 'Перевіряємо…'
          els.feedback.className = 'quiz-feedback'
          // Move feedback out of the flex flow immediately so the answer grid
          // keeps the same height while the server is scoring the response.
          document.body.classList.add('mission-answered')
          opts.submitAnswer(String(q.id), result)
            .then(isCorrect => {
              if (isCorrect == null) {
                showNeutralFeedback()
                return
              }
              if (isCorrect) correct++
              showFeedback(isCorrect, q)
            })
            .catch(err => {
              // Не блокуємо дитину: показуємо помилку і даємо йти далі.
              els.feedback.textContent = (err as Error).message
              els.feedback.className = 'quiz-feedback quiz-feedback--incorrect'
              els.nextBtn.classList.remove('hidden')
              els.nextBtn.textContent = currentIdx + 1 < questions.length ? 'Далі →' : completeLabel
            })
        }
      },
    })

    if (currentIdx > 0 && type !== 'input') {
      questionCard?.focus()
    }
  }

  function showFeedback(isCorrect: boolean, q: RenderableQuestion) {
    const incorrectFeedback = opts.incorrectFeedback
      ?? (showExplanation && q.explanation ? 'Майже! Подивись пояснення' : 'Майже! Спробуй наступне завдання')
    els.feedback.textContent = isCorrect ? '✓ Правильно!' : `✗ ${incorrectFeedback}`
    els.feedback.className = isCorrect
      ? 'quiz-feedback quiz-feedback--correct'
      : 'quiz-feedback quiz-feedback--incorrect'

    if (comboEnabled) {
      streak = isCorrect ? streak + 1 : 0
      updateCombo()
    }

    if (showExplanation && q.explanation) {
      els.explanation.textContent = String(q.explanation)
      els.explanation.classList.remove('hidden')
    }

    // Після відповіді: варіанти віддають місце фідбеку/поясненню (див. style.css).
    document.body.classList.add('mission-answered')
    els.nextBtn.classList.remove('hidden')
    els.nextBtn.textContent = currentIdx + 1 < questions.length ? 'Далі →' : completeLabel
  }

  function showNeutralFeedback() {
    els.feedback.textContent = '✓ Відповідь збережено'
    els.feedback.className = 'quiz-feedback quiz-feedback--correct'
    document.body.classList.add('mission-answered')
    els.nextBtn.classList.remove('hidden')
    els.nextBtn.textContent = currentIdx + 1 < questions.length ? 'Далі →' : completeLabel
  }

  // onclick (не addEventListener) — щоб повторний запуск місії не накопичував слухачів.
  els.nextBtn.onclick = () => {
    currentIdx++
    if (currentIdx < questions.length) showQuestion()
    else opts.onComplete(missionSummary(correct, questions.length))
  }

  if (questions.length) showQuestion()
  else opts.onComplete(missionSummary(0, 0))
}
