import './frontend-security.js'
import './register-sw.js'
import { getModeConfig } from './features/olympiad/quiz-engine.js'
import { loadStaticQuestions } from './features/missions/static-questions.js'
import { saveAnswer, finishAttempt, sendHeartbeat } from './features/api/client.js'
import { createAnswerQueue, type AnswerQueue } from './features/olympiad/answer-queue.js'
import { renderQuestion, type RenderableQuestion } from './utils/question-renderer.js'
import { showModal, showConfirm } from './utils/ui.js'
import { $, $maybe } from './utils/dom.js'
import { createFocusTrap } from './utils/focus-trap.js'

// --- DOM: тренування ---
const gradeButtons     = document.querySelectorAll<HTMLButtonElement>('[data-grade]')
const diffButtons      = document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')
const startPracticeBtn = $<HTMLButtonElement>('start-practice-btn')

// --- DOM: демо без коду ---
const demoGradeButtons  = document.querySelectorAll<HTMLButtonElement>('[data-demo-grade]')
const startDemoFreeBtn  = $<HTMLButtonElement>('start-demo-free-btn')
let selectedDemoGrade: number | null = null

// --- Тренування: показати/сховати ---
$('show-practice-btn').addEventListener('click', () => {
  $('hub-menu').classList.add('hidden')
  $('demo-section').classList.add('hidden')
  $('practice-section').classList.remove('hidden')
})
$('hide-practice-btn').addEventListener('click', () => {
  $('practice-section').classList.add('hidden')
  $('hub-menu').classList.remove('hidden')
})

// --- Демо: показати/сховати ---
$('show-demo-btn').addEventListener('click', () => {
  $('hub-menu').classList.add('hidden')
  $('practice-section').classList.add('hidden')
  $('demo-section').classList.remove('hidden')
})
$('hide-demo-btn').addEventListener('click', () => {
  $('demo-section').classList.add('hidden')
  $('hub-menu').classList.remove('hidden')
})

demoGradeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    demoGradeButtons.forEach(b => b.setAttribute('aria-pressed', 'false'))
    btn.setAttribute('aria-pressed', 'true')
    selectedDemoGrade = Number(btn.dataset['demoGrade'])
    startDemoFreeBtn.disabled = false
  })
})

startDemoFreeBtn.addEventListener('click', async () => {
  if (!selectedDemoGrade) return
  startDemoFreeBtn.disabled = true
  showLoading()
  try {
    const cfg = getModeConfig('demo', null)
    const qs  = await loadStaticQuestions(selectedDemoGrade, { count: cfg.count, difficulty: 'hard' })
    startQuiz(qs.map(stripAnswerKeysForDemo), 'demo', cfg, { grade: selectedDemoGrade })
  } catch (err) {
    hideLoading()
    showModal((err as Error).message)
  } finally {
    startDemoFreeBtn.disabled = false
  }
})

// --- DOM: quiz overlay ---
const quizOverlay     = $('quiz-overlay')
const quizModeBadge   = $('quiz-mode-badge')
const quizProgressTxt = $('quiz-progress-text')
const quizProgressBar = $('quiz-progress-bar')
const quizTimer       = $('quiz-timer')
const quizTimerDisplay = $('quiz-timer-display')
const quizQuestionCard = $('quiz-question-card')
const quizQuestionEl  = $('quiz-question-text')
const quizOptionsEl   = $('quiz-options')
const quizFeedback    = $('quiz-feedback')
const quizExplanation = $('quiz-explanation')
const quizNextBtn     = $<HTMLButtonElement>('quiz-next-btn')
const quizSkipBtn     = $<HTMLButtonElement>('quiz-skip-btn')
const quizQuitBtn     = $<HTMLButtonElement>('quiz-quit-btn')
const quizNav         = $('quiz-nav')
const toastNotification = $('toast-notification')

// --- Lightbox ---
const quizImage     = $maybe<HTMLImageElement>('quiz-image')
const quizImageBtn  = $maybe<HTMLButtonElement>('quiz-image-btn')
const imgLightbox   = $maybe('img-lightbox')
const imgLightboxImg = $maybe<HTMLImageElement>('img-lightbox-img')
let lightboxTrapRemove: (() => void) | null = null

function openLightbox(src: string, alt: string) {
  if (!imgLightboxImg || !imgLightbox) return
  imgLightboxImg.src = src
  imgLightboxImg.alt = alt || ''
  imgLightbox.classList.remove('hidden')
  lightboxTrapRemove?.()
  lightboxTrapRemove = createFocusTrap(imgLightbox, closeLightbox)
}
function closeLightbox() {
  if (!imgLightbox || !imgLightboxImg) return
  lightboxTrapRemove?.()
  lightboxTrapRemove = null
  imgLightbox.classList.add('hidden')
  imgLightboxImg.src = ''
}
imgLightbox?.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (target === imgLightbox || target.closest('#img-lightbox-close')) closeLightbox()
})
// --- DOM: result overlay ---
const resultOverlay   = $('result-overlay')
const resultTitle     = $('result-title')
const resultModeLabel = $('result-mode-label')
const resultScore     = $('result-score')
const resultTotal     = $('result-total')
const resultTime      = $('result-time')
const resultSavedMsg  = $('result-saved-msg')
const resultErrorMsg  = $('result-error-msg')
const resultCloseBtn  = $<HTMLButtonElement>('result-close-btn')

// --- DOM: quit confirm ---
const quitConfirm    = $('quit-confirm')
const quitConfirmYes = $<HTMLButtonElement>('quit-confirm-yes')
const quitConfirmNo  = $<HTMLButtonElement>('quit-confirm-no')

// ===================== ERROR BOUNDARY =====================

function showErrorBoundary(msg = '') {
  try {
    const overlay = $maybe('error-boundary')
    if (!overlay) return

    const backupDiv  = $maybe('error-boundary-backup')
    const backupText = $maybe('error-boundary-backup-text')
    try {
      const raw = localStorage.getItem('rozumko_quiz_backup')
      if (raw) {
        const b = JSON.parse(raw)
        const fresh = b?.startedAt && Date.now() - b.startedAt < 3 * 60 * 60 * 1000
        if (fresh && backupText && backupDiv) {
          backupText.textContent = `Спробу збережено до питання ${Number(b.currentIdx ?? 0) + 1}. Введи свій код повторно, щоб продовжити.`
          backupDiv.classList.remove('hidden')
        }
      }
    } catch { /* ігноруємо помилки localStorage */ }

    overlay.classList.remove('hidden')
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
    console.error('[Розумко] Критична помилка:', msg)
  } catch { /* якщо навіть error boundary зламався — мовчимо */ }
}

window.addEventListener('unhandledrejection', (event) => {
  const msg = (event.reason as Error)?.message ?? String(event.reason ?? '')
  if (msg.includes('net::') || msg.includes('Failed to fetch')) return
  if (currentMode && currentIdx > 0) {
    showErrorBoundary(msg)
    event.preventDefault()
  }
})

window.addEventListener('error', (event) => {
  const msg = `${event.message} (${event.filename}:${event.lineno})`
  if (currentMode && currentIdx > 0) showErrorBoundary(msg)
})

$<HTMLButtonElement>('error-boundary-reload').addEventListener('click', () => window.location.reload())
$<HTMLButtonElement>('error-boundary-dismiss').addEventListener('click', () => $maybe('error-boundary')?.classList.add('hidden'))

// --- Стан ---
let selectedGrade:    number | null = null
let selectedDiff:     string | null = null

let questions:        RenderableQuestion[] = []
let currentIdx        = 0
let score             = 0
let answered          = false
let timerInterval:    ReturnType<typeof setInterval> | null = null
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let finishing         = false                       // guard від подвійного finishQuiz
let secondsLeft       = 0
const TIME_WARNINGS   = new Set([300, 60, 30])
const spokenTimeWarnings = new Set<number>()
let toastTimer:       ReturnType<typeof setTimeout> | null = null
let startedAt:        number | null = null
let currentMode:      string | null = null

let currentAttemptId:    string | null = null
let currentAttemptToken: string | null = null
let answerQueue:         AnswerQueue | null = null  // offline-стійка черга відповідей (олімпіада)
let answeredIds:         Set<string> = new Set()    // questionId-и, на які вже відповіли (для навігатора)
let savedAnswers:        Map<string, unknown> = new Map() // сирі відповіді учня (для підсвічування при поверненні)
let navEnabled           = false                    // пропуск+повернення лише для olympiad/demo

// ===================== FULLSCREEN =====================

function enterFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void
  }
  try {
    if (el.requestFullscreen)             el.requestFullscreen()
    else if (el.webkitRequestFullscreen)  el.webkitRequestFullscreen()
  } catch { /* браузер може відхилити — не критично */ }
}
function exitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => void
    webkitFullscreenElement?: Element | null
  }
  try {
    if (doc.exitFullscreen && doc.fullscreenElement)
      doc.exitFullscreen()
    else if (doc.webkitExitFullscreen && doc.webkitFullscreenElement)
      doc.webkitExitFullscreen()
  } catch { /* ігноруємо */ }
}

// ===================== LOCALSTORAGE BACKUP =====================

const QUIZ_BACKUP_KEY = 'rozumko_quiz_backup'

function saveQuizBackup() {
  if (currentMode !== 'olympiad' || !currentAttemptId) return
  try {
    // attemptToken і персональний код навмисно НЕ зберігаються в localStorage.
    // Для відновлення учень повторно вводить фізичний код і отримує токен із сервера.
    localStorage.setItem(QUIZ_BACKUP_KEY, JSON.stringify({
      attemptId:  currentAttemptId,
      mode:       currentMode,
      currentIdx,
      secondsLeft,
      startedAt,
      savedAt:    Date.now(),
    }))
  } catch { /* localStorage недоступний */ }
}

function clearQuizBackup() {
  try { localStorage.removeItem(QUIZ_BACKUP_KEY) } catch { /* ігноруємо */ }
}

function hasFreshQuizBackup(): boolean {
  try {
    const raw = localStorage.getItem(QUIZ_BACKUP_KEY)
    if (!raw) return false
    const backup = JSON.parse(raw)
    return backup?.mode === 'olympiad'
      && typeof backup.attemptId === 'string'
      && typeof backup.savedAt === 'number'
      && Date.now() - backup.savedAt < 3 * 60 * 60 * 1000
  } catch {
    return false
  }
}

// ===================== ОЛІМПІАДА З SESSIONSTORAGE =====================
// olympiad-enter.html викликає exchange-code, зберігає результат у sessionStorage
// і перенаправляє сюди. Ми читаємо і стартуємо квіз.

;(function checkPendingOlympiad() {
  const raw = sessionStorage.getItem('pendingOlympiad')
  if (!raw) {
    if (hasFreshQuizBackup()) window.location.replace('olympiad-enter.html')
    return
  }
  sessionStorage.removeItem('pendingOlympiad')
  try {
    const pending = JSON.parse(raw) as {
      attemptId: string; attemptToken: string; code: string; grade: number; questions: RenderableQuestion[]
      answeredQuestionIds?: string[]; remainingSeconds?: number
    }
    currentAttemptId    = pending.attemptId
    currentAttemptToken = pending.attemptToken
    const cfg = getModeConfig('olympiad', null)
    showLoading()
    const answeredIds = new Set(pending.answeredQuestionIds ?? [])
    const firstUnanswered = pending.questions.findIndex(q => !answeredIds.has(q.id as string))
    startQuiz(pending.questions, 'olympiad', cfg, { grade: pending.grade, code: pending.code }, {
      currentIdx: firstUnanswered === -1 ? Math.max(0, pending.questions.length - 1) : firstUnanswered,
      secondsLeft: pending.remainingSeconds,
      answeredIds: [...answeredIds],
    })
  } catch {
    if (hasFreshQuizBackup()) window.location.replace('olympiad-enter.html')
  }
})()

// ===================== ТРЕНУВАННЯ =====================

gradeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    gradeButtons.forEach(b => b.setAttribute('aria-pressed', 'false'))
    btn.setAttribute('aria-pressed', 'true')
    selectedGrade = Number(btn.dataset['grade'])
    updateStartBtn()
  })
})

diffButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    diffButtons.forEach(b => b.setAttribute('aria-pressed', 'false'))
    btn.setAttribute('aria-pressed', 'true')
    selectedDiff = btn.dataset['difficulty'] ?? null
    updateStartBtn()
  })
})

function updateStartBtn() {
  startPracticeBtn.disabled = !(selectedGrade && selectedDiff)
}

startPracticeBtn.addEventListener('click', async () => {
  startPracticeBtn.disabled = true
  showLoading()
  try {
    const cfg = getModeConfig('practice')
    const qs  = await loadStaticQuestions(selectedGrade!, { count: cfg.count, difficulty: selectedDiff! })
    if (qs.length === 0) throw new Error('Питань для цих налаштувань немає.')
    startQuiz(qs, 'practice', cfg, { grade: selectedGrade })
  } catch (err) {
    hideLoading()
    showModal((err as Error).message)
  } finally {
    startPracticeBtn.disabled = false
  }
})

// ===================== QUIZ ENGINE =====================

interface QuizMeta { code?: string; grade?: number | null; [k: string]: unknown }
interface QuizStartState { currentIdx?: number; secondsLeft?: number; answeredIds?: string[] }

function stripAnswerKeysForDemo(q: RenderableQuestion): RenderableQuestion {
  const safe = { ...q } as RenderableQuestion & Record<string, unknown>
  delete safe.correct
  delete safe.answer
  delete safe.correctOrder
  delete safe.pairs

  if (safe.options && typeof safe.options === 'object' && !Array.isArray(safe.options)) {
    const options = { ...(safe.options as Record<string, unknown>) }
    delete options.correct
    delete options.answer
    delete options.correctOrder
    delete options.pairs
    safe.options = options
  }

  return safe
}

function startQuiz(qs: RenderableQuestion[], mode: string, cfg: any, meta: QuizMeta, restore: QuizStartState = {}) {
  questions     = qs
  currentIdx    = restore.currentIdx ?? 0
  score         = 0
  answered      = false
  currentMode   = mode
  startedAt     = Date.now()
  answeredIds   = new Set(restore.answeredIds ?? [])
  savedAnswers  = new Map()
  finishing     = false
  navEnabled    = mode === 'olympiad' || mode === 'demo'
  quizNav.classList.toggle('hidden', !navEnabled)
  ;(startQuiz as any).meta = meta

  // Offline-черга: лише олімпіада (demo не зберігає на сервер). Читає токен
  // ліниво, тож переживає resume з новим токеном після перезавантаження.
  answerQueue?.destroy()
  answerQueue = null
  if (mode === 'olympiad' && currentAttemptId && currentAttemptToken) {
    answerQueue = createAnswerQueue(currentAttemptId, {
      send: (qId, ans) => saveAnswer(currentAttemptId!, currentAttemptToken!, qId, ans),
    })
    void answerQueue.flushOnce() // дошле відповіді, що лишились з попередньої сесії (reload/блекаут)
  }

  const labels:     Record<string, string> = { practice: 'Тренування', demo: 'Демо', olympiad: 'Олімпіада' }
  const badgeColor: Record<string, string> = { practice: '#fef3c7', demo: '#e0f2fe', olympiad: '#ffe4e6' }
  const badgeText:  Record<string, string> = { practice: '#92400e', demo: '#0369a1', olympiad: '#9f1239' }
  quizModeBadge.textContent          = labels[mode]
  quizModeBadge.className            = 'quiz-badge'
  ;(quizModeBadge as HTMLElement).style.background = badgeColor[mode] ?? '#f1f5f9'
  ;(quizModeBadge as HTMLElement).style.color      = badgeText[mode]  ?? '#334155'

  clearInterval(timerInterval!)
  spokenTimeWarnings.clear()
  if (cfg.timeMinutes) {
    secondsLeft = restore.secondsLeft ?? cfg.timeMinutes * 60
    quizTimer.classList.add('visible')
    updateTimerDisplay(false)
    // Локальний тік — лише для показу. Рішення «час вийшов» ухвалює сервер через
    // heartbeat (олімпіада) або дедлайн-перевірку в answer/finish, тож блекаут не
    // завершить квіз передчасно: пауза зараховується й таймер ресинкається.
    timerInterval = setInterval(() => {
      secondsLeft = Math.max(0, secondsLeft - 1)
      updateTimerDisplay()
      if (currentMode === 'demo' && secondsLeft <= 0) finishQuiz(true)
    }, 1000)
  } else {
    quizTimer.classList.remove('visible')
    quizTimer.classList.remove('urgent')
  }

  // Heartbeat лише для олімпіади (demo не має серверної спроби).
  if (mode === 'olympiad' && currentAttemptId && currentAttemptToken) startHeartbeat()

  saveQuizBackup()
  hideLoading()
  showOverlay(quizOverlay)
  if (mode === 'olympiad') enterFullscreen()
  showQuestion()
}

function showQuestion() {
  const q   = questions[currentIdx]
  answered  = false

  quizProgressTxt.textContent        = `${currentIdx + 1} / ${questions.length}`
  ;(quizProgressBar as HTMLElement).style.width = `${(currentIdx / questions.length) * 100}%`
  quizQuestionEl.textContent         = q.q as string

  if (q.img && quizImage && quizImageBtn) {
    quizImage.src    = q.img as string
    quizImageBtn.classList.remove('hidden')
    quizImageBtn.onclick = () => openLightbox(q.img as string, q.q as string)
  } else {
    quizImageBtn?.classList.add('hidden')
    if (quizImage) {
      quizImage.src = ''
    }
    if (quizImageBtn) quizImageBtn.onclick = null
  }

  const codeBlock = $maybe('quiz-code-block')
  if (q.code && codeBlock) {
    codeBlock.textContent = q.code as string
    codeBlock.classList.remove('hidden')
  } else {
    codeBlock?.classList.add('hidden')
  }

  quizFeedback.textContent    = ''
  quizExplanation.textContent = ''
  quizExplanation.classList.add('hidden')
  quizNextBtn.classList.add('hidden')
  quizOverlay.classList.remove('quiz-answered') // фідбек-панель ховається (style.css: quiz-fit)
  quizOptionsEl.innerHTML     = ''

  // Навігатор + кнопка "Пропустити" (olympiad/demo). На останньому питанні
  // скіп перетворюється на "Завершити" (Крок 3 додасть попередження про пропущені).
  if (navEnabled) {
    renderNav()
    // Вже відповів → "Далі" (лише перегляд); ще ні → "Пропустити"; останнє → "Завершити".
    const isAnswered = answeredIds.has(questions[currentIdx].id as string)
    quizSkipBtn.textContent = currentIdx + 1 < questions.length
      ? (isAnswered ? 'Далі →' : 'Пропустити →')
      : 'Завершити'
    quizSkipBtn.classList.remove('hidden')
  } else {
    quizSkipBtn.classList.add('hidden')
  }

  const type = q.type ?? 'choice'
  quizOptionsEl.className = type === 'choice'
    ? 'quiz-options quiz-options--grid'
    : type === 'truefalse'
    ? 'quiz-options quiz-options--two'
    : 'quiz-options quiz-options--stack'

  const prev = navEnabled ? savedAnswers.get(q.id as string) : undefined
  renderQuestion(q, quizOptionsEl as HTMLElement, {
    preselect: (prev ?? null) as boolean | number | number[] | string | null,
    onAnswer: (result) => {
      answered = true
      // boolean → practice (correct відомий клієнту, локальне оцінювання).
      // number | number[] | string → olympiad/demo (correct стрипнуто; оцінює сервер).
      //   number    — choice/truefalse/sequence (індекс)
      //   number[]  — sort/match (порядок / пари)
      //   string    — input (текст)
      if (typeof result === 'boolean') {
        if (result === true) score++
        showFeedback(result, q)
        return
      }

      answeredIds.add(q.id as string) // для навігатора (olympiad + demo)
      savedAnswers.set(q.id as string, result) // для підсвічування при поверненні

      // Olympiad: у offline-стійку чергу (дошле сама при звʼязку). Demo: лише feedback.
      if (currentMode === 'olympiad') {
        answerQueue?.enqueue(q.id as string, result)
      }
      showFeedbackOlympiad() // нейтральний feedback: "збережено" для olympiad, "прийнято" для demo
    },
  })

  if ((currentIdx > 0 || navEnabled) && type !== 'input') {
    quizQuestionCard.focus()
  }
}

function showFeedbackOlympiad() {
  // Для олімпіади — "Відповідь збережено", для demo — нейтральне "Відповідь прийнято"
  quizFeedback.textContent = currentMode === 'olympiad' ? '✓ Відповідь збережено' : '✓ Відповідь прийнято'
  quizFeedback.className   = 'quiz-feedback'
  quizExplanation.classList.add('hidden')
  quizSkipBtn.classList.add('hidden')
  if (navEnabled) renderNav()
  quizNextBtn.classList.remove('hidden')
  quizNextBtn.textContent  = currentIdx + 1 < questions.length ? 'Далі' : 'Завершити'
  quizOverlay.classList.add('quiz-answered')
  saveQuizBackup()
}

function showFeedback(isCorrect: boolean, q: RenderableQuestion) {
  quizFeedback.textContent = isCorrect ? '✓ Правильно!' : '✗ Неправильно'
  quizFeedback.className   = isCorrect
    ? 'quiz-feedback quiz-feedback--correct'
    : 'quiz-feedback quiz-feedback--incorrect'
  const cfg = getModeConfig(currentMode!)
  if (cfg.showExplanation && q.explanation) {
    quizExplanation.textContent = q.explanation
    quizExplanation.classList.remove('hidden')
  }
  quizNextBtn.classList.remove('hidden')
  quizNextBtn.textContent = currentIdx + 1 < questions.length ? 'Далі' : 'Завершити'
  quizOverlay.classList.add('quiz-answered')
  saveQuizBackup()
}

quizNextBtn.addEventListener('click', () => {
  currentIdx++
  if (currentIdx < questions.length) showQuestion()
  else attemptFinish()
})

// Пропустити: на непослідньому — вперед на 1 без відповіді; на останньому — завершити.
// Повернутись до пропущеного можна через чипи навігатора.
quizSkipBtn.addEventListener('click', () => {
  if (currentIdx + 1 < questions.length) { currentIdx++; showQuestion() }
  else attemptFinish()
})

// Український відмінок для слова "питання": 1/2/3/4 → питання, 5+/11-14 → питань.
function pytannyaWord(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'питань'
  const mod10 = n % 10
  return mod10 >= 1 && mod10 <= 4 ? 'питання' : 'питань'
}

// Перед завершенням (olympiad/demo) — м'яке нагадування про пропущені питання.
function attemptFinish() {
  if (navEnabled) {
    const remaining = questions.filter(q => !answeredIds.has(q.id as string)).length
    if (remaining > 0) {
      showConfirm(
        `Залишилось ${remaining} ${pytannyaWord(remaining)} без відповіді 🙂 Точно завершити?`,
        () => finishQuiz(false),
      )
      return
    }
  }
  finishQuiz(false)
}

function goToQuestion(i: number) {
  if (i < 0 || i >= questions.length || i === currentIdx) return
  currentIdx = i
  showQuestion()
}

// Стрічка чипів: 3 стани — відповів (зелений) / поточне (синій) / решта (сірий).
function renderNav() {
  quizNav.innerHTML = ''
  questions.forEach((q, i) => {
    const chip = document.createElement('button')
    chip.className = 'quiz-nav-chip'
    chip.textContent = String(i + 1)
    const isAnswered = answeredIds.has(q.id as string)
    if (isAnswered)     chip.classList.add('quiz-nav-chip--answered')
    if (i === currentIdx) chip.classList.add('quiz-nav-chip--current')
    chip.setAttribute('aria-label', `Питання ${i + 1}${isAnswered ? ' — відповів' : ''}${i === currentIdx ? ' — поточне' : ''}`)
    if (i === currentIdx) chip.setAttribute('aria-current', 'step')
    chip.addEventListener('click', () => goToQuestion(i))
    quizNav.appendChild(chip)
  })
}

// ===================== HEARTBEAT (пауза таймера) =====================
// Пульс щосекунд*15: сервер кредитує паузу при блекаутах і повертає авторитетний
// залишок часу. Локальний таймер лише показує — сервер вирішує «час вийшов».
async function doHeartbeat() {
  if (currentMode !== 'olympiad' || !currentAttemptId || !currentAttemptToken) return
  try {
    const hb = await sendHeartbeat(currentAttemptId, currentAttemptToken)
    if (typeof hb.remainingSeconds === 'number') {
      secondsLeft = hb.remainingSeconds        // ресинк із серверною правдою (враховує паузу)
      updateTimerDisplay()
      if (secondsLeft <= 0) finishQuiz(true)
    }
  } catch (e) {
    // 410 — сервер каже, що час вичерпано (навіть з паузою). Інші (офлайн) — чекаємо звʼязку.
    if ((e as { status?: number })?.status === 410) finishQuiz(true)
  }
}
function startHeartbeat() {
  stopHeartbeat()
  heartbeatInterval = setInterval(doHeartbeat, 15_000)
  window.addEventListener('online', doHeartbeat) // миттєвий пульс щойно зʼявився інтернет
}
function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null }
  window.removeEventListener('online', doHeartbeat)
}

async function finishQuiz(timeUp: boolean) {
  if (finishing) return
  finishing = true
  clearInterval(timerInterval!)
  stopHeartbeat()
  const elapsed = Math.round((Date.now() - startedAt!) / 1000)
  hideOverlay(quizOverlay)
  if (currentMode === 'olympiad') exitFullscreen()

  const labels: Record<string, string> = { practice: 'Тренування', demo: 'Демо-версія', olympiad: 'Олімпіада' }
  resultModeLabel.textContent = labels[currentMode!]
  resultTime.textContent      = `Час: ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  resultSavedMsg.classList.add('hidden')
  resultErrorMsg.classList.add('hidden')

  // Для practice — показуємо score (локальне оцінювання з correct).
  // Для demo — не рахуємо score (correct невідомий), показуємо нейтральне завершення.
  if (currentMode === 'practice') {
    const finalScore = score
    const total      = questions.length
    resultScore.textContent = String(finalScore)
    resultTotal.textContent = String(total)
    resultTitle.textContent = timeUp ? 'Час вийшов!'
      : finalScore >= total * 0.8 ? 'Відмінно!'
      : finalScore >= total * 0.5 ? 'Добре!'
      : 'Спробуй ще!'
    showOverlay(resultOverlay)
    return
  }
  if (currentMode === 'demo') {
    resultScore.textContent = '—'
    resultTotal.textContent = String(questions.length)
    resultTitle.textContent = timeUp ? 'Час вийшов!' : 'Демо завершено!'
    showOverlay(resultOverlay)
    return
  }

  // Для олімпіади — спершу відправляємо на сервер, потім показуємо його score
  if (currentAttemptId && currentAttemptToken) {
    const meta = (startQuiz as any).meta as QuizMeta
    // Дочищаємо offline-чергу (з ретраями) перед фінішем.
    const undelivered = answerQueue ? await answerQueue.flushAll() : 0

    // Попереджаємо якщо частина відповідей так і не дійшла до сервера.
    if (undelivered > 0) {
      resultErrorMsg.innerHTML =
        `⚠️ ${undelivered} відповід${undelivered === 1 ? 'ь' : undelivered >= 2 && undelivered <= 4 ? 'і' : 'ей'} не збережено через проблеми з мережею. Результат може бути нижчим від реального.`
      resultErrorMsg.classList.remove('hidden')
    }
    // Показуємо оверлей з плейсхолдером поки сервер рахує
    resultScore.textContent = '…'
    resultTotal.textContent = String(questions.length)
    resultTitle.textContent = timeUp ? 'Час вийшов!' : 'Обробка результату…'
    showOverlay(resultOverlay)
    try {
      const serverResult = await finishAttempt(currentAttemptId, currentAttemptToken)
      // Оновлюємо UI серверним score — єдиним достовірним результатом
      const finalScore = serverResult.score
      const total      = serverResult.total
      resultScore.textContent = String(finalScore)
      resultTotal.textContent = String(total)
      resultTitle.textContent = timeUp ? 'Час вийшов!'
        : finalScore >= total * 0.8 ? 'Відмінно!'
        : finalScore >= total * 0.5 ? 'Добре!'
        : 'Спробуй ще!'
      clearQuizBackup()
      answerQueue?.clear() // спробу завершено — черга більше не потрібна
      resultSavedMsg.classList.remove('hidden')
    } catch {
      // Сервер недоступний — не показуємо score (в official mode він не рахується локально)
      resultScore.textContent = '—'
      resultTotal.textContent = String(questions.length)
      resultTitle.textContent = 'Результат не збережено'
      const backup = { attemptId: currentAttemptId, savedAt: Date.now() }
      try { localStorage.setItem(QUIZ_BACKUP_KEY + '_failed', JSON.stringify(backup)) } catch { /* ігноруємо */ }
      resultErrorMsg.innerHTML =
        `⚠️ Немає зв'язку — результат не збережено автоматично.<br>
         <strong>Скажи вчителю:</strong> код <strong>${meta.code}</strong>, результат невідомий — перевірте на сервері.<br>
         <span style="font-size:0.8em;opacity:0.7">Коли з'явиться інтернет — оновлення сторінки може відновити збереження.</span>`
      resultErrorMsg.classList.remove('hidden')
    }
    // Знімаємо автотригери. На успіху чергу вже очищено; на збої залишаємо
    // збережені items у localStorage — reload + повторний код їх дошле.
    answerQueue?.destroy()
    answerQueue         = null
    currentAttemptId    = null
    currentAttemptToken = null
  }
}

// ===================== ВИХІД З ТЕСТУ =====================

quizQuitBtn.addEventListener('click', () => showOverlay(quitConfirm))
quitConfirmNo.addEventListener('click', () => hideOverlay(quitConfirm))
quitConfirmYes.addEventListener('click', () => {
  clearInterval(timerInterval!)
  hideOverlay(quitConfirm)
  hideOverlay(quizOverlay)
  if (currentMode === 'olympiad') exitFullscreen()
  clearInterval(timerInterval!)
  stopHeartbeat()
  answerQueue?.destroy()
  answerQueue         = null
  currentAttemptId    = null
  currentAttemptToken = null
})

resultCloseBtn.addEventListener('click', () => hideOverlay(resultOverlay))

// ===================== УТИЛІТИ =====================

function showToast(message: string) {
  if (toastTimer) clearTimeout(toastTimer)
  toastNotification.textContent = message
  toastNotification.classList.add('toast-notification--visible')
  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('toast-notification--visible')
    toastTimer = null
  }, 4500)
}

function updateTimerDisplay(announce = true) {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  quizTimerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`
  quizTimer.classList.toggle('urgent', secondsLeft <= 60)
  if (announce && TIME_WARNINGS.has(secondsLeft) && !spokenTimeWarnings.has(secondsLeft)) {
    spokenTimeWarnings.add(secondsLeft)
    showToast(secondsLeft >= 60
      ? `Залишилось ${secondsLeft / 60} ${secondsLeft === 60 ? 'хвилина' : 'хвилин'}`
      : 'Залишилось 30 секунд')
  }
}

function showOverlay(el: HTMLElement) { el.classList.add('active') }
function hideOverlay(el: HTMLElement) { el.classList.remove('active') }

const quizLoadingOverlay = $('quiz-loading-overlay')
function showLoading() { quizLoadingOverlay.classList.add('active') }
function hideLoading()  { quizLoadingOverlay.classList.remove('active') }
