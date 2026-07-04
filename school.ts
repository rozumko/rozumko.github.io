import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import { loadStaticQuestions } from './features/missions/static-questions.js'
import { joinSchoolSession, submitSchoolAnswer } from './features/api/client.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { encouragement, starRating, type MissionSummary } from './features/missions/mission-result.js'
import { AVATARS, avatarLabel, avatarSrc } from './avatars.js'
import { TOPICS_BY_TRACK, TOPIC_SHORT } from './features/missions/topics.js'

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
let selectedTrack: string | null = null   // null = усі напрями
let selectedTopic: string | null = null   // null = усі теми напряму
let currentMissionLabel = ''

const TRACK_LABELS: Record<string, string> = {
  informatics: 'Інформатика',
  'computational-thinking': 'Мислення',
  'ai-basics': 'Основи ШІ',
}

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

async function loadMissionQuestions(preset: MissionPreset) {
  // Поступове послаблення фільтрів, щоб місія завжди набралась: від найвужчого
  // (тема+складність) до найширшого (будь-які питання класу).
  const MIN = Math.min(preset.count, 3)
  const t = selectedTrack
  const tp = selectedTopic
  const attempts = [
    { count: preset.count, track: t, topic: tp, difficulty: preset.difficulty },
    { count: preset.count, track: t, topic: tp },
    { count: preset.count, track: t, difficulty: preset.difficulty },
    { count: preset.count, track: t },
    { count: preset.count, difficulty: preset.difficulty },
    { count: preset.count },
  ]
  let picked = await loadStaticQuestions(selectedGrade, attempts[0])
  for (let i = 1; i < attempts.length && picked.length < MIN; i++) {
    try { picked = await loadStaticQuestions(selectedGrade, attempts[i]) } catch { /* далі */ }
  }
  return picked
}

// Чипи тем залежать від напряму. «Усі теми» = null. Тема без напряму не має сенсу.
function renderTopicChips() {
  const box = $('topic-select')
  if (!selectedTrack) {
    box.classList.add('hidden')
    box.innerHTML = ''
    selectedTopic = null
    return
  }
  const topics = (TOPICS_BY_TRACK as Record<string, readonly string[]>)[selectedTrack] ?? []
  const chips = [`<button class="school-topic-btn grade-chip" data-topic="" aria-pressed="true">Усі теми</button>`]
    .concat(topics.map(tp =>
      `<button class="school-topic-btn grade-chip" data-topic="${tp}" aria-pressed="false">${TOPIC_SHORT[tp] ?? tp}</button>`
    ))
  box.innerHTML = chips.join('')
  box.classList.remove('hidden')
  box.querySelectorAll<HTMLElement>('.school-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTopic = btn.dataset['topic'] || null
      box.querySelectorAll<HTMLElement>('.school-topic-btn').forEach(b => {
        const active = b === btn
        b.setAttribute('aria-pressed', String(active))
        b.style.outline = active ? '3px solid #3b82f6' : ''
        b.style.outlineOffset = active ? '2px' : ''
      })
    })
  })
}

async function startMission(preset: MissionPreset) {
  hide(introEl)
  hide(resultEl)
  errorEl.textContent = ''
  const trackNote = selectedTrack ? ` • ${TRACK_LABELS[selectedTrack]}` : ''
  const topicNote = selectedTopic ? ` • ${TOPIC_SHORT[selectedTopic] ?? selectedTopic}` : ''
  currentMissionLabel = `${preset.label}${trackNote}${topicNote} • ${selectedGrade} клас`

  show(quizEl)
  setMissionActive(true)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    // Самостійні місії — зі статичного бандла (GitHub Pages), без бекенду:
    // немає cold start і анонімного трафіку в rate-limit. Класна гра за кодом
    // лишається на API (там сервер рахує бали).
    const questions = await loadMissionQuestions(preset)
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

function highlightTrack(track: string | null) {
  document.querySelectorAll<HTMLElement>('.school-track-btn').forEach(btn => {
    const active = (btn.dataset['track'] || null) === track
    btn.setAttribute('aria-pressed', String(active))
    btn.style.outline = active ? '3px solid #3b82f6' : ''
    btn.style.outlineOffset = active ? '2px' : ''
  })
}

document.querySelectorAll<HTMLElement>('.school-track-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedTrack = btn.dataset['track'] || null
    selectedTopic = null            // зміна напряму скидає тему
    highlightTrack(selectedTrack)
    renderTopicChips()
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
highlightTrack(selectedTrack)
