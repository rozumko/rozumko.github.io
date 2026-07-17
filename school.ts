import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import {
  getSchoolParticipantSession,
  joinSchoolSession,
  submitSchoolAnswer,
  updateSchoolParticipantAvatar,
  type Question,
} from './features/api/client.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { encouragement, starRating, type MissionSummary } from './features/missions/mission-result.js'
import { AVATARS, avatarLabel, avatarSrc } from './avatars.js'

// School Mode — класна гра за кодом вчителя.
// Аватар і нікнейм — єдині дані учня, без ПІБ та реєстрації.

function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0]
}

let selectedAvatar: string = randomAvatar()
let currentNickname = ''
let currentParticipantId = ''
let currentParticipantToken = ''
let waitingPollTimer: number | undefined

const introEl  = $('mission-intro')
const waitEl   = $('mission-waiting')
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

function clearWaitingPoll() {
  if (waitingPollTimer !== undefined) {
    window.clearInterval(waitingPollTimer)
    waitingPollTimer = undefined
  }
}

function showIntro() {
  clearWaitingPoll()
  setMissionActive(false)
  currentParticipantId = ''
  currentParticipantToken = ''
  setSelectedAvatar(randomAvatar(), false)
  hide(waitEl)
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

function setSelectedAvatar(slug: string, syncServer: boolean) {
  selectedAvatar = slug
  avatarWrap?.querySelectorAll<HTMLButtonElement>('button').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.avatar === slug))
  })

  const waitingAvatar = $maybe<HTMLImageElement>('waiting-avatar')
  if (waitingAvatar) {
    waitingAvatar.src = avatarSrc(slug)
    waitingAvatar.alt = avatarLabel(slug)
  }

  if (syncServer) syncAvatar()
}

// Синхронізація героя з сервером — по одному запиту за раз: наступний PATCH
// стартує лише після завершення попереднього, щоб відповіді не обганяли
// одна одну і сервер завжди отримував останній вибір.
let avatarSyncBusy = false
function syncAvatar() {
  if (avatarSyncBusy || !currentParticipantId || !currentParticipantToken) return
  const slug = selectedAvatar
  avatarSyncBusy = true
  updateSchoolParticipantAvatar(currentParticipantId, currentParticipantToken, slug)
    .then(() => {
      if (selectedAvatar === slug) showWaitingStatus('Героя обрано. Чекаємо старт...')
    })
    .catch((err) => {
      if (selectedAvatar !== slug) return
      const status = (err as { status?: number }).status
      showWaitingStatus(status === 409
        ? 'Гра вже стартує. Герой зафіксований.'
        : 'Не вдалося змінити героя. Спробуй ще раз.')
    })
    .finally(() => {
      avatarSyncBusy = false
      if (selectedAvatar !== slug) syncAvatar()
    })
}

function showWaitingRoom(slug: string, nickname: string, status = 'Очікуємо старт...') {
  setMissionActive(false)
  hide(introEl)
  hide(quizEl)
  hide(resultEl)

  const name = $maybe('waiting-name')
  const statusEl = $maybe('waiting-status')
  setSelectedAvatar(slug, false)
  if (name) name.textContent = nickname
  if (statusEl) statusEl.textContent = status
  show(waitEl)
}

function showWaitingStatus(status: string) {
  const statusEl = $maybe('waiting-status')
  if (statusEl) statusEl.textContent = status
}

function startSchoolMission(participantId: string, participantToken: string, questions: Question[]) {
  clearWaitingPoll()
  hide(introEl)
  hide(waitEl)
  hide(resultEl)
  show(quizEl)
  setMissionActive(true)
  showStudentIdentity(selectedAvatar, currentNickname)
  runMission(els, questions, {
    showExplanation: false,
    submitAnswer: (questionId, answer) =>
      submitSchoolAnswer(participantId, participantToken, questionId, answer)
        .then(r => r.correct),
    onComplete: showResult,
  })
}

function startWaitingPoll(participantId: string, participantToken: string) {
  clearWaitingPoll()
  waitingPollTimer = window.setInterval(async () => {
    try {
      const session = await getSchoolParticipantSession(participantId, participantToken)
      if (session.status === 'active' && session.questions.length > 0) {
        startSchoolMission(participantId, participantToken, session.questions)
      } else if (session.status === 'lobby') {
        showWaitingStatus('Очікуємо старт...')
      } else if (session.status === 'finished') {
        clearWaitingPoll()
        showIntro()
        errorEl.textContent = 'Гру вже завершено. Попроси вчителя створити нову.'
      }
    } catch {
      showWaitingStatus('Зв’язок нестабільний. Пробуємо ще раз...')
    }
  }, 2000)
}

// ── Аватари ──────────────────────────────────────────────────────────────────
// Рендеряться одразу, але блок avatar-select прихований до заповнення форми.

const avatarWrap = $maybe('avatar-select')
const joinBtn    = $maybe<HTMLButtonElement>('join-btn')
const codeInput  = $maybe<HTMLInputElement>('join-code')
const nickInput  = $maybe<HTMLInputElement>('join-nickname')

const sharedCode = new URLSearchParams(window.location.search).get('code')?.trim() ?? ''
if (codeInput && /^\d{6}$/.test(sharedCode)) codeInput.value = sharedCode

if (avatarWrap) {
  AVATARS.forEach(slug => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'avatar-btn'
    btn.dataset.avatar = slug
    btn.setAttribute('aria-label', avatarLabel(slug))
    btn.setAttribute('aria-pressed', String(slug === selectedAvatar))
    const img = document.createElement('img')
    img.src = avatarSrc(slug)
    img.alt = ''
    img.width = 80
    img.height = 80
    img.loading = 'lazy'
    btn.appendChild(img)
    btn.addEventListener('click', () => setSelectedAvatar(slug, true))
    avatarWrap.appendChild(btn)
  })
  setSelectedAvatar(selectedAvatar, false)
}

// ── Приєднання до гри ────────────────────────────────────────────────────────

joinBtn?.addEventListener('click', async () => {
  const code     = codeInput?.value.trim() ?? ''
  const nickname = nickInput?.value.trim() ?? ''
  errorEl.textContent = ''
  if (!/^\d{6}$/.test(code)) { errorEl.textContent = 'Введи код гри — 6 цифр'; return }
  if (!nickname)              { errorEl.textContent = 'Введи прізвисько'; return }

  currentNickname = nickname
  const avatarForJoin = randomAvatar()
  if (joinBtn) joinBtn.disabled = true
  showWaitingRoom(avatarForJoin, nickname, 'Приєднуємось до гри...')

  try {
    const joined = await joinSchoolSession(code, avatarForJoin, nickname)
    currentParticipantId = joined.participantId
    currentParticipantToken = joined.participantToken
    if (joined.status === 'active' && joined.questions.length > 0) {
      startSchoolMission(joined.participantId, joined.participantToken, joined.questions)
    } else {
      // Якщо учень встиг змінити героя, поки йшов join — досилаємо вибір.
      if (selectedAvatar !== avatarForJoin) syncAvatar()
      showWaitingRoom(selectedAvatar, nickname)
      startWaitingPoll(joined.participantId, joined.participantToken)
    }
  } catch (err) {
    setMissionActive(false)
    hide(waitEl)
    hide(quizEl)
    show(introEl)
    errorEl.textContent = (err as Error).message
  } finally {
    if (joinBtn) joinBtn.disabled = false
  }
})

function showResult(summary: MissionSummary) {
  clearWaitingPoll()
  setMissionActive(false)
  hide(waitEl)
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
