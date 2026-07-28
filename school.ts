import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import {
  getSchoolParticipantSession,
  joinSchoolSession,
  submitSchoolActivityResult,
  submitSchoolAnswer,
  updateSchoolParticipantAvatar,
  type Question,
} from './features/api/client.js'
import { findActivity } from './features/activities/registry.js'
import type { ActivityHandle, ActivityRunResult } from './features/activities/activity-contract.js'
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
const activityEl       = $('mission-activity')
const activityDoneEl   = $('mission-activity-done')
const activityDeviceEl = $('mission-activity-device')

const els: MissionElements = {
  progressText: $('quiz-progress-text'),
  progressBar:  $('quiz-progress-bar'),
  questionText: $('quiz-question-text'),
  image:        $maybe<HTMLImageElement>('quiz-image'),
  imageBtn:     $maybe<HTMLButtonElement>('quiz-image-btn'),
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
  destroyActivity()
  setMissionActive(false)
  clearStoredParticipant()
  currentParticipantId = ''
  currentParticipantToken = ''
  setSelectedAvatar(randomAvatar(), false)
  hide(waitEl)
  hide(quizEl)
  hide(resultEl)
  hide(activityEl)
  hide(activityDoneEl)
  hide(activityDeviceEl)
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

// ── Активності ───────────────────────────────────────────────────────────────
// An activity is a procedural game, not a question deck: there is nothing to
// grade on the server, so the game reports its own outcome once the child is
// done and the server clamps it (backend/src/lib/school-activities.ts).
//
// Slice 1 keeps this deliberately simple: only a finished run reports. A child
// whom the teacher interrupts mid-run leaves no result row.

let activeActivity: ActivityHandle | null = null

function destroyActivity() {
  activeActivity?.destroy()
  activeActivity = null
}

function clampStars(stars: number): number {
  return Math.max(0, Math.min(3, Math.floor(stars)))
}

function fallbackActivityStars(activityKey: string | null, result: ActivityRunResult): number {
  if (result.total <= 0) return 0
  const percent = (result.correct / result.total) * 100
  if (activityKey === 'key-puzzle') {
    if (result.correct < result.total) return clampStars(percent >= 75 ? 2 : percent >= 40 ? 1 : 0)
    return clampStars(result.mistakes === 0 ? 3 : result.mistakes < 5 ? 2 : 1)
  }
  if (activityKey === 'maze') {
    if (result.correct < result.total) return clampStars(percent >= 75 ? 2 : percent >= 40 ? 1 : 0)
    return clampStars(result.mistakes <= result.total ? 3 : result.mistakes <= result.total * 3 ? 2 : 1)
  }
  if (activityKey === 'magic-squares') {
    return clampStars(result.correct >= result.total ? 3 : result.correct >= 2 ? 2 : result.correct >= 1 ? 1 : 0)
  }
  if (activityKey === 'symbol-logic') {
    return clampStars(percent >= 90 ? 3 : percent >= 60 ? 2 : percent >= 40 ? 1 : 0)
  }
  // Retry-until-correct activities always finish at 100%, so only the mistake
  // count separates runs. Must mirror `retryRubric` in
  // backend/src/lib/school-activities.ts, or the child sees stars the teacher
  // does not.
  if (activityKey === 'message-coding' || activityKey === 'sorting-station') {
    if (result.correct < result.total) return clampStars(percent >= 75 ? 2 : percent >= 40 ? 1 : 0)
    if (result.mistakes === 0) return 3
    if (result.mistakes <= Math.ceil(result.total / 4)) return 2
    return result.mistakes <= result.total ? 1 : 0
  }
  return clampStars(percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0)
}

function showActivityDeviceNotice(activityLabel: string) {
  clearWaitingPoll()
  destroyActivity()
  setMissionActive(false)
  hide(introEl)
  hide(waitEl)
  hide(quizEl)
  hide(resultEl)
  hide(activityEl)
  const hint = $maybe('activity-device-hint')
  if (hint) {
    hint.textContent = `«${activityLabel}» потребує мишки і великого екрана. `
      + 'Попроси вчителя дати тобі комп’ютер або ноутбук — код гри той самий.'
  }
  show(activityDeviceEl)
}

async function startSchoolActivity(
  participantId: string,
  participantToken: string,
  grade: number,
  activityKey: string | null,
  activityLevel: string | null,
) {
  const activity = findActivity(activityKey)
  if (!activity || !activityLevel) {
    showIntro()
    errorEl.textContent = 'Цю активність не вдалося відкрити. Онови сторінку або попроси вчителя створити гру ще раз.'
    return
  }
  // School Mode targets computer labs; a phone gets an honest notice instead of
  // a layout that cannot work.
  if (window.innerWidth < activity.minWidth) {
    showActivityDeviceNotice(activity.label)
    return
  }

  clearWaitingPoll()
  destroyActivity()
  hide(introEl)
  hide(waitEl)
  hide(resultEl)
  hide(activityDoneEl)
  hide(activityDeviceEl)
  show(activityEl)
  setMissionActive(true)

  const identity = $maybe('activity-identity')
  const avatarImg = $maybe<HTMLImageElement>('activity-avatar-display')
  const nameEl = $maybe('activity-nickname-display')
  if (avatarImg) { avatarImg.src = avatarSrc(selectedAvatar); avatarImg.alt = avatarLabel(selectedAvatar) }
  if (nameEl) nameEl.textContent = currentNickname
  if (identity) show(identity)

  const progressEl = $maybe('activity-progress-text')
  const stage = $('activity-stage')
  const hint = stage.querySelector('.activity-stage__hint')
  if (hint) hint.textContent = activity.hint
  // The stage keeps its hint pill; the game fills the rest.
  stage.innerHTML = ''
  if (hint) stage.appendChild(hint)
  const gameRoot = document.createElement('div')
  gameRoot.className = 'activity-stage__game'
  stage.appendChild(gameRoot)

  try {
    const module = await activity.load()
    activeActivity = module.mount(gameRoot, {
      level: activityLevel,
      grade,
      onProgress: (done, total) => {
        if (progressEl) progressEl.textContent = `${done} / ${total}`
      },
      onFinish: result => { void finishSchoolActivity(participantId, participantToken, activityKey, result) },
    })
  } catch {
    showIntro()
    errorEl.textContent = 'Не вдалося завантажити активність. Онови сторінку.'
  }
}

async function finishSchoolActivity(
  participantId: string,
  participantToken: string,
  activityKey: string | null,
  result: ActivityRunResult,
) {
  destroyActivity()
  try {
    const saved = await submitSchoolActivityResult(participantId, participantToken, result)
    showActivityResult(saved.stars, saved.correct, saved.total, result.durationSec)
  } catch (err) {
    // The run really happened, so the child still sees their own result; only
    // the teacher's copy is missing. Stars come from the same rubric locally.
    const status = (err as { status?: number }).status
    showActivityResult(
      fallbackActivityStars(activityKey, result),
      result.correct, result.total, result.durationSec,
      status === 409 ? '' : 'Результат не дійшов до вчителя — покажи йому цей екран.',
    )
  }
}

function formatActivityDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m} хв ${String(s).padStart(2, '0')} с` : `${s} с`
}

function showActivityResult(stars: number, correct: number, total: number, durationSec: number, note = '') {
  clearWaitingPoll()
  setMissionActive(false)
  hide(waitEl)
  hide(quizEl)
  hide(activityEl)
  const resultAvatar = $maybe<HTMLImageElement>('result-avatar')
  if (resultAvatar) {
    resultAvatar.src = avatarSrc(selectedAvatar)
    resultAvatar.alt = avatarLabel(selectedAvatar)
    resultAvatar.classList.remove('hidden')
  }
  $('result-mission-label').textContent = `Активність • ${currentNickname}`
  $('result-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars)
  // An activity reports how much was assembled and how long it took, not a
  // percentage of right answers.
  const label = $maybe('result-score-label')
  // Neutral wording: the number means keys placed, maze levels passed, windows
  // handled or objects sorted depending on the activity, so it cannot say
  // «Зібрано» the way it did when the keyboard puzzle was the only one.
  if (label) label.textContent = 'Виконано:'
  $('result-score').textContent = `${correct} з ${total}`
  $('result-percent').textContent = formatActivityDuration(durationSec)
  $('result-message').textContent = note || encouragement(total > 0 ? Math.round((correct / total) * 100) : 0)
  show(resultEl)
  playVictorySound()
  if (stars >= 1) launchConfetti()
}

function showActivityDone() {
  clearWaitingPoll()
  destroyActivity()
  setMissionActive(false)
  hide(introEl)
  hide(waitEl)
  hide(quizEl)
  hide(resultEl)
  hide(activityEl)
  hide(activityDeviceEl)
  show(activityDoneEl)
}

function startWaitingPoll(participantId: string, participantToken: string) {
  clearWaitingPoll()
  waitingPollTimer = window.setInterval(async () => {
    try {
      const session = await getSchoolParticipantSession(participantId, participantToken)
      if (session.status === 'active' && session.kind === 'activity') {
        if (session.activityDone) { clearWaitingPoll(); showActivityDone(); return }
        void startSchoolActivity(participantId, participantToken, session.grade, session.activityKey, session.activityLevel)
      } else if (session.status === 'active' && session.questions.length > 0) {
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
  const avatarForJoin = selectedAvatar
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
    if (joined.status === 'active' && joined.kind === 'activity') {
      void startSchoolActivity(joined.participantId, joined.participantToken, joined.grade, joined.activityKey, joined.activityLevel)
    } else if (joined.status === 'active' && joined.questions.length > 0) {
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
  const scoreLabel = $maybe('result-score-label')
  if (scoreLabel) scoreLabel.textContent = 'Правильних відповідей:'
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
    if (session.status === 'active' && session.kind === 'activity') {
      // A reload must not restart a run whose result the server already has.
      if (session.activityDone) showActivityDone()
      else void startSchoolActivity(stored.participantId, stored.participantToken, session.grade, session.activityKey, session.activityLevel)
    } else if (session.status === 'active' && session.questions.length > 0) {
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
