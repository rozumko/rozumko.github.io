import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { shuffleDeck } from './features/missions/question-shuffle.js'
import {
  createHomeLead, submitHomeDemoReport, getHomeClub, submitHomeMissionReport,
  loadHomeClubQuestions, recordHomeFunnelStep,
  type Question, type HomeDemoTrack, type HomeDemoEvent, type HomeDemoReport, type HomeClubState,
  type HomeFunnelStep,
} from './features/api/client.js'
import { loadStaticQuestions } from './features/missions/static-questions.js'
import { getSavedGrade, saveGrade } from './utils/grade.js'
import { createFocusTrap } from './utils/focus-trap.js'
import { PATHS_BY_GRADE } from './features/path/path-data.js'

// Home Demo (зріз 2 контракту docs/home-demo-contract.md).
// Дитина проходить демо-місію без облікового запису: питання приходять із
// публічного backend API без ключів відповідей. Сирі відповіді + телеметрія
// збираються В ПАМʼЯТІ і йдуть на бекенд лише після згоди батька — там сервер
// перераховує все сам і повертає звіт. До згоди — жодного запису.

const POLICY_VERSION = 'privacy-2026-07'
const MISSION_VERSION = 1
const DEMO_COUNT = 6

interface TrackPreset {
  track: HomeDemoTrack
  label: string
  difficulty: 'easy' | 'medium' | 'hard'
}

const TRACKS: Record<string, TrackPreset> = {
  'informatics': {
    track: 'informatics',
    label: 'Інформатика',
    difficulty: 'easy',
  },
  'computational-thinking': {
    track: 'computational-thinking',
    label: 'Обчислювальне мислення',
    difficulty: 'medium',
  },
  'ai-basics': {
    track: 'ai-basics',
    label: 'Основи ШІ',
    difficulty: 'hard',
  },
}

// ── DOM ───────────────────────────────────────────────────────
const introEl  = $('demo-intro')
const quizEl   = $('mission-quiz')
const resultEl = $('mission-result')
const errorEl  = $('demo-error')

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

// ── Стан демо-спроби (лише памʼять — до згоди нічого не зберігається) ────────
let selectedGrade = getSavedGrade()
let currentTrack: TrackPreset | null = null
let events: HomeDemoEvent[] = []
let startedAtIso = ''
// Лід зʼявляється після згоди батька і живе лише в памʼяті сторінки (MVP).
let lead: { id: string; token: string } | null = null
// 'demo' — звіт залочений до згоди; 'club' — платна практика, звіт одразу.
let missionMode: 'demo' | 'club' = 'demo'
let questionShownAt = 0
let selectTouches = 0 // повторні зміни select-ів (match) — сигнал невпевненості
// Токен запуску: вихід посеред завантаження не має домальовувати місію, що
// вже нікому не потрібна. Кнопка входу — щоб повернути на неї фокус на виході.
let activeRun = 0
let lastTrackBtn: HTMLElement | null = null

// ── Воронка: знеособлені лічильники кроків ────────────────────────────────
// Один крок рахуємо не більше разу на завантаження сторінки — інакше дитина,
// що двічі перезапустила тренування, виглядала б як двоє відвідувачів, і
// конверсія між кроками стала б брехливою.
const firedFunnelSteps = new Set<HomeFunnelStep>()

function trackStep(step: HomeFunnelStep, dims: { track?: HomeDemoTrack } = {}) {
  if (firedFunnelSteps.has(step)) return
  firedFunnelSteps.add(step)
  recordHomeFunnelStep(step, { grade: selectedGrade, ...dims })
}

type RawAnswer = number | string | number[]

// Must cover every field question-renderer scores on locally, otherwise that
// question is graded in the browser and never reaches submitAnswer — it would
// be missing from the parent report. Mirrors the backend secret-key list in
// backend/src/lib/olympiad-content-policy.ts.
const KEY_FIELDS = ['correct', 'explanation', 'correctOrder', 'pairs', 'answer', 'correctAnswers'] as const

function stripKeys(q: Question): Question {
  const copy: Record<string, unknown> = { ...q }
  for (const f of KEY_FIELDS) delete copy[f]
  if (copy.options && typeof copy.options === 'object' && !Array.isArray(copy.options)) {
    const opts: Record<string, unknown> = { ...(copy.options as Record<string, unknown>) }
    for (const f of KEY_FIELDS) delete opts[f]
    copy.options = opts as Question['options']
  }
  return copy as Question
}

async function loadDemoQuestions(preset: TrackPreset): Promise<Question[]> {
  // Демо-питання беремо зі статичного бандла (public/questions), а не з бекенду:
  // дитина грає, навіть коли сервер спить (Render cold start). Ключі знімаємо —
  // home-контракт: локально correctness не показуємо, її рахує серверний звіт
  // із телеметрії вже після згоди батька. Бандл і так публічний (School practice).
  // Поступове послаблення фільтрів: спершу точний напрям+складність, далі лише
  // напрям, і як останній засіб — будь-які питання класу (дитина завжди отримує
  // місію, навіть якщо напрям у бандлі ще бідний).
  const MIN = Math.min(DEMO_COUNT, 3)
  const attempts: Array<Parameters<typeof loadStaticQuestions>[1]> = [
    { count: DEMO_COUNT, track: preset.track, difficulty: preset.difficulty },
    { count: DEMO_COUNT, track: preset.track },
    { count: DEMO_COUNT },
  ]
  let picked: Question[] = []
  for (const pick of attempts) {
    try {
      picked = await loadStaticQuestions(selectedGrade, pick)
    } catch {
      picked = []
    }
    if (picked.length >= MIN) break
  }
  return picked.map(stripKeys)
}

async function loadClubQuestions(preset: TrackPreset): Promise<Question[]> {
  if (!lead) throw new Error('Потрібно спершу розблокувати батьківський звіт')
  const byTrack = await loadHomeClubQuestions(lead.id, lead.token, {
    grade: selectedGrade,
    count: DEMO_COUNT,
    track: preset.track,
  })
  if (byTrack.length >= Math.min(DEMO_COUNT, 3)) return byTrack.slice(0, DEMO_COUNT).map(stripKeys)

  const fallback = await loadHomeClubQuestions(lead.id, lead.token, {
    grade: selectedGrade,
    count: DEMO_COUNT,
    track: preset.track,
    difficulty: preset.difficulty,
  })
  return fallback.map(stripKeys)
}

// ── Телеметрія ────────────────────────────────────────────────
// Контракт вимагає timeToAnswerMs і answerChangeCount у кожній події з першого
// релізу. Поточний renderer блокує choice-типи після першого кліку, тож
// answerChangeCount свідомо НЕДОоцінює (рахує лише повторні зміни select-ів у
// match) — безпечний напрям: патерн "невпевненість" не спрацює хибно.
els.options.addEventListener('change', (e) => {
  const t = e.target as HTMLElement
  if (t instanceof HTMLSelectElement) {
    if (t.dataset['touched']) selectTouches++
    else t.dataset['touched'] = '1'
  }
})
els.nextBtn.addEventListener('click', () => {
  questionShownAt = Date.now()
  selectTouches = 0
})

function recordEvent(questionId: string, answer: RawAnswer) {
  events.push({
    questionId,
    answer,
    timeToAnswerMs:    Math.min(Math.max(Date.now() - questionShownAt, 0), 3_600_000),
    answerChangeCount: Math.min(selectTouches, 100),
    position:          events.length,
  })
}

// ── Запуск місії (демо або Club practice) ─────────────────────
async function startDemo(preset: TrackPreset, mode: 'demo' | 'club' = 'demo') {
  const run = ++activeRun
  hide(introEl)
  hide(resultEl)
  errorEl.textContent = ''
  currentTrack = preset
  missionMode = mode
  events = []
  startedAtIso = new Date().toISOString()
  trackStep('practice_start', { track: preset.track })

  show(quizEl)
  setMissionActive(true)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const questions = mode === 'club'
      ? await loadClubQuestions(preset)
      : await loadDemoQuestions(preset)
    if (run !== activeRun) return
    // Authors often put the correct option first — shuffle per run. The server
    // report scores by ORIGINAL indexes, so recorded answers are mapped back.
    const deck = shuffleDeck(questions, `home-${Date.now()}-${Math.random()}`)

    questionShownAt = Date.now()
    selectTouches = 0

    runMission(els, deck.questions, {
      showExplanation: false,
      // Ключів у браузері немає → renderer віддає сиру відповідь. Дитині
      // показуємо нейтральний прогрес, а correctness рахує серверний звіт.
      submitAnswer: (questionId, answer) => {
        recordEvent(questionId, deck.toOriginalAnswer(questionId, answer))
        return Promise.resolve(null)
      },
      onComplete: showCompletion,
    })
  } catch (err) {
    if (run !== activeRun) return
    setMissionActive(false)
    hide(quizEl)
    show(introEl)
    errorEl.textContent = (err as Error).message
  }
}

// ── Вихід з місії посеред проходження ─────────────────────────
// Дитина не має опинятися в пастці: практика не зобовʼязує дійти до кінця.
// Підтвердження показуємо ЛИШЕ коли є що втрачати (є хоч одна відповідь) —
// інакше діалог на першому питанні був би зайвим кроком до виходу.
const exitConfirmEl = $('quiz-exit-confirm')
let releaseExitTrap: (() => void) | null = null

function exitConfirmOpen() { return exitConfirmEl.classList.contains('active') }

function openExitConfirm() {
  exitConfirmEl.classList.add('active')
  releaseExitTrap = createFocusTrap(exitConfirmEl, closeExitConfirm)
}

function closeExitConfirm() {
  if (!exitConfirmOpen()) return
  exitConfirmEl.classList.remove('active')
  releaseExitTrap?.()
  releaseExitTrap = null
}

function requestExit() {
  if (events.length === 0) { exitMission(); return }
  openExitConfirm()
}

function exitMission() {
  closeExitConfirm()
  // Відповіді, що ще летять у runMission, більше не мають малювати екран.
  activeRun += 1
  setMissionActive(false)
  hide(quizEl)
  hide(resultEl)
  events = []
  currentTrack = null
  els.options.innerHTML = ''
  els.feedback.textContent = ''
  els.feedback.className = 'quiz-feedback'
  els.explanation.textContent = ''
  els.explanation.classList.add('hidden')
  els.nextBtn.classList.add('hidden')
  document.body.classList.remove('mission-answered')
  errorEl.textContent = ''
  show(introEl)
  // Фокус повертаємо на кнопку, з якої дитина зайшла в місію.
  lastTrackBtn?.focus()
}

// ── Емоційне завершення + parent gate ─────────────────────────
function showCompletion() {
  setMissionActive(false)
  hide(quizEl)
  els.progressBar.style.width = '100%'
  trackStep('practice_complete', { ...(currentTrack ? { track: currentTrack.track } : {}) })

  $('result-track-label').textContent = currentTrack ? `${currentTrack.label} • ${selectedGrade} клас` : 'Місію завершено!'
  $('result-stars').textContent = '🏆'

  if (missionMode === 'club' && lead) {
    // Club: згода вже є — звіт формується одразу, без повторного gate.
    $('result-message').textContent = 'Місію завершено!'
    hide($('parent-gate'))
    show(resultEl)
    void submitClubReport()
    return
  }

  $('result-message').textContent = 'Місію завершено! Розгорнутий результат чекає у звіті для батьків.'
  // Свідомо без цифр для дитини: рахунок і аналіз — у батьківському звіті.
  hide($('demo-report'))
  hide($('club-block'))
  show($('parent-gate'))
  show(resultEl)
  trackStep('parent_gate_view')
}

async function submitClubReport() {
  if (!lead || !currentTrack) return
  const status = $('club-status')
  status.textContent = 'Готуємо звіт…'
  show($('club-block'))
  try {
    const { report } = await submitHomeMissionReport(lead.id, lead.token, {
      missionId:      `practice-${currentTrack.track}-grade${selectedGrade}`,
      missionVersion: MISSION_VERSION,
      track:          currentTrack.track,
      grade:          selectedGrade as 1 | 2 | 3 | 4,
      startedAt:      startedAtIso,
      finishedAt:     new Date().toISOString(),
      events,
    })
    renderReport(report)
    show($('demo-report'))
  } catch (err) {
    status.textContent = (err as Error).message
  }
  void refreshClubBlock()
}

// ── Rozumko Club: стан доступу і запуск платної практики ──────
async function refreshClubBlock() {
  if (!lead) return
  const block = $('club-block')
  const status = $('club-status')
  const tracksBox = $('club-tracks')
  tracksBox.innerHTML = ''

  let club: HomeClubState
  try {
    club = await getHomeClub(lead.id, lead.token)
  } catch {
    hide(block)
    return
  }

  if (club.hasAccess) {
    const until = club.currentPeriodEnd
      ? ` до ${new Date(club.currentPeriodEnd).toLocaleDateString('uk-UA')}`
      : ''
    status.textContent = `Доступ активний${until}. Обери напрям нової місії:`
    for (const key of club.tracks) {
      const preset = TRACKS[key]
      if (!preset) continue
      const btn = document.createElement('button')
      btn.className = 'btn'
      btn.textContent = preset.label
      btn.addEventListener('click', () => { void startDemo(preset, 'club') })
      tracksBox.appendChild(btn)
    }
  } else {
    status.textContent = club.status === 'none'
      ? 'Повний доступ до регулярної практики відкриється з підпискою Rozumko Club. Ми напишемо на вказаний email, щойно оформлення стане доступним.'
      : 'Доступ до Rozumko Club зараз неактивний. Якщо це виглядає як помилка — напишіть нам.'
  }
  show(block)
}

// ── Parent gate: згода → лід → серверний звіт ─────────────────
async function unlockReport() {
  const email = $<HTMLInputElement>('parent-email').value.trim()
  const consented = $<HTMLInputElement>('parent-consent').checked
  const displayName = $<HTMLInputElement>('child-name').value.trim()
  const gateError = $('gate-error')
  gateError.textContent = ''

  if (!email) { gateError.textContent = 'Вкажіть email'; return }
  if (!consented) { gateError.textContent = 'Потрібна згода на обробку даних'; return }
  if (!currentTrack || events.length === 0) { gateError.textContent = 'Демо-місію ще не пройдено'; return }

  const btn = $<HTMLButtonElement>('gate-submit-btn')
  btn.disabled = true
  btn.textContent = 'Готуємо звіт…'

  try {
    const created = await createHomeLead(
      email,
      { policyVersion: POLICY_VERSION, acceptedAt: new Date().toISOString() },
      { grade: selectedGrade as 1 | 2 | 3 | 4, ...(displayName ? { displayName } : {}) },
    )
    lead = { id: created.leadId, token: created.leadToken }
    const { report, emailSent } = await submitHomeDemoReport(lead.id, lead.token, {
      missionId:      `demo-${currentTrack.track}-grade${selectedGrade}`,
      missionVersion: MISSION_VERSION,
      track:          currentTrack.track,
      grade:          selectedGrade as 1 | 2 | 3 | 4,
      startedAt:      startedAtIso,
      finishedAt:     new Date().toISOString(),
      events,
    })
    // Full analysis travels by email; the page shows a short confirmation.
    // If the letter didn't go out, fall back to the full inline report.
    if (emailSent) renderReportSentConfirmation(report, email)
    else renderReport(report)
    hide($('parent-gate'))
    show($('demo-report'))
    void refreshClubBlock()
  } catch (err) {
    gateError.textContent = (err as Error).message
  } finally {
    btn.disabled = false
    btn.textContent = 'Отримати звіт'
  }
}

function addNode(parent: HTMLElement, tag: string, text: string, className?: string) {
  const el = document.createElement(tag)
  el.textContent = text
  if (className) el.className = className
  parent.appendChild(el)
  return el
}

/** Повний звіт на сторінці: Club-практика і fallback, коли лист не надіслано. */
function renderReport(report: HomeDemoReport) {
  const box = $('demo-report-body')
  box.innerHTML = ''

  addNode(box, 'p', `Виконано: ${report.correct} з ${report.total} завдань.`, 'demo-report__summary')

  const addList = (heading: string, items: string[]) => {
    if (!items.length) return
    addNode(box, 'p', heading, 'demo-report__heading')
    const ul = document.createElement('ul')
    ul.className = 'demo-report__list'
    items.forEach(s => addNode(ul, 'li', s))
    box.appendChild(ul)
  }
  addList('💪 Що виходить добре:', report.strengths)
  addList('🌱 Зона росту:', report.struggles)
  addList('🔍 Що ми помітили:', report.patterns.map(p => p.evidence))
  addNode(box, 'p', `👉 Наступний крок: ${report.nextMission.reason}`, 'demo-report__next')
}

/** Демо-гейт: лист із повним аналізом пішов — на сторінці лише підтвердження. */
function renderReportSentConfirmation(report: HomeDemoReport, email: string) {
  const box = $('demo-report-body')
  box.innerHTML = ''
  addNode(box, 'p', `Виконано: ${report.correct} з ${report.total} завдань.`, 'demo-report__summary')
  addNode(box, 'p', `Повний аналіз — що виходить добре, зона росту й наступний крок — ми надіслали на ${email}.`)
  addNode(box, 'p', 'Якщо листа не видно, зазирніть у «Спам» або «Промоакції».', 'demo-report__muted')
}

// ── Інтро: вибір класу і напряму ──────────────────────────────
function highlightGrade(grade: number) {
  document.querySelectorAll<HTMLElement>('.home-grade-btn').forEach(btn => {
    const active = Number(btn.dataset['grade']) === grade
    btn.setAttribute('aria-pressed', String(active))
  })
  const pathCard = $maybe<HTMLAnchorElement>('home-path-card')
  const pathMeta = $maybe('home-path-card-meta')
  const path = PATHS_BY_GRADE[grade]
  if (pathCard) {
    pathCard.href = path ? `path.html?grade=${path.grade}` : '#'
    pathCard.classList.toggle('mission-card--unavailable', !path)
    pathCard.setAttribute('aria-disabled', String(!path))
  }
  if (pathMeta) {
    pathMeta.textContent = path
      ? `${path.points.length} точок · інформатика, мислення та основи ШІ`
      : `Карта ${grade} класу готується`
  }
  const pathTitle = $maybe('home-path-card-title')
  if (pathTitle) pathTitle.textContent = `Карта пригод · ${grade} клас`
}

document.querySelectorAll<HTMLElement>('.home-grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const grade = Number(btn.dataset['grade'])
    if (grade >= 1 && grade <= 4) {
      selectedGrade = grade
      saveGrade(grade)
      highlightGrade(grade)
    }
  })
})

document.querySelectorAll<HTMLElement>('.home-track-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = TRACKS[btn.dataset['track'] ?? '']
    if (!preset) return
    lastTrackBtn = btn
    startDemo(preset)
  })
})

$maybe<HTMLButtonElement>('quiz-exit-btn')?.addEventListener('click', requestExit)
$maybe<HTMLButtonElement>('quiz-exit-stay')?.addEventListener('click', closeExitConfirm)
$maybe<HTMLButtonElement>('quiz-exit-yes')?.addEventListener('click', exitMission)
// Клік по підкладці = «Продовжити»: безпечний бік для випадкового тапу.
exitConfirmEl.addEventListener('click', (e) => { if (e.target === exitConfirmEl) closeExitConfirm() })
// Escape: у діалозі його ловить focus-trap, у самій місії — відкриває вихід.
// Подію з середини діалогу пропускаємо: focus-trap уже закрив його на цьому ж
// натисканні, і без перевірки той самий Escape відкрив би діалог знову.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || exitConfirmOpen()) return
  if (exitConfirmEl.contains(e.target as Node)) return
  if (!document.body.classList.contains('mission-active')) return
  requestExit()
})

$maybe('demo-retry-btn')?.addEventListener('click', () => {
  hide(resultEl)
  errorEl.textContent = ''
  show(introEl)
})

$maybe<HTMLButtonElement>('gate-submit-btn')?.addEventListener('click', unlockReport)
// Доступ можуть видати після розблокування звіту (зараз — вручну адміном):
// кнопка дає перезапитати стан без перепроходження демо.
$maybe<HTMLButtonElement>('club-refresh-btn')?.addEventListener('click', () => { void refreshClubBlock() })

// Карта — головна дія сторінки; клік по ній рахуємо до переходу.
$maybe<HTMLAnchorElement>('home-path-card')?.addEventListener('click', () => {
  if (!$maybe('home-path-card')?.classList.contains('mission-card--unavailable')) trackStep('path_start')
})

highlightGrade(selectedGrade)
trackStep('home_open')
