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
import { shuffleDeck } from './features/missions/question-shuffle.js'
import { encouragement, missionSummary, starRating, type MissionSummary } from './features/missions/mission-result.js'
import { isStaleParticipantError, prepareSchoolMissionResume } from './features/missions/school-resume.js'
import { AVATARS, avatarLabel, avatarSrc } from './avatars.js'
import { launchConfetti, playVictorySound } from './utils/celebrate.js'

// School Mode — класна гра за кодом вчителя.
// Аватар і нікнейм — єдині дані учня, без ПІБ та реєстрації.

function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0]
}

// ── Reload resume ────────────────────────────────────────────────────────────
// The participant identity survives a page reload in sessionStorage (tab-scoped,
// gone when the tab closes — keeps School Mode ephemeral). On load we silently
// rejoin the same participant instead of creating a leaderboard duplicate.

const SCHOOL_PARTICIPANT_KEY = 'school_participant'

interface StoredParticipant {
  participantId: string
  participantToken: string
  avatar: string
  nickname: string
}

function saveStoredParticipant(p: StoredParticipant) {
  try { sessionStorage.setItem(SCHOOL_PARTICIPANT_KEY, JSON.stringify(p)) } catch { /* unavailable */ }
}

function loadStoredParticipant(): StoredParticipant | null {
  try {
    const raw = sessionStorage.getItem(SCHOOL_PARTICIPANT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as StoredParticipant
    if (typeof p?.participantId === 'string' && typeof p?.participantToken === 'string'
      && typeof p?.avatar === 'string' && typeof p?.nickname === 'string') return p
    return null
  } catch { return null }
}

function clearStoredParticipant() {
  try { sessionStorage.removeItem(SCHOOL_PARTICIPANT_KEY) } catch { /* unavailable */ }
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
  clearStoredParticipant()
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
  // Keep the stored identity in sync so a reload restores the picked hero
  if (currentParticipantId && currentParticipantToken) {
    saveStoredParticipant({
      participantId: currentParticipantId,
      participantToken: currentParticipantToken,
      avatar: slug,
      nickname: currentNickname,
    })
  }
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

interface MissionResume {
  answeredQuestionIds: string[]
  score: number
}

function startSchoolMission(participantId: string, participantToken: string, questions: Question[], resume?: MissionResume) {
  clearWaitingPoll()
  hide(introEl)
  hide(waitEl)
  hide(resultEl)
  show(quizEl)
  setMissionActive(true)
  showStudentIdentity(selectedAvatar, currentNickname)
  // Anti-peeking: per-participant order of questions and options. Indices are
  // mapped back to the original option order before hitting the server.
  // The shuffle is seeded by participantId, so a resumed run keeps the order.
  const deck = shuffleDeck(questions, participantId)
  const { remaining, completedCount, priorCorrect, totalCount } = prepareSchoolMissionResume(
    deck.questions,
    resume?.answeredQuestionIds ?? [],
    resume?.score ?? 0,
  )

  if (!remaining.length) {
    // Everything was answered before the reload — straight to the result
    showResult(missionSummary(priorCorrect, totalCount))
    return
  }

  runMission(els, remaining, {
    showExplanation: false,
    initialCompleted: completedCount,
    totalQuestions: totalCount,
    submitAnswer: (questionId, answer) =>
      submitSchoolAnswer(participantId, participantToken, questionId, deck.toOriginalAnswer(questionId, answer))
        .then(r => r.correct),
    // A resumed run replays only the remaining questions; the final summary
    // adds the server-confirmed score earned before the reload.
    onComplete: s => showResult(missionSummary(priorCorrect + s.correct, totalCount)),
  })
}

function startWaitingPoll(participantId: string, participantToken: string) {
  clearWaitingPoll()
  waitingPollTimer = window.setInterval(async () => {
    try {
      const session = await getSchoolParticipantSession(participantId, participantToken)
      if (session.status === 'active' && session.questions.length > 0) {
        startSchoolMission(participantId, participantToken, session.questions, {
          answeredQuestionIds: session.answeredQuestionIds ?? [],
          score: session.score ?? 0,
        })
      } else if (session.status === 'lobby') {
        showWaitingStatus('Очікуємо старт...')
      } else if (session.status === 'finished') {
        clearWaitingPoll()
        showIntro()
        errorEl.textContent = 'Гру вже завершено. Попроси вчителя створити нову.'
      }
    } catch (err) {
      if (isStaleParticipantError(err)) {
        clearWaitingPoll()
        showIntro()
        errorEl.textContent = 'Не вдалося відновити участь. Приєднайся до гри ще раз.'
      } else {
        showWaitingStatus('Зв’язок нестабільний. Пробуємо ще раз...')
      }
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
    saveStoredParticipant({
      participantId: joined.participantId,
      participantToken: joined.participantToken,
      avatar: selectedAvatar,
      nickname,
    })
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
  const resultAvatar = $maybe<HTMLImageElement>('result-avatar')
  if (resultAvatar) {
    resultAvatar.src = avatarSrc(selectedAvatar)
    resultAvatar.alt = avatarLabel(selectedAvatar)
    resultAvatar.classList.remove('hidden')
  }
  $('result-mission-label').textContent = `Класна гра • ${currentNickname}`
  $('result-stars').textContent   = '⭐'.repeat(stars) + '☆'.repeat(3 - stars)
  $('result-score').textContent   = `${summary.correct} з ${summary.total}`
  $('result-percent').textContent = `${summary.percent}%`
  $('result-message').textContent = encouragement(summary.percent)
  show(resultEl)
  // Celebration: sound always, confetti from 1 star up (>=40%)
  playVictorySound()
  if (stars >= 1) launchConfetti()
}

$maybe('mission-retry-btn')?.addEventListener('click', showIntro)

// On load: silently rejoin the same participant after a reload instead of
// creating a leaderboard duplicate via a fresh join.
async function resumeStoredParticipant() {
  const stored = loadStoredParticipant()
  if (!stored) return
  currentNickname = stored.nickname
  currentParticipantId = stored.participantId
  currentParticipantToken = stored.participantToken
  showWaitingRoom(stored.avatar, stored.nickname, 'Відновлюємо гру…')
  try {
    const session = await getSchoolParticipantSession(stored.participantId, stored.participantToken)
    if (session.status === 'active' && session.questions.length > 0) {
      startSchoolMission(stored.participantId, stored.participantToken, session.questions, {
        answeredQuestionIds: session.answeredQuestionIds ?? [],
        score: session.score ?? 0,
      })
    } else if (session.status === 'lobby') {
      showWaitingRoom(stored.avatar, stored.nickname)
      startWaitingPoll(stored.participantId, stored.participantToken)
    } else {
      showIntro()
    }
  } catch (err) {
    if (isStaleParticipantError(err)) {
      showIntro()
      errorEl.textContent = 'Не вдалося відновити участь. Приєднайся до гри ще раз.'
      return
    }
    showWaitingRoom(stored.avatar, stored.nickname, 'Зв’язок нестабільний. Пробуємо відновити гру...')
    startWaitingPoll(stored.participantId, stored.participantToken)
  }
}

void resumeStoredParticipant()
