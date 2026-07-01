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
  codeBlock:    HTMLElement | null
  options:      HTMLElement
  feedback:     HTMLElement
  explanation:  HTMLElement
  nextBtn:      HTMLButtonElement
}

export interface MissionOptions {
  showExplanation?: boolean
  onComplete: (summary: MissionSummary) => void
}

export function runMission(
  els: MissionElements,
  questions: RenderableQuestion[],
  opts: MissionOptions,
): void {
  const showExplanation = opts.showExplanation ?? true
  let currentIdx = 0
  let correct = 0

  function showQuestion() {
    const q = questions[currentIdx]

    els.progressText.textContent = `${currentIdx + 1} / ${questions.length}`
    els.progressBar.style.width = `${(currentIdx / questions.length) * 100}%`
    els.questionText.textContent = String(q.q ?? '')

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

    const type = (q.type as string) ?? 'choice'
    els.options.className = type === 'choice'
      ? 'quiz-options quiz-options--grid'
      : type === 'truefalse'
      ? 'quiz-options quiz-options--two'
      : 'quiz-options quiz-options--stack'

    renderQuestion(q, els.options, {
      onAnswer: (result) => {
        // practice-пул → renderQuestion завжди дає boolean. Інші типи ігноруємо
        // захисно (School Mode не використовує олімпіадний пул).
        const isCorrect = result === true
        if (isCorrect) correct++
        showFeedback(isCorrect, q)
      },
    })
  }

  function showFeedback(isCorrect: boolean, q: RenderableQuestion) {
    els.feedback.textContent = isCorrect ? '✓ Правильно!' : '✗ Майже! Подивись пояснення'
    els.feedback.className = isCorrect
      ? 'quiz-feedback quiz-feedback--correct'
      : 'quiz-feedback quiz-feedback--incorrect'

    if (showExplanation && q.explanation) {
      els.explanation.textContent = String(q.explanation)
      els.explanation.classList.remove('hidden')
    }

    els.nextBtn.classList.remove('hidden')
    els.nextBtn.textContent = currentIdx + 1 < questions.length ? 'Далі →' : 'Завершити місію'
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
