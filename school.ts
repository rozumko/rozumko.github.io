import { $, $maybe } from './utils/dom.js'
import { loadQuestions } from './features/olympiad/quiz-engine.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { encouragement, starRating, type MissionSummary } from './features/missions/mission-result.js'

// School Mode — анонімна класна місія. Тренувальний пул, локальне оцінювання,
// жодних записів у БД чи дитячих даних. Уся логіка на клієнті.

interface MissionPreset {
  id: string
  label: string
  difficulty: 'easy' | 'medium' | 'hard'
  count: number
}

const PRESETS: Record<string, MissionPreset> = {
  warmup:    { id: 'warmup',    label: 'Розминка',   difficulty: 'easy',   count: 5  },
  training:  { id: 'training',  label: 'Тренування', difficulty: 'medium', count: 10 },
  challenge: { id: 'challenge', label: 'Виклик',     difficulty: 'hard',   count: 10 },
}

let selectedGrade = 1
let currentMissionLabel = ''

const introEl  = $('mission-intro')
const quizEl    = $('mission-quiz')
const resultEl  = $('mission-result')
const errorEl   = $('mission-error')

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

// Візуальний стан вибору класу без правок style.css (inline-стилі дозволені CSP).
function highlightGrade(grade: number) {
  document.querySelectorAll<HTMLElement>('.school-grade-btn').forEach(btn => {
    const active = Number(btn.dataset['grade']) === grade
    btn.setAttribute('aria-pressed', String(active))
    // Конкретний колір (не var() у shorthand — той не серіалізується через el.style).
    btn.style.outline = active ? '3px solid #3b82f6' : ''
    btn.style.outlineOffset = active ? '2px' : ''
  })
}

async function startMission(preset: MissionPreset) {
  hide(introEl)
  hide(resultEl)
  errorEl.textContent = ''
  currentMissionLabel = `${preset.label} • ${selectedGrade} клас`

  show(quizEl)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const questions = await loadQuestions(selectedGrade, 'practice', preset.count, preset.difficulty)
    runMission(els, questions, {
      showExplanation: true, // practice завжди показує пояснення
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

  const stars = starRating(summary.percent)
  $('result-mission-label').textContent = currentMissionLabel || 'Місію завершено!'
  $('result-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars)
  $('result-score').textContent   = `${summary.correct} з ${summary.total}`
  $('result-percent').textContent = `${summary.percent}%`
  $('result-message').textContent = encouragement(summary.percent)
  show(resultEl)
}

document.querySelectorAll<HTMLElement>('.school-grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const grade = Number(btn.dataset['grade'])
    if (grade >= 1 && grade <= 4) {
      selectedGrade = grade
      highlightGrade(grade)
    }
  })
})

document.querySelectorAll<HTMLElement>('.school-mission-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.dataset['mission'] ?? '']
    if (preset) startMission(preset)
  })
})

$maybe('mission-retry-btn')?.addEventListener('click', showIntro)

highlightGrade(selectedGrade)
