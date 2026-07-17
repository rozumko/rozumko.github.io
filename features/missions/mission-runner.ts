import { renderQuestion, type RenderableQuestion } from '../../utils/question-renderer.js'
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
  let currentIdx = 0
  let correct = 0

  function showQuestion() {
    const q = questions[currentIdx]
    const questionCard = els.questionText.closest<HTMLElement>('.quiz-question-card')

    els.progressText.textContent = `${currentIdx + 1} / ${questions.length}`
    els.progressBar.style.width = `${(currentIdx / questions.length) * 100}%`
    els.questionText.textContent = String(q.q ?? '')

    // Зображення до питання (опційне поле q.img). Однакова поведінка з олімпіадою.
    if (els.image) {
      const img = q.img as string | undefined
      if (img) { els.image.src = img; els.image.classList.remove('hidden') }
      else     { els.image.src = ''; els.image.classList.add('hidden') }
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
