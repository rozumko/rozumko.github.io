import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import { loadStaticQuestions } from './features/missions/static-questions.js'
import { joinSchoolSession, submitSchoolAnswer } from './features/api/client.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { encouragement, starRating, type MissionSummary } from './features/missions/mission-result.js'
import { AVATARS, avatarLabel, avatarSrc } from './avatars.js'

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
function setMissionActive(active: boolean) {
  document.documentElement.classList.toggle('mission-active', active)
  document.body.classList.toggle('mission-active', active)
}

function showIntro() {
  setMissionActive(false)
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
  setMissionActive(true)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    // Самостійні місії — зі статичного бандла (GitHub Pages), без бекенду:
    // немає cold start і анонімного трафіку в rate-limit. Класна гра за кодом
    // лишається на API (там сервер рахує бали).
    const questions = await loadStaticQuestions(selectedGrade, { count: preset.count, difficulty: preset.difficulty })
    runMission(els, questions, {
      showExplanation: true, // practice завжди показує пояснення
      onComplete: showResult,
    })
  } catch (err) {
    setMissionActive(false)
    hide(quizEl)
    show(introEl)
    errorEl.textContent = (err as Error).message
  }
}

function showResult(summary: MissionSummary) {
  setMissionActive(false)
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

// ── Просунутий режим: приєднання за кодом вчителя ───────────────────────────
// Дзеркало backend SCHOOL_AVATARS (allowlist). Слаг → ілюстрація public/avatars/<slug>.png.
// Аватар — візуальна мітка сесії, не ідентифікатор дитини.
let selectedAvatar: string = AVATARS[0]

const avatarWrap = $maybe('avatar-select')
if (avatarWrap) {
  AVATARS.forEach(slug => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'avatar-btn'
    btn.setAttribute('aria-label', avatarLabel(slug))
    btn.setAttribute('aria-pressed', String(slug === selectedAvatar))
    const img = document.createElement('img')
    img.src = avatarSrc(slug)
    img.alt = ''
    img.width = 56
    img.height = 56
    img.loading = 'lazy'
    btn.appendChild(img)
    btn.addEventListener('click', () => {
      selectedAvatar = slug
      avatarWrap.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
        b.setAttribute('aria-pressed', String(b === btn))
      })
    })
    if (slug === selectedAvatar) btn.setAttribute('aria-pressed', 'true')
    avatarWrap.appendChild(btn)
  })
}

$maybe<HTMLButtonElement>('join-btn')?.addEventListener('click', async () => {
  const code = $<HTMLInputElement>('join-code').value.trim()
  const nickname = $<HTMLInputElement>('join-nickname').value.trim()
  errorEl.textContent = ''
  if (!/^\d{6}$/.test(code)) { errorEl.textContent = 'Введи код гри — 6 цифр'; return }
  if (!nickname) { errorEl.textContent = 'Введи прізвисько'; return }

  hide(introEl)
  hide(resultEl)
  show(quizEl)
  setMissionActive(true)
  els.questionText.textContent = 'Приєднуємось до гри…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const joined = await joinSchoolSession(code, selectedAvatar, nickname)
    currentMissionLabel = `Класна гра • ${avatarLabel(selectedAvatar)} ${nickname}`
    runMission(els, joined.questions, {
      showExplanation: false, // пояснення вирізані сервером разом із ключами
      submitAnswer: (questionId, answer) =>
        submitSchoolAnswer(joined.participantId, joined.participantToken, questionId, answer)
          .then(r => r.correct),
      onComplete: showResult,
    })
  } catch (err) {
    setMissionActive(false)
    hide(quizEl)
    show(introEl)
    errorEl.textContent = (err as Error).message
  }
})

highlightGrade(selectedGrade)
