import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import { joinSchoolSession, submitSchoolAnswer } from './features/api/client.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { encouragement, starRating, type MissionSummary } from './features/missions/mission-result.js'
import { AVATARS, avatarLabel, avatarSrc } from './avatars.js'

// School Mode — класна гра за кодом вчителя.
// Аватар і нікнейм — єдині дані учня, без ПІБ та реєстрації.

let selectedAvatar: string = AVATARS[0]
let currentNickname = ''

const introEl  = $('mission-intro')
const quizEl   = $('mission-quiz')
const resultEl = $('mission-result')
const errorEl  = $('mission-error')

const els: MissionElements = {
  progressText: $('quiz-progress-text'),
  progressBar:  $('quiz-progress-bar'),
  questionText: $('quiz-question-text'),
  image:        $maybe<HTMLImageElement>('quiz-image'),
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

function showStudentIdentity(slug: string, nickname: string) {
  const img  = $maybe<HTMLImageElement>('student-avatar-display')
  const name = $maybe('student-nickname-display')
  const wrap = $maybe('student-identity')
  if (img)  { img.src = avatarSrc(slug); img.alt = avatarLabel(slug) }
  if (name) name.textContent = nickname
  if (wrap) show(wrap)
}

// ── Аватари ──────────────────────────────────────────────────────────────────
// Рендеряться одразу, але блок avatar-select прихований до заповнення форми.

const avatarWrap = $maybe('avatar-select')
const joinBtn    = $maybe<HTMLButtonElement>('join-btn')
const codeInput  = $maybe<HTMLInputElement>('join-code')
const nickInput  = $maybe<HTMLInputElement>('join-nickname')

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
    img.width = 80
    img.height = 80
    img.loading = 'lazy'
    btn.appendChild(img)
    btn.addEventListener('click', () => {
      selectedAvatar = slug
      avatarWrap.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
        b.setAttribute('aria-pressed', String(b === btn))
      })
    })
    avatarWrap.appendChild(btn)
  })
}

// ── Приєднання до гри ────────────────────────────────────────────────────────

joinBtn?.addEventListener('click', async () => {
  const code     = codeInput?.value.trim() ?? ''
  const nickname = nickInput?.value.trim() ?? ''
  errorEl.textContent = ''
  if (!/^\d{6}$/.test(code)) { errorEl.textContent = 'Введи код гри — 6 цифр'; return }
  if (!nickname)              { errorEl.textContent = 'Введи прізвисько'; return }

  currentNickname = nickname
  hide(introEl)
  hide(resultEl)
  show(quizEl)
  setMissionActive(true)
  showStudentIdentity(selectedAvatar, nickname)
  els.questionText.textContent = 'Приєднуємось до гри…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const joined = await joinSchoolSession(code, selectedAvatar, nickname)
    runMission(els, joined.questions, {
      showExplanation: false,
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

function showResult(summary: MissionSummary) {
  setMissionActive(false)
  hide(quizEl)
  els.progressBar.style.width = '100%'
  const stars = starRating(summary.percent)
  $('result-mission-label').textContent = `Класна гра • ${currentNickname}`
  $('result-stars').textContent   = '⭐'.repeat(stars) + '☆'.repeat(3 - stars)
  $('result-score').textContent   = `${summary.correct} з ${summary.total}`
  $('result-percent').textContent = `${summary.percent}%`
  $('result-message').textContent = encouragement(summary.percent)
  show(resultEl)
}

$maybe('mission-retry-btn')?.addEventListener('click', showIntro)
