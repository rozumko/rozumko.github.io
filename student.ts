import { loadQuestions, getModeConfig } from './features/olympiad/quiz-engine.js'
import { saveAnswer, finishAttempt } from './features/api/client.js'
import { renderQuestion, type RenderableQuestion } from './utils/question-renderer.js'
import { showModal } from './utils/ui.js'
import { $, $maybe } from './utils/dom.js'

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
    const qs  = await loadQuestions(selectedDemoGrade, 'demo', cfg.count, null)
    startQuiz(qs, 'demo', cfg, { grade: selectedDemoGrade })
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
const quizQuestionEl  = $('quiz-question-text')
const quizOptionsEl   = $('quiz-options')
const quizFeedback    = $('quiz-feedback')
const quizExplanation = $('quiz-explanation')
const quizNextBtn     = $<HTMLButtonElement>('quiz-next-btn')
const quizQuitBtn     = $<HTMLButtonElement>('quiz-quit-btn')

// --- Lightbox ---
const quizImage     = $maybe<HTMLImageElement>('quiz-image')
const imgLightbox   = $maybe('img-lightbox')
const imgLightboxImg = $maybe<HTMLImageElement>('img-lightbox-img')

function openLightbox(src: string, alt: string) {
  if (!imgLightboxImg || !imgLightbox) return
  imgLightboxImg.src = src
  imgLightboxImg.alt = alt || ''
  imgLightbox.classList.remove('hidden')
  imgLightbox.focus()
}
function closeLightbox() {
  if (!imgLightbox || !imgLightboxImg) return
  imgLightbox.classList.add('hidden')
  imgLightboxImg.src = ''
}
imgLightbox?.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (target === imgLightbox || target.closest('#img-lightbox-close')) closeLightbox()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imgLightbox && !imgLightbox.classList.contains('hidden')) closeLightbox()
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
        if (fresh && b.meta?.code && backupText && backupDiv) {
          backupText.textContent = `Код: ${b.meta.code} · Результат на момент збою: ${b.score ?? '?'}/${b.meta?.totalQuestions ?? '?'}`
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
  if (msg.includes('AppCheck') || msg.includes('recaptcha') || msg.includes('net::')) return
  if (currentMode && currentIdx > 0) {
    showErrorBoundary(msg)
    event.preventDefault()
  }
})

window.addEventListener('error', (event) => {
  const msg = `${event.message} (${event.filename}:${event.lineno})`
  if (currentMode && currentIdx > 0) showErrorBoundary(msg)
})

// --- Стан ---
let selectedGrade:    number | null = null
let selectedDiff:     string | null = null

let questions:        RenderableQuestion[] = []
let currentIdx        = 0
let score             = 0
let answered          = false
let timerInterval:    ReturnType<typeof setInterval> | null = null
let secondsLeft       = 0
let startedAt:        number | null = null
let currentMode:      string | null = null

let currentAttemptId:    string | null = null
let currentAttemptToken: string | null = null
let failedAnswers:       Set<string> = new Set()    // questionId-и, які не вдалось зберегти
let pendingSaves:        Promise<void>[] = []       // активні збереження відповідей

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
    localStorage.setItem(QUIZ_BACKUP_KEY, JSON.stringify({
      attemptId:    currentAttemptId,
      attemptToken: currentAttemptToken,
      mode:         currentMode,
      currentIdx,
      score,
      secondsLeft,
      startedAt,
      meta:         (startQuiz as any).meta,
      savedAt:      Date.now(),
    }))
  } catch { /* localStorage недоступний */ }
}

function clearQuizBackup() {
  try { localStorage.removeItem(QUIZ_BACKUP_KEY) } catch { /* ігноруємо */ }
}

// ===================== ОЛІМПІАДА З SESSIONSTORAGE =====================
// olympiad-enter.html викликає exchange-code, зберігає результат у sessionStorage
// і перенаправляє сюди. Ми читаємо і стартуємо квіз.

;(function checkPendingOlympiad() {
  const raw = sessionStorage.getItem('pendingOlympiad')
  if (!raw) return
  sessionStorage.removeItem('pendingOlympiad')
  try {
    const pending = JSON.parse(raw) as {
      attemptId: string; attemptToken: string; grade: number; questions: RenderableQuestion[]
    }
    currentAttemptId    = pending.attemptId
    currentAttemptToken = pending.attemptToken
    const cfg = getModeConfig('olympiad', null)
    showLoading()
    startQuiz(pending.questions, 'olympiad', cfg, { grade: pending.grade })
  } catch { /* пошкоджений sessionStorage — ігноруємо */ }
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
    const qs  = await loadQuestions(selectedGrade!, 'practice', cfg.count, selectedDiff!)
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

function startQuiz(qs: RenderableQuestion[], mode: string, cfg: any, meta: QuizMeta) {
  questions     = qs
  currentIdx    = 0
  score         = 0
  answered      = false
  currentMode   = mode
  startedAt     = Date.now()
  failedAnswers = new Set()
  pendingSaves  = []
  ;(startQuiz as any).meta = meta

  const labels:     Record<string, string> = { practice: 'Тренування', demo: 'Демо', olympiad: 'Олімпіада' }
  const badgeColor: Record<string, string> = { practice: '#fef3c7', demo: '#e0f2fe', olympiad: '#ffe4e6' }
  const badgeText:  Record<string, string> = { practice: '#92400e', demo: '#0369a1', olympiad: '#9f1239' }
  quizModeBadge.textContent          = labels[mode]
  quizModeBadge.className            = 'quiz-badge'
  ;(quizModeBadge as HTMLElement).style.background = badgeColor[mode] ?? '#f1f5f9'
  ;(quizModeBadge as HTMLElement).style.color      = badgeText[mode]  ?? '#334155'

  clearInterval(timerInterval!)
  if (cfg.timeMinutes) {
    secondsLeft = cfg.timeMinutes * 60
    quizTimer.classList.add('visible')
    updateTimerDisplay()
    timerInterval = setInterval(() => {
      secondsLeft--
      updateTimerDisplay()
      if (secondsLeft <= 0) finishQuiz(true)
    }, 1000)
  } else {
    quizTimer.classList.remove('visible')
  }

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

  if (q.img && quizImage) {
    quizImage.src    = q.img as string
    quizImage.classList.remove('hidden')
    quizImage.onclick = () => openLightbox(q.img as string, q.q as string)
  } else if (quizImage) {
    quizImage.classList.add('hidden')
    quizImage.src    = ''
    quizImage.onclick = null
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
  quizOptionsEl.innerHTML     = ''

  const type = q.type ?? 'choice'
  quizOptionsEl.className = type === 'choice'
    ? 'quiz-options quiz-options--grid'
    : type === 'truefalse'
    ? 'quiz-options quiz-options--two'
    : 'quiz-options quiz-options--stack'

  renderQuestion(q, quizOptionsEl as HTMLElement, {
    onAnswer: (result) => {
      answered = true
      if (currentMode === 'olympiad' && currentAttemptId && currentAttemptToken && typeof result === 'number') {
        const qId = q.id as string
        // Зберігаємо promise — finishQuiz чекатиме його завершення
        const save = saveAnswer(currentAttemptId, currentAttemptToken, qId, result)
          .catch(() => new Promise<void>(r => setTimeout(r, 2000)).then(
            () => saveAnswer(currentAttemptId!, currentAttemptToken!, qId, result)
          ))
          .then(() => { failedAnswers.delete(qId) })
          .catch(() => { failedAnswers.add(qId) })
        pendingSaves.push(save)
        showFeedbackOlympiad()
      } else {
        if (result === true) score++
        showFeedback(result as boolean, q)
      }
    },
  })
}

function showFeedbackOlympiad() {
  quizFeedback.textContent = '✓ Відповідь збережено'
  quizFeedback.className   = 'quiz-feedback'
  quizExplanation.classList.add('hidden')
  quizNextBtn.classList.remove('hidden')
  quizNextBtn.textContent  = currentIdx + 1 < questions.length ? 'Далі' : 'Завершити'
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
  saveQuizBackup()
}

quizNextBtn.addEventListener('click', () => {
  currentIdx++
  if (currentIdx < questions.length) showQuestion()
  else finishQuiz(false)
})

async function finishQuiz(timeUp: boolean) {
  clearInterval(timerInterval!)
  const elapsed = Math.round((Date.now() - startedAt!) / 1000)
  hideOverlay(quizOverlay)
  if (currentMode === 'olympiad') exitFullscreen()

  const labels: Record<string, string> = { practice: 'Тренування', demo: 'Демо-версія', olympiad: 'Олімпіада' }
  resultModeLabel.textContent = labels[currentMode!]
  resultTime.textContent      = `Час: ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  resultSavedMsg.classList.add('hidden')
  resultErrorMsg.classList.add('hidden')

  // Для practice/demo — показуємо результат одразу (локальне оцінювання)
  if (currentMode !== 'olympiad') {
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

  // Для олімпіади — спершу відправляємо на сервер, потім показуємо його score
  if (currentAttemptId && currentAttemptToken) {
    const meta = (startQuiz as any).meta as QuizMeta
    // Чекаємо всі pending saves (включно з retry) перед фінішем
    await Promise.allSettled(pendingSaves)
    pendingSaves = []

    // Попереджаємо якщо є відповіді що не дійшли до сервера після retry
    if (failedAnswers.size > 0) {
      resultErrorMsg.innerHTML =
        `⚠️ ${failedAnswers.size} відповід${failedAnswers.size === 1 ? 'ь' : 'і'} не збережено через проблеми з мережею. Результат може бути нижчим від реального.`
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
      resultSavedMsg.classList.remove('hidden')
    } catch {
      // Сервер недоступний — не показуємо score (в official mode він не рахується локально)
      resultScore.textContent = '—'
      resultTotal.textContent = String(questions.length)
      resultTitle.textContent = 'Результат не збережено'
      const backup = { score, total: questions.length, code: meta.code }
      try { localStorage.setItem(QUIZ_BACKUP_KEY + '_failed', JSON.stringify(backup)) } catch { /* ігноруємо */ }
      resultErrorMsg.innerHTML =
        `⚠️ Немає зв'язку — результат не збережено автоматично.<br>
         <strong>Скажи вчителю:</strong> код <strong>${meta.code}</strong>, результат <strong>${score}/${questions.length}</strong>.<br>
         <span style="font-size:0.8em;opacity:0.7">Коли з'явиться інтернет — оновлення сторінки може відновити збереження.</span>`
      resultErrorMsg.classList.remove('hidden')
    }
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
  currentAttemptId    = null
  currentAttemptToken = null
})

resultCloseBtn.addEventListener('click', () => hideOverlay(resultOverlay))

// ===================== УТИЛІТИ =====================

function updateTimerDisplay() {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  quizTimerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`
  if (secondsLeft <= 60) quizTimer.classList.add('urgent')
}

function showOverlay(el: HTMLElement) { el.classList.add('active') }
function hideOverlay(el: HTMLElement) { el.classList.remove('active') }

const quizLoadingOverlay = $('quiz-loading-overlay')
function showLoading() { quizLoadingOverlay.classList.add('active') }
function hideLoading()  { quizLoadingOverlay.classList.remove('active') }

