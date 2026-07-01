import { $, $maybe } from './utils/dom.js'
import { loadQuestions, getModeConfig } from './features/olympiad/quiz-engine.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { encouragement, type MissionSummary } from './features/missions/mission-result.js'

// School Mode — анонімна класна місія. Тренувальний пул, локальне оцінювання,
// жодних записів у БД чи дитячих даних. Уся логіка на клієнті.

const introEl  = $('mission-intro')
const quizEl   = $('mission-quiz')
const resultEl = $('mission-result')
const errorEl  = $('mission-error')

const els: MissionElements = {
  progressText: $('quiz-progress-text'),
  progressBar:  $('quiz-progress-bar'),
  questionText: $('quiz-question-text'),
  codeBlock:    $maybe('quiz-code-block'),
  options:      $('quiz-options'),
  feedback:     $('quiz-feedback'),
  explanation:  $('quiz-explanation'),
  nextBtn:      $<HTMLButtonElement>('quiz-next-btn'),
}

function show(el: HTMLElement) { el.classList.remove('hidden') }
function hide(el: HTMLElement) { el.classList.add('hidden') }

function showIntro() {
  hide(quizEl)
  hide(resultEl)
  errorEl.textContent = ''
  show(introEl)
}

async function startMission(grade: number) {
  hide(introEl)
  hide(resultEl)
  errorEl.textContent = ''

  const cfg = getModeConfig('practice')
  show(quizEl)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const questions = await loadQuestions(grade, 'practice', cfg.count, null)
    runMission(els, questions, {
      showExplanation: cfg.showExplanation,
      onComplete: showResult,
    })
  } catch (err) {
    hide(quizEl)
    show(introEl)
    errorEl.textContent = (err as Error).message
  }
}

function showResult(summary: MissionSummary) {
  hide(quizEl)
  els.progressBar.style.width = '100%'
  $('result-score').textContent   = `${summary.correct} з ${summary.total}`
  $('result-percent').textContent = `${summary.percent}%`
  $('result-message').textContent = encouragement(summary.percent)
  show(resultEl)
}

document.querySelectorAll<HTMLElement>('.school-grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const grade = Number(btn.dataset['grade'])
    if (grade >= 1 && grade <= 4) startMission(grade)
  })
})

$maybe('mission-retry-btn')?.addEventListener('click', showIntro)
